const { body, validationResult } = require('express-validator');
const authService = require('../services/auth.service');
const response = require('../utils/response');

/**
 * 회원가입 유효성 검사 규칙
 */
const signupValidation = [
  body('email')
    .isEmail()
    .withMessage('유효한 이메일 형식이 아닙니다.')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('비밀번호는 최소 8자 이상이어야 합니다.')
    .matches(/^(?=.*[a-zA-Z])(?=.*\d)/)
    .withMessage('비밀번호는 영문과 숫자를 포함해야 합니다.'),
];

/**
 * 이메일 인증번호 발송 유효성 검사 규칙
 */
const sendVerificationValidation = [
  body('email')
    .isEmail()
    .withMessage('유효한 이메일 형식이 아닙니다.')
    .normalizeEmail(),
];

/**
 * 이메일 인증번호 검증 유효성 검사 규칙
 */
const verifyEmailValidation = [
  body('email')
    .isEmail()
    .withMessage('유효한 이메일 형식이 아닙니다.')
    .normalizeEmail(),
  body('code')
    .isLength({ min: 6, max: 6 })
    .withMessage('인증번호는 6자리입니다.')
    .isNumeric()
    .withMessage('인증번호는 숫자만 입력 가능합니다.'),
];

/**
 * POST /api/auth/signup
 * 회원가입
 */
const signup = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const { email, password } = req.body;
    const user = await authService.signup({ email, password });

    return response.success(res, 201, '회원가입이 완료되었습니다.', { user });
  } catch (err) {
    if (err.statusCode) {
      return response.error(res, err.statusCode, err.message);
    }
    next(err);
  }
};

/**
 * POST /api/auth/email/send
 * 이메일 인증번호 발송
 */
const sendVerification = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const { email } = req.body;
    const result = await authService.sendVerification(email);

    return response.success(res, 200, result.message);
  } catch (err) {
    if (err.statusCode) {
      return response.error(res, err.statusCode, err.message);
    }
    next(err);
  }
};

/**
 * POST /api/auth/email/verify
 * 이메일 인증번호 검증
 */
const verifyEmail = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const { email, code } = req.body;
    const result = await authService.verifyEmail(email, code);

    return response.success(res, 200, result.message);
  } catch (err) {
    if (err.statusCode) {
      return response.error(res, err.statusCode, err.message);
    }
    next(err);
  }
};

module.exports = {
  signupValidation,
  signup,
  sendVerificationValidation,
  sendVerification,
  verifyEmailValidation,
  verifyEmail,
};
