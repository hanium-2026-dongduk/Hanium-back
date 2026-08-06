const bcrypt = require('bcrypt');
const { User, EmailVerification, RefreshToken, sequelize } = require('../models');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/mailer');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');

const SALT_ROUNDS = 12;
const VERIFICATION_EXPIRY_MINUTES = 5;
const REFRESH_TOKEN_DAYS = 7;
const MAX_VERIFICATION_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

const PURPOSE_SIGNUP = 'signup';
const PURPOSE_PASSWORD_RESET = 'password_reset';

/**
 * 6자리 인증번호 생성
 */
const generateCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * 회원가입
 * @param {object} params - { email, password }
 * @returns {object} 생성된 사용자 정보 (password_hash 제외)
 */
const signup = async ({ email, password }) => {
  // 이메일 중복 확인
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    const error = new Error('이미 사용 중인 이메일입니다.');
    error.statusCode = 409;
    throw error;
  }

  // 이메일 인증 여부 확인 (회원가입 목적의 인증만 인정 — 비밀번호 재설정 인증코드는 사용 불가)
  const verified = await EmailVerification.findOne({
    where: { email, purpose: PURPOSE_SIGNUP, is_verified: true },
    order: [['created_at', 'DESC']],
  });
  if (!verified) {
    const error = new Error('이메일 인증이 완료되지 않았습니다.');
    error.statusCode = 403;
    throw error;
  }

  // 비밀번호 해싱
  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  let user;
  try {
    // 사용자 생성과 인증 레코드 소멸을 하나의 트랜잭션으로 묶어,
    // 둘 중 하나만 반영되는 상태(가입은 됐는데 인증기록이 남아 재사용 가능해지는 등)를 방지한다.
    user = await sequelize.transaction(async (t) => {
      const created = await User.create(
        {
          email,
          password_hash,
        },
        { transaction: t }
      );

      await verified.destroy({ transaction: t });

      return created;
    });
  } catch (err) {
    // findOne으로 중복 확인 후 create하는 동안의 동시 요청(TOCTOU)으로
    // unique 제약이 걸리는 경우를 대비한 안전망
    if (err.name === 'SequelizeUniqueConstraintError') {
      const error = new Error('이미 사용 중인 이메일입니다.');
      error.statusCode = 409;
      throw error;
    }
    throw err;
  }

  // password_hash 제외하고 반환
  const { password_hash: _, ...userData } = user.toJSON();
  return userData;
};

/**
 * 인증번호 발송 (회원가입 목적)
 * @param {string} email - 수신자 이메일
 */
const sendVerification = async (email) => {
  // 이미 가입된 이메일인지 확인
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    const error = new Error('이미 가입된 이메일입니다.');
    error.statusCode = 409;
    throw error;
  }

  // 재발송 쿨다운 확인 (스팸/무차별 대입 잠금 우회 방지)
  const latest = await EmailVerification.findOne({
    where: { email, purpose: PURPOSE_SIGNUP },
    order: [['created_at', 'DESC']],
  });
  if (latest) {
    const elapsedSeconds = (Date.now() - new Date(latest.created_at).getTime()) / 1000;
    if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
      const waitSeconds = Math.ceil(RESEND_COOLDOWN_SECONDS - elapsedSeconds);
      const error = new Error(
        `인증번호는 ${RESEND_COOLDOWN_SECONDS}초마다 재발송할 수 있습니다. ${waitSeconds}초 후 다시 시도해주세요.`
      );
      error.statusCode = 429;
      throw error;
    }
  }

  // 인증번호 생성 및 만료 시간 설정
  const code = generateCode();
  const expires_at = new Date(Date.now() + VERIFICATION_EXPIRY_MINUTES * 60 * 1000);

  // 기존 미인증 레코드 삭제 후 새로 생성 (같은 목적의 레코드만 정리 — 재설정 흐름과 섞이지 않음)
  await EmailVerification.destroy({ where: { email, purpose: PURPOSE_SIGNUP, is_verified: false } });
  await EmailVerification.create({ email, code, expires_at, purpose: PURPOSE_SIGNUP });

  // 이메일 발송
  await sendVerificationEmail(email, code);

  return { message: '인증번호가 발송되었습니다.' };
};

/**
 * 인증번호 검증 (회원가입 목적)
 *
 * 조회~시도 횟수 확인~증가를 하나의 트랜잭션 + 행 잠금(SELECT ... FOR UPDATE)으로 묶는다.
 * 단순히 `attempts += 1; save()`만 하면 동시에 들어온 여러 요청이 모두 같은 값(예: 0)을
 * 읽은 뒤 각자 저장해 마지막 쓰기만 반영되는 race condition이 생겨, 병렬로 코드를 시도하면
 * 실제 시도 횟수보다 적게 카운트되어 잠금(MAX_VERIFICATION_ATTEMPTS)을 우회할 수 있다.
 * refresh()와 동일한 방식으로 잠가 순차적으로만 처리되도록 한다.
 *
 * @param {string} email - 이메일
 * @param {string} code - 6자리 인증번호
 */
const verifyEmail = async (email, code) => {
  const outcome = await sequelize.transaction(async (t) => {
    const verification = await EmailVerification.findOne({
      where: { email, purpose: PURPOSE_SIGNUP, is_verified: false },
      order: [['created_at', 'DESC']],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!verification) {
      return { status: 'not_found' };
    }

    // 만료 확인
    if (new Date() > new Date(verification.expires_at)) {
      return { status: 'expired' };
    }

    // 최대 시도 횟수 초과 시 잠금 (무차별 대입 방지)
    if (verification.attempts >= MAX_VERIFICATION_ATTEMPTS) {
      return { status: 'locked' };
    }

    if (verification.code !== code) {
      verification.attempts += 1;
      await verification.save({ transaction: t });
      return { status: 'mismatch' };
    }

    // 인증 완료 처리
    verification.is_verified = true;
    await verification.save({ transaction: t });
    return { status: 'ok' };
  });

  if (outcome.status === 'not_found' || outcome.status === 'mismatch') {
    const error = new Error('인증번호가 일치하지 않습니다.');
    error.statusCode = 400;
    throw error;
  }

  if (outcome.status === 'expired') {
    const error = new Error('인증번호가 만료되었습니다. 다시 요청해주세요.');
    error.statusCode = 410;
    throw error;
  }

  if (outcome.status === 'locked') {
    const error = new Error('시도 횟수를 초과했습니다. 인증번호를 다시 요청해주세요.');
    error.statusCode = 429;
    throw error;
  }

  return { message: '이메일 인증이 완료되었습니다.' };
};

/**
 * 로그인
 * @param {string} email
 * @param {string} password
 * @returns {object} { accessToken, refreshToken, user }
 */
const login = async (email, password) => {
  // 사용자 조회
  const user = await User.findOne({ where: { email } });
  if (!user) {
    const error = new Error('이메일 또는 비밀번호가 올바르지 않습니다.');
    error.statusCode = 401;
    throw error;
  }

  // 계정 상태 확인
  if (user.status !== 'active') {
    const error = new Error('비활성화된 계정입니다.');
    error.statusCode = 403;
    throw error;
  }

  // 비밀번호 검증
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    const error = new Error('이메일 또는 비밀번호가 올바르지 않습니다.');
    error.statusCode = 401;
    throw error;
  }

  // 토큰 생성
  const payload = { user_id: user.user_id, email: user.email, role: user.role };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken({ user_id: user.user_id });

  // Refresh Token DB 저장
  const expires_at = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
  await RefreshToken.create({
    user_id: user.user_id,
    token: refreshToken,
    expires_at,
  });

  // 사용자 정보 반환 (password_hash 제외)
  const { password_hash: _, ...userData } = user.toJSON();

  return { accessToken, refreshToken, user: userData };
};

/**
 * 로그아웃
 * @param {string} refreshToken
 */
const logout = async (refreshToken) => {
  const deleted = await RefreshToken.destroy({ where: { token: refreshToken } });
  if (!deleted) {
    const error = new Error('유효하지 않은 토큰입니다.');
    error.statusCode = 400;
    throw error;
  }
  return { message: '로그아웃되었습니다.' };
};

/**
 * 토큰 갱신 (refresh token rotation)
 * 사용된 refresh token은 즉시 폐기하고 새 refresh token을 발급하여,
 * 탈취된 토큰이 재사용되거나 만료 전까지 계속 유효한 상태로 남는 것을 방지한다.
 *
 * 토큰 조회부터 폐기, 신규 발급까지를 하나의 트랜잭션으로 묶고, 조회 시점에
 * 행 잠금(SELECT ... FOR UPDATE)을 걸어 동일한 refresh token으로 들어온 동시 요청 중
 * 정확히 하나만 성공하도록 한다. 두 번째 요청은 첫 번째 트랜잭션이 커밋(토큰 삭제)된
 * 이후에 잠금이 풀리며, 이미 삭제된 토큰을 조회하게 되어 401로 실패한다.
 *
 * @param {string} token - refresh token
 * @returns {object} { accessToken, refreshToken }
 */
const refresh = async (token) => {
  // JWT 검증
  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch (err) {
    const error = new Error('유효하지 않은 리프레시 토큰입니다.');
    error.statusCode = 401;
    throw error;
  }

  const outcome = await sequelize.transaction(async (t) => {
    // FOR UPDATE 행 잠금: 동일 토큰으로 동시에 들어온 다른 트랜잭션은
    // 이 트랜잭션이 끝날 때까지 대기한다.
    const storedToken = await RefreshToken.findOne({
      where: { token },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!storedToken) {
      return { status: 'not_found' };
    }

    // 만료 확인
    if (new Date() > new Date(storedToken.expires_at)) {
      await storedToken.destroy({ transaction: t });
      return { status: 'expired' };
    }

    // 사용자 조회
    const user = await User.findByPk(decoded.user_id, { transaction: t });
    if (!user) {
      await storedToken.destroy({ transaction: t });
      return { status: 'user_not_found' };
    }

    // 기존 refresh token 폐기 (회전) 후 새 토큰 발급
    await storedToken.destroy({ transaction: t });

    const payload = { user_id: user.user_id, email: user.email, role: user.role };
    const accessToken = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken({ user_id: user.user_id });

    const expires_at = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
    await RefreshToken.create(
      {
        user_id: user.user_id,
        token: newRefreshToken,
        expires_at,
      },
      { transaction: t }
    );

    return { status: 'ok', accessToken, refreshToken: newRefreshToken };
  });

  if (outcome.status === 'not_found') {
    const error = new Error('리프레시 토큰이 만료되었거나 존재하지 않습니다.');
    error.statusCode = 401;
    throw error;
  }

  if (outcome.status === 'expired') {
    const error = new Error('리프레시 토큰이 만료되었습니다. 다시 로그인해주세요.');
    error.statusCode = 401;
    throw error;
  }

  if (outcome.status === 'user_not_found') {
    const error = new Error('사용자를 찾을 수 없습니다.');
    error.statusCode = 404;
    throw error;
  }

  return { accessToken: outcome.accessToken, refreshToken: outcome.refreshToken };
};

/**
 * 비밀번호 재설정 요청 (인증번호 이메일 발송)
 *
 * 계정 열거(enumeration) 공격을 줄이기 위해, 가입되지 않은 이메일이어도 동일한
 * 200 응답을 반환한다(실제 발송은 하지 않음). 단, 가입된 이메일에 한해 60초
 * 재발송 쿨다운이 적용되므로 "짧은 시간 내 재요청 시 429가 발생하는지"로 계정
 * 존재 여부를 완전히 배제할 수는 없다 — 알려진 잔여 리스크로 문서에 기록.
 *
 * @param {string} email
 */
const passwordResetRequest = async (email) => {
  const genericResult = { message: '해당 이메일이 가입되어 있다면 인증번호가 발송되었습니다.' };

  const user = await User.findOne({ where: { email } });
  if (!user) {
    return genericResult;
  }

  // 재발송 쿨다운 확인 (purpose로 분리되어 회원가입 인증 발송과 서로 영향을 주지 않는다)
  const latest = await EmailVerification.findOne({
    where: { email, purpose: PURPOSE_PASSWORD_RESET },
    order: [['created_at', 'DESC']],
  });
  if (latest) {
    const elapsedSeconds = (Date.now() - new Date(latest.created_at).getTime()) / 1000;
    if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
      const waitSeconds = Math.ceil(RESEND_COOLDOWN_SECONDS - elapsedSeconds);
      const error = new Error(
        `인증번호는 ${RESEND_COOLDOWN_SECONDS}초마다 재발송할 수 있습니다. ${waitSeconds}초 후 다시 시도해주세요.`
      );
      error.statusCode = 429;
      throw error;
    }
  }

  const code = generateCode();
  const expires_at = new Date(Date.now() + VERIFICATION_EXPIRY_MINUTES * 60 * 1000);

  await EmailVerification.destroy({
    where: { email, purpose: PURPOSE_PASSWORD_RESET, is_verified: false },
  });
  await EmailVerification.create({ email, code, expires_at, purpose: PURPOSE_PASSWORD_RESET });

  await sendPasswordResetEmail(email, code);

  return genericResult;
};

/**
 * 비밀번호 재설정 (인증번호 확인 + 새 비밀번호 설정)
 *
 * 인증번호 조회~시도 횟수 증가~소비와 비밀번호 변경, 그리고 기존 refresh token 전체
 * 폐기까지를 하나의 트랜잭션 + 행 잠금으로 묶는다. 이렇게 해야 "코드는 소비됐는데
 * 비밀번호는 안 바뀜" 같은 불일치가 생기지 않고, 성공한 코드는 is_verified=true로
 * 즉시 소비되어 재사용할 수 없다. 재설정 성공 시 탈취된 세션이 남아있지 않도록
 * 해당 유저의 모든 refresh token을 폐기한다.
 *
 * @param {string} email
 * @param {string} code - 6자리 인증번호
 * @param {string} newPassword - 새 비밀번호
 */
const passwordReset = async (email, code, newPassword) => {
  const password_hash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  const outcome = await sequelize.transaction(async (t) => {
    const verification = await EmailVerification.findOne({
      where: { email, purpose: PURPOSE_PASSWORD_RESET, is_verified: false },
      order: [['created_at', 'DESC']],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!verification) {
      return { status: 'not_found' };
    }

    if (new Date() > new Date(verification.expires_at)) {
      return { status: 'expired' };
    }

    if (verification.attempts >= MAX_VERIFICATION_ATTEMPTS) {
      return { status: 'locked' };
    }

    if (verification.code !== code) {
      verification.attempts += 1;
      await verification.save({ transaction: t });
      return { status: 'mismatch' };
    }

    const user = await User.findOne({ where: { email }, transaction: t, lock: t.LOCK.UPDATE });
    if (!user) {
      return { status: 'not_found' };
    }

    verification.is_verified = true;
    await verification.save({ transaction: t });

    user.password_hash = password_hash;
    await user.save({ transaction: t });

    await RefreshToken.destroy({ where: { user_id: user.user_id }, transaction: t });

    return { status: 'ok' };
  });

  if (outcome.status === 'not_found' || outcome.status === 'mismatch') {
    const error = new Error('인증번호가 일치하지 않습니다.');
    error.statusCode = 400;
    throw error;
  }

  if (outcome.status === 'expired') {
    const error = new Error('인증번호가 만료되었습니다. 다시 요청해주세요.');
    error.statusCode = 410;
    throw error;
  }

  if (outcome.status === 'locked') {
    const error = new Error('시도 횟수를 초과했습니다. 인증번호를 다시 요청해주세요.');
    error.statusCode = 429;
    throw error;
  }

  return { message: '비밀번호가 재설정되었습니다.' };
};

module.exports = {
  signup,
  sendVerification,
  verifyEmail,
  login,
  logout,
  refresh,
  passwordResetRequest,
  passwordReset,
};
