const express = require('express');
const router = express.Router();
const usageController = require('../controllers/usage.controller');
const { authenticate } = require('../middlewares/auth');

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

// POST /api/usage/heartbeat - 사용 시간 heartbeat 기록
router.post('/heartbeat', usageController.heartbeatValidation, usageController.heartbeat);

// GET /api/usage/:childId/today - 오늘 누적 사용 시간 조회
router.get('/:childId/today', usageController.todayParamValidation, usageController.getToday);

module.exports = router;
