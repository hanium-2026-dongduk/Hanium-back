const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

// POST /api/auth/signup - 회원가입
router.post('/signup', authController.signupValidation, authController.signup);

// POST /api/auth/email/send - 인증번호 발송
router.post('/email/send', authController.sendVerificationValidation, authController.sendVerification);

// POST /api/auth/email/verify - 인증번호 검증
router.post('/email/verify', authController.verifyEmailValidation, authController.verifyEmail);

// POST /api/auth/login - 로그인
router.post('/login', authController.loginValidation, authController.login);

// POST /api/auth/logout - 로그아웃
router.post('/logout', authController.logout);

// POST /api/auth/refresh - 토큰 갱신
router.post('/refresh', authController.refreshValidation, authController.refresh);

// POST /api/auth/find-email - 이메일 찾기 (AU03)
router.post('/find-email', authController.findEmailValidation, authController.findEmail);

// POST /api/auth/password/reset-request - 비밀번호 재설정 인증번호 발송 (AU03)
router.post('/password/reset-request', authController.passwordResetRequestValidation, authController.passwordResetRequest);

// PUT /api/auth/password/reset - 비밀번호 재설정 (AU03)
router.put('/password/reset', authController.passwordResetValidation, authController.passwordReset);

module.exports = router;
