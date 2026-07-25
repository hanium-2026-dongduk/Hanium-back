const bcrypt = require('bcrypt');
const { GuardianSetting } = require('../models');

const PIN_SALT_ROUNDS = 10;

/**
 * 보호자 설정 조회 (없으면 생성)
 */
const getOrCreate = async (userId) => {
  let setting = await GuardianSetting.findOne({ where: { user_id: userId } });
  if (!setting) {
    setting = await GuardianSetting.create({ user_id: userId });
  }
  return setting;
};

/**
 * PIN 설정/변경
 * @param {number} userId
 * @param {string} pin - 4~6자리 숫자
 */
const setPin = async (userId, pin) => {
  const setting = await getOrCreate(userId);
  setting.parent_pin_hash = await bcrypt.hash(pin, PIN_SALT_ROUNDS);
  await setting.save();
  return { message: 'PIN이 설정되었습니다.' };
};

/**
 * PIN 검증
 * @param {number} userId
 * @param {string} pin
 * @returns {object} { verified: boolean }
 */
const verifyPin = async (userId, pin) => {
  const setting = await GuardianSetting.findOne({ where: { user_id: userId } });

  if (!setting || !setting.parent_pin_hash) {
    const error = new Error('PIN이 설정되지 않았습니다. 먼저 PIN을 설정해주세요.');
    error.statusCode = 400;
    throw error;
  }

  const isMatch = await bcrypt.compare(pin, setting.parent_pin_hash);
  if (!isMatch) {
    const error = new Error('PIN이 일치하지 않습니다.');
    error.statusCode = 401;
    throw error;
  }

  return { verified: true };
};

/**
 * 보호자 설정 업데이트 (사용 시간 제한, 푸시 알림 등)
 * @param {number} userId
 * @param {object} data - { daily_usage_limit_minutes, push_enabled }
 */
const updateSettings = async (userId, data) => {
  const setting = await getOrCreate(userId);
  await setting.update(data);
  return setting;
};

/**
 * 보호자 설정 조회
 * @param {number} userId
 */
const getSettings = async (userId) => {
  const setting = await getOrCreate(userId);
  // PIN hash는 반환하지 않음
  const { parent_pin_hash, ...settingData } = setting.toJSON();
  return { ...settingData, has_pin: !!parent_pin_hash };
};

module.exports = {
  setPin,
  verifyPin,
  updateSettings,
  getSettings,
};
