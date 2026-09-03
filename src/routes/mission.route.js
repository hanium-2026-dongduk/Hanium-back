const express = require('express');
const router = express.Router();
const missionController = require('../controllers/mission.controller');
const { authenticate } = require('../middlewares/auth');

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

/**
 * @openapi
 * /missions:
 *   get:
 *     tags: [미션]
 *     summary: 미션 카탈로그 (RW01)
 *     description: 자녀와 무관한 정적 목록. 미션 종류와 목표치·보상 포인트.
 *     responses:
 *       200:
 *         description: 카탈로그
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Success' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/', missionController.getCatalog);

/**
 * @openapi
 * /missions/progress/{childId}:
 *   get:
 *     tags: [미션]
 *     summary: 오늘의 미션 진행 상황 (RW01)
 *     description: |
 *       그날의 미션 행이 없으면 **조회 시점에 지연 생성**된다(Asia/Seoul 기준).
 *
 *       ⚠️ 지금 진행도가 실제로 오르는 미션은 `attendance`뿐이다. `story_read`·`word_clicked`·
 *       `quiz_answered`는 진행도를 올려주는 호출자가 아직 없어 `pending`에 머문다.
 *     parameters:
 *       - $ref: '#/components/parameters/childId'
 *     responses:
 *       200:
 *         description: 진행 상황
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Success' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/progress/:childId',
  missionController.progressParamValidation,
  missionController.getProgress
);

module.exports = router;
