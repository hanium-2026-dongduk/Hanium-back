const express = require('express');
const router = express.Router();
const guardianController = require('../controllers/guardian.controller');
const { authenticate } = require('../middlewares/auth');
const { requireGuardianToken } = require('../middlewares/guardianAuth');

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

// PUT /api/guardian/pin - PIN 설정/변경
router.put('/pin', guardianController.setPinValidation, guardianController.setPin);

// POST /api/guardian/pin/verify - PIN 검증
router.post('/pin/verify', guardianController.verifyPinValidation, guardianController.verifyPin);

// POST /api/guardian/reauth - 계정 비밀번호 재인증 (성공 시 reauthToken 발급)
router.post('/reauth', guardianController.reauthValidation, guardianController.reauth);

// GET /api/guardian/settings - 보호자 설정 조회
router.get('/settings', guardianController.getSettings);

// PUT /api/guardian/settings - 보호자 설정 업데이트 (보호자 전용: PIN 검증 토큰 필요)
router.put(
  '/settings',
  requireGuardianToken,
  guardianController.updateSettingsValidation,
  guardianController.updateSettings
);

module.exports = router;
