const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

// POST /api/auth/signup - 회원가입
router.post('/signup', authController.signupValidation, authController.signup);

module.exports = router;
