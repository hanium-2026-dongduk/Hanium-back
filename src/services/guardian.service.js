const bcrypt = require('bcrypt');
const { GuardianSetting, User, sequelize } = require('../models');
const {
  generateGuardianToken,
  GUARDIAN_TOKEN_EXPIRES_IN,
  verifyGuardianToken,
  generateReauthToken,
  REAUTH_TOKEN_EXPIRES_IN,
  isValidReauthToken,
} = require('../utils/jwt');

const PIN_SALT_ROUNDS = 10;
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_MINUTES = 10;
const MAX_REAUTH_ATTEMPTS = 5;
const REAUTH_LOCKOUT_MINUTES = 10;

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
 * 주어진 guardianToken이 지금 이 순간 이 userId에 대해 유효한지 확인한다.
 *
 * 서명/만료/타입은 jwt.js의 verifyGuardianToken이 담당하고, 여기서는 그 위에
 * "DB의 현재 pin_version과 토큰 발급 시점의 pin_version이 같은가"까지 확인한다.
 * guardianToken은 stateless JWT라 발급 후 최대 10분간 서버가 강제로 폐기할 방법이
 * 없는데, PIN이 그 사이에 바뀌면(=pin_version 증가) 이 비교가 실패해 즉시 무효가
 * 된다. 미들웨어(guardianAuth.js)와 서비스(setPin) 양쪽에서 이 함수 하나만
 * 사용하도록 해, 검증 로직이 두 곳에서 따로 구현되다 하나가 낡아 우회 경로가
 * 생기는 것을 방지한다.
 *
 * @param {string} token
 * @param {number} userId
 * @returns {Promise<boolean>}
 */
const isGuardianTokenValid = async (token, userId) => {
  if (!token) return false;

  let decoded;
  try {
    decoded = verifyGuardianToken(token);
  } catch {
    return false;
  }

  if (decoded.user_id !== userId) return false;

  const setting = await GuardianSetting.findOne({ where: { user_id: userId } });
  if (!setting) return false;

  return decoded.pin_version === setting.pin_version;
};

/**
 * PIN 설정/변경
 *
 * 최초 설정이든 기존 PIN 변경이든 **항상** 재인증이 필요하다 — "최초 설정은
 * 재인증 없이 가능"했던 이전 정책은 자녀와 보호자가 같은 로그인 세션(accessToken)을
 * 쓰는 이 서비스 구조상, 자녀가 access token만으로 원하는 PIN을 최초 설정 →
 * 그 PIN을 검증 → guardianToken 발급 → 보호자 설정 변경까지 완주할 수 있는
 * 권한 상승 경로였다. 지금은 아래 둘 중 하나로만 재인증할 수 있다:
 *
 *   - guardianToken (X-Guardian-Token 헤더): 이미 올바른 PIN을 검증한 상태 —
 *     PIN이 아직 없는 최초 설정에서는 애초에 발급될 수 없으므로 이 경로로는
 *     최초 설정을 통과할 수 없다.
 *   - reauthToken (X-Reauth-Token 헤더): POST /api/guardian/reauth에서 계정
 *     비밀번호를 확인해야만 발급된다.
 *
 * "최초 설정인지 변경인지"는 클라이언트가 지정하지 않는다 — DB에 parent_pin_hash가
 * 있는지만으로 서버가 판단하며, 그 판단은 재인증 필요 여부에 영향을 주지 않는다
 * (어느 쪽이든 위 두 토큰 중 하나가 필요하다는 점은 동일).
 *
 * 계정 비밀번호는 이 함수에서 직접 비교하지 않는다(과거에는 `password` 필드를
 * 받아 bcrypt.compare를 반복할 수 있었는데, 유효한 access token만 있으면 이
 * 엔드포인트를 비밀번호 대입 oracle로 쓸 수 있는 문제가 있었다). 비밀번호 확인은
 * requestReauth() 하나로 좁혀 그곳에만 실패 횟수 제한/잠금을 집중시킨다.
 *
 * 성공 시 pin_version을 증가시켜, 이 시점 이전에 발급된 모든 guardianToken을
 * 즉시 무효화한다.
 *
 * @param {number} userId
 * @param {object} params - { pin, guardianToken, reauthToken }
 */
const setPin = async (userId, { pin, guardianToken, reauthToken }) => {
  const setting = await getOrCreate(userId);

  const reauthenticated =
    (await isGuardianTokenValid(guardianToken, userId)) || isValidReauthToken(reauthToken, userId);

  if (!reauthenticated) {
    const error = new Error(
      'PIN을 설정/변경하려면 보호자 인증(PIN 확인) 또는 비밀번호 재인증(POST /api/guardian/reauth)이 필요합니다.'
    );
    error.statusCode = 401;
    throw error;
  }

  setting.parent_pin_hash = await bcrypt.hash(pin, PIN_SALT_ROUNDS);
  setting.pin_failed_attempts = 0;
  setting.pin_locked_until = null;
  setting.pin_version += 1;
  await setting.save();

  return { message: 'PIN이 설정되었습니다.' };
};

/**
 * PIN 검증
 *
 * 실패 횟수를 트랜잭션 + 행 잠금(FOR UPDATE)으로 증가시켜 동시 요청으로 인한
 * 카운트 유실을 막는다(email 인증번호 attempts와 동일한 패턴). 연속 5회 실패 시
 * 10분간 잠긴다. 성공 시에는 보호자 전용 기능 게이트(requireGuardianToken)가
 * 요구하는 단기 guardianToken을 함께 발급한다 — 단순히 verified:true를 반환하는
 * 것만으로는 이후 보호자 전용 API를 실제로 보호하지 못하기 때문이다. 발급되는
 * guardianToken에는 현재 pin_version을 함께 실어, PIN이 바뀌면 이 토큰이 즉시
 * 무효화되도록 한다(isGuardianTokenValid 참고).
 *
 * @param {number} userId
 * @param {string} pin
 * @returns {object} { verified: true, guardianToken, expiresIn }
 */
const verifyPin = async (userId, pin) => {
  const outcome = await sequelize.transaction(async (t) => {
    const setting = await GuardianSetting.findOne({
      where: { user_id: userId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!setting || !setting.parent_pin_hash) {
      return { status: 'not_set' };
    }

    if (setting.pin_locked_until && new Date() < new Date(setting.pin_locked_until)) {
      return { status: 'locked', lockedUntil: setting.pin_locked_until };
    }

    const isMatch = await bcrypt.compare(pin, setting.parent_pin_hash);

    if (!isMatch) {
      setting.pin_failed_attempts += 1;
      let justLocked = false;
      if (setting.pin_failed_attempts >= MAX_PIN_ATTEMPTS) {
        setting.pin_locked_until = new Date(Date.now() + PIN_LOCKOUT_MINUTES * 60 * 1000);
        justLocked = true;
      }
      await setting.save({ transaction: t });
      return justLocked
        ? { status: 'locked', lockedUntil: setting.pin_locked_until }
        : { status: 'mismatch' };
    }

    setting.pin_failed_attempts = 0;
    setting.pin_locked_until = null;
    await setting.save({ transaction: t });
    return { status: 'ok', pinVersion: setting.pin_version };
  });

  if (outcome.status === 'not_set') {
    const error = new Error('PIN이 설정되지 않았습니다. 먼저 PIN을 설정해주세요.');
    error.statusCode = 400;
    throw error;
  }

  if (outcome.status === 'locked') {
    const error = new Error('PIN 시도 횟수를 초과하여 잠겼습니다. 잠시 후 다시 시도해주세요.');
    error.statusCode = 429;
    error.lockedUntil = outcome.lockedUntil;
    throw error;
  }

  if (outcome.status === 'mismatch') {
    const error = new Error('PIN이 일치하지 않습니다.');
    error.statusCode = 401;
    throw error;
  }

  const guardianToken = generateGuardianToken({ user_id: userId, pin_version: outcome.pinVersion });
  return { verified: true, guardianToken, expiresIn: GUARDIAN_TOKEN_EXPIRES_IN };
};

/**
 * 비밀번호 재인증 — 계정 비밀번호를 한 번 확인하고 짧은 수명의 reauthToken을 발급한다.
 *
 * PIN 설정/변경(setPin)이 더 이상 비밀번호를 직접 비교하지 않으므로, "계정 비밀번호를
 * 아는지" 확인하는 경로는 이 함수 하나로 좁혀진다. 실패 횟수를 DB(guardian_settings.
 * reauth_failed_attempts/reauth_locked_until)에 트랜잭션 + 행 잠금으로 기록해, 유효한
 * access token을 가진 공격자가 이 엔드포인트를 비밀번호 확인 oracle로 무제한 사용하는
 * 것을 막는다. 메모리 내 카운터(Map 등)를 쓰지 않는 이유: 프로세스가 재시작되거나
 * 여러 인스턴스로 수평 확장되면 카운트가 유실/분산되어 잠금이 무력화된다.
 *
 * @param {number} userId
 * @param {string} password - 계정 비밀번호
 * @returns {object} { reauthToken, expiresIn }
 */
const requestReauth = async (userId, password) => {
  await getOrCreate(userId);

  const outcome = await sequelize.transaction(async (t) => {
    const setting = await GuardianSetting.findOne({
      where: { user_id: userId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (setting.reauth_locked_until && new Date() < new Date(setting.reauth_locked_until)) {
      return { status: 'locked', lockedUntil: setting.reauth_locked_until };
    }

    const user = await User.findByPk(userId, { transaction: t });
    const isMatch = user ? await bcrypt.compare(password, user.password_hash) : false;

    if (!isMatch) {
      setting.reauth_failed_attempts += 1;
      let justLocked = false;
      if (setting.reauth_failed_attempts >= MAX_REAUTH_ATTEMPTS) {
        setting.reauth_locked_until = new Date(Date.now() + REAUTH_LOCKOUT_MINUTES * 60 * 1000);
        justLocked = true;
      }
      await setting.save({ transaction: t });
      return justLocked
        ? { status: 'locked', lockedUntil: setting.reauth_locked_until }
        : { status: 'mismatch' };
    }

    setting.reauth_failed_attempts = 0;
    setting.reauth_locked_until = null;
    await setting.save({ transaction: t });
    return { status: 'ok' };
  });

  if (outcome.status === 'locked') {
    const error = new Error('비밀번호 확인 시도 횟수를 초과하여 잠겼습니다. 잠시 후 다시 시도해주세요.');
    error.statusCode = 429;
    error.lockedUntil = outcome.lockedUntil;
    throw error;
  }

  if (outcome.status === 'mismatch') {
    const error = new Error('비밀번호가 일치하지 않습니다.');
    error.statusCode = 401;
    throw error;
  }

  const reauthToken = generateReauthToken({ user_id: userId });
  return { reauthToken, expiresIn: REAUTH_TOKEN_EXPIRES_IN };
};

/**
 * 보호자 설정 업데이트 (사용 시간 제한, 푸시 알림 등)
 * 라우트 레벨에서 requireGuardianToken으로 보호된다(PIN 재검증 필요).
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
  // PIN hash / 잠금 카운터 / 내부 버전 값은 반환하지 않음
  const settingJson = setting.toJSON();
  const hasPin = !!settingJson.parent_pin_hash;
  delete settingJson.parent_pin_hash;
  delete settingJson.pin_failed_attempts;
  delete settingJson.pin_locked_until;
  delete settingJson.pin_version;
  delete settingJson.reauth_failed_attempts;
  delete settingJson.reauth_locked_until;
  return { ...settingJson, has_pin: hasPin };
};

module.exports = {
  setPin,
  verifyPin,
  requestReauth,
  updateSettings,
  getSettings,
  isGuardianTokenValid,
};
