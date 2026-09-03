const express = require('express');
const router = express.Router();
const badgeController = require('../controllers/badge.controller');
const { authenticate } = require('../middlewares/auth');

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

// GET /api/badges - 전체 배지 카탈로그 (MP02_RWD_03)
// :childId 라우트보다 먼저 둬야 '/'가 childId로 잡히지 않는다.
router.get('/', badgeController.getCatalog);

// GET /api/badges/:childId - 자녀의 배지 현황 (MP02_RWD_03)
router.get('/:childId', badgeController.childIdParamValidation, badgeController.getChildBadges);

module.exports = router;
