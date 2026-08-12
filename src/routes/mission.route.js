const express = require('express');
const router = express.Router();
const missionController = require('../controllers/mission.controller');
const { authenticate } = require('../middlewares/auth');

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

// GET /api/missions - 미션 카탈로그 (자녀 비종속)
router.get('/', missionController.getCatalog);

// GET /api/missions/progress/:childId - 오늘의 미션 진행 상황 (없으면 지연 생성)
router.get(
  '/progress/:childId',
  missionController.progressParamValidation,
  missionController.getProgress
);

module.exports = router;
