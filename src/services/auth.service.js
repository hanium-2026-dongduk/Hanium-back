const bcrypt = require('bcrypt');
const { User, EmailVerification, RefreshToken } = require('../models');
const { sendVerificationEmail } = require('../utils/mailer');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');

const SALT_ROUNDS = 12;
const VERIFICATION_EXPIRY_MINUTES = 5;
const REFRESH_TOKEN_DAYS = 7;

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

  // 이메일 인증 여부 확인
  const verified = await EmailVerification.findOne({
    where: { email, is_verified: true },
    order: [['created_at', 'DESC']],
  });
  if (!verified) {
    const error = new Error('이메일 인증이 완료되지 않았습니다.');
    error.statusCode = 403;
    throw error;
  }

  // 비밀번호 해싱
  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  // 사용자 생성
  const user = await User.create({
    email,
    password_hash,
  });

  // password_hash 제외하고 반환
  const { password_hash: _, ...userData } = user.toJSON();
  return userData;
};

/**
 * 인증번호 발송
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

  // 인증번호 생성 및 만료 시간 설정
  const code = generateCode();
  const expires_at = new Date(Date.now() + VERIFICATION_EXPIRY_MINUTES * 60 * 1000);

  // 기존 미인증 레코드 삭제 후 새로 생성
  await EmailVerification.destroy({ where: { email, is_verified: false } });
  await EmailVerification.create({ email, code, expires_at });

  // 이메일 발송
  await sendVerificationEmail(email, code);

  return { message: '인증번호가 발송되었습니다.' };
};

/**
 * 인증번호 검증
 * @param {string} email - 이메일
 * @param {string} code - 6자리 인증번호
 */
const verifyEmail = async (email, code) => {
  const verification = await EmailVerification.findOne({
    where: { email, code, is_verified: false },
    order: [['created_at', 'DESC']],
  });

  if (!verification) {
    const error = new Error('인증번호가 일치하지 않습니다.');
    error.statusCode = 400;
    throw error;
  }

  // 만료 확인
  if (new Date() > new Date(verification.expires_at)) {
    const error = new Error('인증번호가 만료되었습니다. 다시 요청해주세요.');
    error.statusCode = 410;
    throw error;
  }

  // 인증 완료 처리
  verification.is_verified = true;
  await verification.save();

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
 * 토큰 갱신
 * @param {string} token - refresh token
 * @returns {object} { accessToken }
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

  // DB에 존재하는지 확인
  const storedToken = await RefreshToken.findOne({ where: { token } });
  if (!storedToken) {
    const error = new Error('리프레시 토큰이 만료되었거나 존재하지 않습니다.');
    error.statusCode = 401;
    throw error;
  }

  // 만료 확인
  if (new Date() > new Date(storedToken.expires_at)) {
    await storedToken.destroy();
    const error = new Error('리프레시 토큰이 만료되었습니다. 다시 로그인해주세요.');
    error.statusCode = 401;
    throw error;
  }

  // 사용자 조회 후 새 access token 발급
  const user = await User.findByPk(decoded.user_id);
  if (!user) {
    const error = new Error('사용자를 찾을 수 없습니다.');
    error.statusCode = 404;
    throw error;
  }

  const payload = { user_id: user.user_id, email: user.email, role: user.role };
  const accessToken = generateAccessToken(payload);

  return { accessToken };
};

module.exports = {
  signup,
  sendVerification,
  verifyEmail,
  login,
  logout,
  refresh,
};
