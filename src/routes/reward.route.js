const express = require('express');
const router = express.Router();
const rewardController = require('../controllers/reward.controller');
const { authenticate } = require('../middlewares/auth');

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

// GET /api/rewards/:childId/summary - 메인 화면(MN02)용 보유 포인트만
router.get(
  '/:childId/summary',
  rewardController.childIdParamValidation,
  rewardController.getSummary
);

// GET /api/rewards/:childId/history - 포인트 획득 이력 (RW03)
router.get('/:childId/history', rewardController.historyValidation, rewardController.getHistory);

// GET /api/rewards/:childId - 포인트/레벨/연속출석일 + 다음 레벨까지의 진행도
router.get('/:childId', rewardController.childIdParamValidation, rewardController.getRewards);

module.exports = router;
