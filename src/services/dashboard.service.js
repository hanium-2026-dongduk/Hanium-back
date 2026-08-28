const pool = require('../config/db');
const { VocabularyEntry, QuizAttempt } = require('../models');
const { fn, col } = require('sequelize');
const childService = require('./child.service');

/**
 * MN01 핵심 기능 위젯용 요약 데이터.
 * Week3 A 설계문서에서 "Dev B 데이터 의존이라 범위 밖"으로 미뤄뒀던
 * MP03_STAT_02~04(읽은 동화 수, 퀴즈 정답률)를 여기서 함께 책임진다.
 */
async function getSummary(userId, childProfileId) {
  await childService.getById(userId, childProfileId);

  const [storyCountResult] = await pool.execute(
    `SELECT COUNT(*) AS count FROM stories WHERE child_profile_id = ?`,
    [childProfileId]
  );
  const [favoriteCountResult] = await pool.execute(
    `SELECT COUNT(*) AS count FROM story_favorites WHERE child_profile_id = ?`,
    [childProfileId]
  );

  const vocabularyCount = await VocabularyEntry.count({
    where: { child_profile_id: childProfileId },
  });

  const quizStatsRow = await QuizAttempt.findOne({
    attributes: [
      [fn('COUNT', col('quiz_attempt_id')), 'totalAttempts'],
      [fn('AVG', col('score')), 'averageScore'],
      [fn('MAX', col('submitted_at')), 'lastAttemptAt'],
    ],
    where: { child_profile_id: childProfileId },
    raw: true,
  });

  return {
    storyCount: storyCountResult[0].count,
    favoriteStoryCount: favoriteCountResult[0].count,
    vocabularyCount,
    quizStats: {
      totalAttempts: Number(quizStatsRow.totalAttempts) || 0,
      averageScore: quizStatsRow.averageScore ? Math.round(Number(quizStatsRow.averageScore) * 10) / 10 : 0,
      lastAttemptAt: quizStatsRow.lastAttemptAt || null,
    },
  };
}

module.exports = { getSummary };