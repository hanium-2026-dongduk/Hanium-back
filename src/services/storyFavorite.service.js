const { StoryFavorite } = require('../models');
const pool = require('../config/db');
const childService = require('./child.service');

/**
 * story가 실제로 이 childProfileId 소유인지 확인한다.
 * (리뷰 지적사항: 자녀 소유권만 확인하고 storyId가 그 자녀 소유인지는 검증하지 않아
 * 타 자녀의 동화를 즐겨찾기에 연결할 수 있었던 문제 수정)
 */
const verifyStoryOwnership = async (childProfileId, storyId) => {
  const [rows] = await pool.execute(
    `SELECT story_id FROM stories WHERE story_id = ? AND child_profile_id = ?`,
    [storyId, childProfileId]
  );
  if (rows.length === 0) {
    const error = new Error('동화를 찾을 수 없습니다.');
    error.statusCode = 404;
    throw error;
  }
};

/**
 * 즐겨찾기 등록 (자녀 소유권 + 동화 소유권 검증 포함, idempotent)
 * 이미 등록돼 있으면 새로 만들지 않고 alreadyFavorited: true만 반환한다.
 * @param {number} userId
 * @param {number} childProfileId
 * @param {number} storyId
 */
const addFavorite = async (userId, childProfileId, storyId) => {
  await childService.getById(userId, childProfileId); // 자녀 소유권 검증, 미소유/미존재 시 404
  await verifyStoryOwnership(childProfileId, storyId); // 동화 소유권 검증

  const [favorite, created] = await StoryFavorite.findOrCreate({
    where: { child_profile_id: childProfileId, story_id: storyId },
    defaults: { created_at: new Date() },
  });

  return { alreadyFavorited: !created, favorite };
};

/**
 * 즐겨찾기 해제 (자녀 소유권 + 동화 소유권 검증 포함, idempotent)
 * @param {number} userId
 * @param {number} childProfileId
 * @param {number} storyId
 */
const removeFavorite = async (userId, childProfileId, storyId) => {
  await childService.getById(userId, childProfileId);
  await verifyStoryOwnership(childProfileId, storyId);

  const deletedCount = await StoryFavorite.destroy({
    where: { child_profile_id: childProfileId, story_id: storyId },
  });

  return { removed: deletedCount > 0 };
};

module.exports = { addFavorite, removeFavorite };