const { ChildProfile } = require('../models');

/**
 * 자녀 프로필 생성
 * @param {number} userId - 보호자 user_id
 * @param {object} data - { child_name, age, learning_level, vocabulary_level, profile_image_url }
 */
const create = async (userId, data) => {
  const profile = await ChildProfile.create({
    user_id: userId,
    ...data,
  });
  return profile;
};

/**
 * 특정 보호자의 자녀 프로필 목록 조회
 * @param {number} userId - 보호자 user_id
 */
const getAll = async (userId) => {
  const profiles = await ChildProfile.findAll({
    where: { user_id: userId },
    order: [['created_at', 'ASC']],
  });
  return profiles;
};

/**
 * 자녀 프로필 단건 조회
 * @param {number} userId - 보호자 user_id
 * @param {number} childProfileId - child_profile_id
 */
const getById = async (userId, childProfileId) => {
  const profile = await ChildProfile.findOne({
    where: { child_profile_id: childProfileId, user_id: userId },
  });
  if (!profile) {
    const error = new Error('자녀 프로필을 찾을 수 없습니다.');
    error.statusCode = 404;
    throw error;
  }
  return profile;
};

/**
 * 자녀 프로필 수정
 * @param {number} userId - 보호자 user_id
 * @param {number} childProfileId - child_profile_id
 * @param {object} data - 수정할 필드
 */
const update = async (userId, childProfileId, data) => {
  const profile = await getById(userId, childProfileId);
  await profile.update(data);
  return profile;
};

/**
 * 자녀 프로필 삭제
 * @param {number} userId - 보호자 user_id
 * @param {number} childProfileId - child_profile_id
 */
const remove = async (userId, childProfileId) => {
  const profile = await getById(userId, childProfileId);
  await profile.destroy();
  return { message: '자녀 프로필이 삭제되었습니다.' };
};

/**
 * 활성 프로필 전환 (해당 프로필만 active, 나머지 비활성)
 * @param {number} userId - 보호자 user_id
 * @param {number} childProfileId - 활성화할 child_profile_id
 */
const activate = async (userId, childProfileId) => {
  // 해당 프로필 존재 확인
  const profile = await getById(userId, childProfileId);

  // 해당 유저의 모든 프로필 비활성화
  await ChildProfile.update(
    { is_active: false },
    { where: { user_id: userId } }
  );

  // 선택한 프로필만 활성화
  await profile.update({ is_active: true });

  return profile;
};

module.exports = {
  create,
  getAll,
  getById,
  update,
  remove,
  activate,
};
