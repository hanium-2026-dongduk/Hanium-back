const bcrypt = require('bcrypt');
const { User } = require('../models');

const SALT_ROUNDS = 12;

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

module.exports = {
  signup,
};
