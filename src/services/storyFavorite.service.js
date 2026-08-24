const { StoryFavorite } = require('../models');
const childService = require('./child.service');

/**
 * 즐겨찾기 등록 (소유권 검증 포함, idempotent)
 * 이미 등록돼 있으면 새로 만들지 않고 alreadyFavorited: true만 반환한다.
 * @param {number} userId
 * @param {number} childProfileId
 * @param {number} storyId
 */
const addFavorite = async (userId, childProfileId, storyId) => {
  await childService.getById(userId, childProfileId); // 소유권 검증, 미소유/미존재 시 404

  const [favorite, created] = await StoryFavorite.findOrCreate({
    where: { child_profile_id: childProfileId, story_id: storyId },
    defaults: { created_at: new Date() },
  });

  return { alreadyFavorited: !created, favorite };
};

/**
 * 즐겨찾기 해제 (소유권 검증 포함, idempotent)
 * @param {number} userId
 * @param {number} childProfileId
 * @param {number} storyId
 */
const removeFavorite = async (userId, childProfileId, storyId) => {
  await childService.getById(userId, childProfileId);

  const deletedCount = await StoryFavorite.destroy({
    where: { child_profile_id: childProfileId, story_id: storyId },
  });

  return { removed: deletedCount > 0 };
};

module.exports = { addFavorite, removeFavorite };