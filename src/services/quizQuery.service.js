const pool = require('../config/db');
const childService = require('./child.service');

/** 생성이 끝난 퀴즈의 문제와 보기를 반환한다. 정답 여부는 제출 전 노출하지 않는다. */
const getQuiz = async (userId, childProfileId, quizSetId) => {
  await childService.getById(userId, childProfileId);

  // INNER JOIN stories만 쓰면 단어장 기반(story_id NULL) 퀴즈는 절대 매치되지 않는다
  // (NULL = qs.story_id 비교는 항상 거짓). 반대로 quiz_sets.child_profile_id만 쓰면,
  // 그 컬럼이 비어있는 story 기반 quiz_set(예: 0034 이전 데이터나 테스트 픽스처처럼
  // QuizSet을 직접 생성해 child_profile_id를 안 채운 경우)을 못 찾는다.
  // 그래서 LEFT JOIN으로 story를 "있으면" 같이 보되, 소유권은 quiz_sets.child_profile_id
  // 또는 story의 child_profile_id 둘 중 하나라도 맞으면 통과시킨다.
  const [quizSets] = await pool.execute(
    `SELECT qs.quiz_set_id, qs.status
       FROM quiz_sets qs
       LEFT JOIN stories s ON s.story_id = qs.story_id
      WHERE qs.quiz_set_id = ?
        AND (qs.child_profile_id = ? OR s.child_profile_id = ?)`,
    [quizSetId, childProfileId, childProfileId]
  );

  if (quizSets.length === 0) {
    const error = new Error('퀴즈를 찾을 수 없습니다.');
    error.statusCode = 404;
    throw error;
  }

  const [rows] = await pool.execute(
    `SELECT qq.quiz_question_id, qq.question_order, qq.question_text,
            qo.quiz_option_id, qo.option_order, qo.option_text
       FROM quiz_questions qq
       JOIN quiz_options qo ON qo.quiz_question_id = qq.quiz_question_id
      WHERE qq.quiz_set_id = ?
      ORDER BY qq.question_order ASC, qo.option_order ASC`,
    [quizSetId]
  );

  const questionsById = new Map();
  for (const row of rows) {
    if (!questionsById.has(row.quiz_question_id)) {
      questionsById.set(row.quiz_question_id, {
        questionId: row.quiz_question_id,
        questionOrder: row.question_order,
        questionText: row.question_text,
        options: [],
      });
    }
    questionsById.get(row.quiz_question_id).options.push({
      optionId: row.quiz_option_id,
      optionOrder: row.option_order,
      optionText: row.option_text,
    });
  }

  return {
    quizSetId: quizSets[0].quiz_set_id,
    status: quizSets[0].status,
    questions: [...questionsById.values()],
  };
};

/** storyId 기준으로 해당 스토리의 퀴즈를 조회한다 (quizSetId를 몰라도 조회 가능하게). */
const getQuizByStory = async (userId, childProfileId, storyId) => {
  await childService.getById(userId, childProfileId);

  const [quizSets] = await pool.execute(
    `SELECT qs.quiz_set_id, qs.status
       FROM quiz_sets qs
       JOIN stories s ON s.story_id = qs.story_id
      WHERE qs.story_id = ? AND s.child_profile_id = ?`,
    [storyId, childProfileId]
  );
  if (quizSets.length === 0) {
    const error = new Error('해당 동화의 퀴즈를 찾을 수 없습니다.');
    error.statusCode = 404;
    throw error;
  }

  return getQuiz(userId, childProfileId, quizSets[0].quiz_set_id);
};

module.exports = { getQuiz, getQuizByStory };
