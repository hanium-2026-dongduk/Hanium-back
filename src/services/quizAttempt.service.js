const { QuizAttempt, QuizQuestion, QuizOption } = require('../models');
const { Op } = require('sequelize');
const childService = require('./child.service');
const rewardService = require('./reward.service');
const missionService = require('./mission.service'); // A의 Week3 산출물
const { withTransaction } = require('../utils/dbRetry');
const badgeService = require('./badge.service');

// 정책 확정값. 퀴즈 참여 미션(20점)과 별개로 정답 정확도에 보상한다.
const POINTS_PER_CORRECT_ANSWER = 5;

// 네트워크 재시도로 인한 "동일 제출" 중복 처리 방지용 시간창(초).
// 프론트가 Idempotency-Key를 아직 안 보내는 상황에서의 임시 방어책 — 같은 자녀가
// 같은 퀴즈셋에 "완전히 같은 답안"으로 이 시간 안에 다시 제출하면 재시도로 간주하고
// 기존 결과를 그대로 돌려준다(재채점/재적립 없음). 아이가 실제로 "다시 풀기"를 누르는
// 경우는 결과 확인 후 눌러서 이 시간창보다 늦게 들어오므로 정상적으로 새 시도로 처리된다.
const DUPLICATE_SUBMIT_WINDOW_SECONDS = 10;

function normalizeAnswers(answers) {
  return [...answers]
    .map((a) => ({
      questionId: Number(a.questionId),
      selectedOptionId: a.selectedOptionId == null ? null : Number(a.selectedOptionId),
    }))
    .sort((a, b) => a.questionId - b.questionId);
}

async function findRecentDuplicateAttempt(childProfileId, quizSetId, answers) {
  const cutoff = new Date(Date.now() - DUPLICATE_SUBMIT_WINDOW_SECONDS * 1000);

  const recentAttempts = await QuizAttempt.findAll({
    where: {
      child_profile_id: childProfileId,
      quiz_set_id: quizSetId,
      submitted_at: { [Op.gte]: cutoff },
    },
    order: [['submitted_at', 'DESC']],
  });

  if (recentAttempts.length === 0) return null;

  const incomingSignature = JSON.stringify(normalizeAnswers(answers));

  return (
    recentAttempts.find((attempt) => {
      const storedSignature = JSON.stringify(normalizeAnswers(attempt.answers));
      return storedSignature === incomingSignature;
    }) || null
  );
}

async function submitAttempt({ userId, childProfileId, quizSetId, answers }) {
  await childService.getById(userId, childProfileId);

  // 재시도로 인한 중복 제출 방어 — 채점/트랜잭션 시작 전에 먼저 확인한다.
  const duplicate = await findRecentDuplicateAttempt(childProfileId, quizSetId, answers);
  if (duplicate) {
    return {
      attemptId: duplicate.quiz_attempt_id,
      totalQuestions: duplicate.total_questions,
      correctCount: duplicate.correct_count,
      score: duplicate.score,
      answers: duplicate.answers,
      pointsEarned: 0, // 이미 원본 제출에서 지급됨 — 재지급하지 않음
      leveledUp: false,
      alreadySubmitted: true,
    };
  }

  const questions = await QuizQuestion.findAll({
    where: { quiz_set_id: quizSetId },
    include: [{ model: QuizOption }],
  });

  if (questions.length === 0) {
    const error = new Error('퀴즈를 찾을 수 없습니다.');
    error.statusCode = 404;
    throw error;
  }

  let correctCount = 0;
  const gradedAnswers = questions.map((q) => {
    const submitted = answers.find((a) => a.questionId === q.quiz_question_id);
    const correctOption = q.QuizOptions?.find((o) => o.is_correct) || null;
    const isCorrect = !!submitted && correctOption && submitted.selectedOptionId === correctOption.quiz_option_id;
    if (isCorrect) correctCount += 1;

    return {
      questionId: q.quiz_question_id,
      selectedOptionId: submitted ? submitted.selectedOptionId : null,
      correctOptionId: correctOption ? correctOption.quiz_option_id : null,
      isCorrect,
    };
  });

  const totalQuestions = questions.length;
  const score = Math.round((correctCount / totalQuestions) * 100);
  const pointsEarned = correctCount * POINTS_PER_CORRECT_ANSWER;

  const result = await withTransaction(undefined, async (t) => {
    const attempt = await QuizAttempt.create(
      {
        child_profile_id: childProfileId,
        quiz_set_id: quizSetId,
        total_questions: totalQuestions,
        correct_count: correctCount,
        score,
        answers: gradedAnswers,
        submitted_at: new Date(),
      },
      { transaction: t }
    );

    let rewardResult = { alreadyProcessed: false, pointsAdded: 0, leveledUp: false };
    if (pointsEarned > 0) {
      rewardResult = await rewardService.addPoints({
        childProfileId,
        points: pointsEarned,
        reason: 'quiz_answered',
        idempotencyKey: `quiz_attempt:${attempt.quiz_attempt_id}`,
        metadata: { quizSetId, correctCount, totalQuestions },
        transaction: t,
      });
    }

    await missionService.recordProgress({
      childProfileId,
      eventType: 'quiz_answered',
      eventId: `quiz_attempt:${attempt.quiz_attempt_id}`,
      transaction: t,
    });

    return {
      attemptId: attempt.quiz_attempt_id,
      totalQuestions,
      correctCount,
      score,
      answers: gradedAnswers,
      pointsEarned: rewardResult.pointsAdded,
      leveledUp: rewardResult.leveledUp,
    };
  });

  // 배지 판정은 트랜잭션 밖, 커밋 후 호출 (A 문서: "트랜잭션 안에서 부르지 마세요 —
  // 배지 판정 실패가 본래 동작을 롤백시킵니다"). 실패해도 예외를 삼키고 [] 반환.
  const badgesAwarded = await badgeService.evaluateQuietly(childProfileId);
  return { ...result, badgesAwarded };
}

async function listAttempts(userId, childProfileId, { page = 1, limit = 20 } = {}) {
  await childService.getById(userId, childProfileId);

  const { count, rows } = await QuizAttempt.findAndCountAll({
    where: { child_profile_id: childProfileId },
    order: [['submitted_at', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  });

  return {
    items: rows.map((r) => ({
      attemptId: r.quiz_attempt_id,
      quizSetId: r.quiz_set_id,
      score: r.score,
      correctCount: r.correct_count,
      totalQuestions: r.total_questions,
      submittedAt: r.submitted_at,
    })),
    pagination: { page, limit, totalCount: count, totalPages: Math.max(1, Math.ceil(count / limit)) },
  };
}

async function getAttemptDetail(userId, attemptId) {
  const attempt = await QuizAttempt.findByPk(attemptId);
  if (!attempt) {
    const error = new Error('풀이 기록을 찾을 수 없습니다.');
    error.statusCode = 404;
    throw error;
  }
  await childService.getById(userId, attempt.child_profile_id);

  return {
    attemptId: attempt.quiz_attempt_id,
    quizSetId: attempt.quiz_set_id,
    score: attempt.score,
    correctCount: attempt.correct_count,
    totalQuestions: attempt.total_questions,
    answers: attempt.answers,
    submittedAt: attempt.submitted_at,
  };
}

module.exports = { submitAttempt, listAttempts, getAttemptDetail };