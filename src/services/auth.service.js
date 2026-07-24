const bcrypt = require('bcrypt');
const { User, EmailVerification } = require('../models');
const { sendVerificationEmail } = require('../utils/mailer');

const SALT_ROUNDS = 12;
const VERIFICATION_EXPIRY_MINUTES = 5;

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

module.exports = {
  signup,
  sendVerification,
  verifyEmail,
};
