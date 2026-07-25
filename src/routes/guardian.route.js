const express = require('express');
const router = express.Router();
const guardianController = require('../controllers/guardian.controller');
const { authenticate } = require('../middlewares/auth');

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

// PUT /api/guardian/pin - PIN 설정/변경
router.put('/pin', guardianController.setPinValidation, guardianController.setPin);

// POST /api/guardian/pin/verify - PIN 검증
router.post('/pin/verify', guardianController.verifyPinValidation, guardianController.verifyPin);

// GET /api/guardian/settings - 보호자 설정 조회
router.get('/settings', guardianController.getSettings);

// PUT /api/guardian/settings - 보호자 설정 업데이트
router.put('/settings', guardianController.updateSettingsValidation, guardianController.updateSettings);

module.exports = router;
