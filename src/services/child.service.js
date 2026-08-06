const { ChildProfile, User, sequelize } = require('../models');

const ALLOWED_UPDATE_FIELDS = ['child_name', 'age', 'learning_level', 'vocabulary_level', 'profile_image_url'];

/**
 * data에서 허용된 필드 중 값이 정의된 것만 골라낸다.
 * (허용되지 않은 필드가 실려와도 무시되고, undefined 필드는 "수정하지 않음"으로 취급한다)
 */
const pickDefinedFields = (data, allowedFields) => {
  const result = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      result[key] = data[key];
    }
  }
  return result;
};

/**
 * 자녀 프로필 생성
 *
 * 같은 유저에게 활성 프로필이 동시에 2개 이상 생기는 것을 막기 위해, 유저 행에
 * FOR UPDATE 잠금을 걸어 동일 유저의 동시 생성 요청을 직렬화한 뒤 기존 프로필
 * 개수를 센다. 정책: 유저의 "최초" 프로필만 자동으로 활성화되고, 이후 생성되는
 * 프로필은 비활성 상태로 만들어진다(활성 전환은 명시적으로 /activate 호출 필요).
 *
 * @param {number} userId - 보호자 user_id
 * @param {object} data - { child_name, age, learning_level, vocabulary_level, profile_image_url }
 */
const create = async (userId, data) => {
  return sequelize.transaction(async (t) => {
    await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });

    const existingCount = await ChildProfile.count({ where: { user_id: userId }, transaction: t });

    const profile = await ChildProfile.create(
      {
        user_id: userId,
        ...data,
        is_active: existingCount === 0,
      },
      { transaction: t }
    );

    return profile;
  });
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
 * 자녀 프로필 단건 조회 (소유권 검증 포함)
 * 다른 유저의 프로필이거나 존재하지 않으면 동일하게 404를 반환해
 * "이 id가 누군가의 프로필이긴 하다"는 사실조차 노출하지 않는다.
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
 * 허용된 필드만 반영하며, 반영할 필드가 하나도 없으면(빈 PUT) 400을 던진다.
 * @param {number} userId - 보호자 user_id
 * @param {number} childProfileId - child_profile_id
 * @param {object} data - 수정할 필드 (허용 목록 외는 무시됨)
 */
const update = async (userId, childProfileId, data) => {
  const fields = pickDefinedFields(data, ALLOWED_UPDATE_FIELDS);

  if (Object.keys(fields).length === 0) {
    const error = new Error('수정할 필드가 없습니다.');
    error.statusCode = 400;
    throw error;
  }

  const profile = await getById(userId, childProfileId);
  await profile.update(fields);
  return profile;
};

/**
 * 자녀 프로필 삭제
 *
 * 정책: 활성 프로필을 삭제해도 다른 프로필을 자동으로 활성화하지 않는다.
 * (AU04_PROFILE_01 "프로필 선택(없는 경우 생성으로)" 흐름과 동일하게, 활성 프로필이
 * 없는 상태는 정상 상태이며 클라이언트가 명시적으로 다시 선택/활성화해야 한다.)
 *
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
 *
 * 유저 행에 FOR UPDATE 잠금을 걸어 동일 유저에 대한 동시 활성화 요청을 직렬화하고,
 * "대상 외 전체 비활성화 → 대상 활성화"를 하나의 트랜잭션으로 묶어 중간 상태(둘 다
 * 비활성이거나 둘 다 활성인 상태)가 관측되지 않게 한다. DB에도 child_profiles의
 * 생성 컬럼(active_owner_id) + UNIQUE 인덱스로 "유저당 활성 1개"를 이중으로 강제한다
 * (db/migrations/0003_child_profiles_single_active_constraint.sql 참고).
 *
 * @param {number} userId - 보호자 user_id
 * @param {number} childProfileId - 활성화할 child_profile_id
 */
const activate = async (userId, childProfileId) => {
  return sequelize.transaction(async (t) => {
    await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });

    const profile = await ChildProfile.findOne({
      where: { child_profile_id: childProfileId, user_id: userId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!profile) {
      const error = new Error('자녀 프로필을 찾을 수 없습니다.');
      error.statusCode = 404;
      throw error;
    }

    await ChildProfile.update(
      { is_active: false },
      { where: { user_id: userId }, transaction: t }
    );

    profile.is_active = true;
    await profile.save({ transaction: t });

    return profile;
  });
};

module.exports = {
  create,
  getAll,
  getById,
  update,
  remove,
  activate,
};
