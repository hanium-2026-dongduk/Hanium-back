const pool = require('../config/db');
const childService = require('./child.service');

/** 생성이 끝난 퀴즈의 문제와 보기를 반환한다. 정답 여부는 제출 전 노출하지 않는다. */
const getQuiz = async (userId, childProfileId, quizSetId) => {
  await childService.getById(userId, childProfileId);

  const [quizSets] = await pool.execute(
    `SELECT qs.quiz_set_id, qs.status
       FROM quiz_sets qs
       JOIN stories s ON s.story_id = qs.story_id
      WHERE qs.quiz_set_id = ? AND s.child_profile_id = ?`,
    [quizSetId, childProfileId]
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

module.exports = { getQuiz };
