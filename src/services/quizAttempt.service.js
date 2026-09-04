const { QuizAttempt, QuizQuestion, QuizOption } = require('../models');
const childService = require('./child.service');
const rewardService = require('./reward.service');
const missionService = require('./mission.service'); // A의 Week3 산출물
const badgeService = require('./badge.service'); // A의 Week4 산출물
const { withTransaction } = require('../utils/dbRetry');

const POINTS_PER_CORRECT_ANSWER = 5; // 임시값, 기획 확정 필요

async function submitAttempt({ userId, childProfileId, quizSetId, answers }) {
  await childService.getById(userId, childProfileId);

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

    // Week3 A 설계문서 6절 계약: 미션 진행도도 같은 트랜잭션에서 갱신
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