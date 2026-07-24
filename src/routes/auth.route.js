const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

// POST /api/auth/signup - 회원가입
router.post('/signup', authController.signupValidation, authController.signup);

// POST /api/auth/email/send - 인증번호 발송
router.post('/email/send', authController.sendVerificationValidation, authController.sendVerification);

// POST /api/auth/email/verify - 인증번호 검증
router.post('/email/verify', authController.verifyEmailValidation, authController.verifyEmail);

module.exports = router;
