const { body, validationResult } = require('express-validator');
const authService = require('../services/auth.service');
const response = require('../utils/response');
const { passwordValidation } = require('../utils/passwordPolicy');

/**
 * 회원가입 유효성 검사 규칙
 */
const signupValidation = [
  body('email')
    .isEmail()
    .withMessage('유효한 이메일 형식이 아닙니다.')
    .normalizeEmail(),
  ...passwordValidation('password'),
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

/**
 * 로그인 유효성 검사 규칙
 */
const loginValidation = [
  body('email')
    .isEmail()
    .withMessage('유효한 이메일 형식이 아닙니다.')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('비밀번호를 입력해주세요.'),
];

/**
 * POST /api/auth/login
 * 로그인
 */
const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const { email, password } = req.body;
    const result = await authService.login(email, password);

    return response.success(res, 200, '로그인되었습니다.', result);
  } catch (err) {
    if (err.statusCode) {
      return response.error(res, err.statusCode, err.message);
    }
    next(err);
  }
};

/**
 * POST /api/auth/logout
 * 로그아웃
 */
const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return response.error(res, 400, 'refreshToken이 필요합니다.');
    }

    const result = await authService.logout(refreshToken);
    return response.success(res, 200, result.message);
  } catch (err) {
    if (err.statusCode) {
      return response.error(res, err.statusCode, err.message);
    }
    next(err);
  }
};

/**
 * 토큰 갱신 유효성 검사 규칙
 */
const refreshValidation = [
  body('refreshToken')
    .notEmpty()
    .withMessage('refreshToken이 필요합니다.'),
];

/**
 * POST /api/auth/refresh
 * 토큰 갱신
 */
const refresh = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const { refreshToken } = req.body;
    const result = await authService.refresh(refreshToken);

    return response.success(res, 200, '토큰이 갱신되었습니다.', result);
  } catch (err) {
    if (err.statusCode) {
      return response.error(res, err.statusCode, err.message);
    }
    next(err);
  }
};

/**
 * 비밀번호 재설정 요청 유효성 검사
 */
const passwordResetRequestValidation = [
  body('email')
    .isEmail()
    .withMessage('유효한 이메일 형식이 아닙니다.')
    .normalizeEmail(),
];

/**
 * POST /api/auth/password/reset-request
 * 비밀번호 재설정 인증번호 발송
 */
const passwordResetRequest = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const { email } = req.body;
    const result = await authService.passwordResetRequest(email);

    return response.success(res, 200, result.message);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

/**
 * 비밀번호 재설정 유효성 검사
 */
const passwordResetValidation = [
  body('email')
    .isEmail()
    .withMessage('유효한 이메일 형식이 아닙니다.')
    .normalizeEmail(),
  body('code')
    .isLength({ min: 6, max: 6 })
    .withMessage('인증번호는 6자리입니다.')
    .isNumeric()
    .withMessage('인증번호는 숫자만 입력 가능합니다.'),
  ...passwordValidation('newPassword'),
];

/**
 * PUT /api/auth/password/reset
 * 비밀번호 재설정
 */
const passwordReset = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const { email, code, newPassword } = req.body;
    const result = await authService.passwordReset(email, code, newPassword);

    return response.success(res, 200, result.message);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
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
  loginValidation,
  login,
  logout,
  refreshValidation,
  refresh,
  passwordResetRequestValidation,
  passwordResetRequest,
  passwordResetValidation,
  passwordReset,
};
