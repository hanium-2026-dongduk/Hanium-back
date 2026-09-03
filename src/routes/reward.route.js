const express = require('express');
const router = express.Router();
const rewardController = require('../controllers/reward.controller');
const { authenticate } = require('../middlewares/auth');

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

/**
 * @openapi
 * /rewards/{childId}/summary:
 *   get:
 *     tags: [리워드]
 *     summary: 보유 포인트 (MN02)
 *     description: |
 *       메인 화면이 자주 부르는 경량 응답. 잔액만 돌아온다.
 *
 *       **"토큰"과 "포인트"는 같은 값이다.** 프론트가 화면에 따라 메인 화면에서는 "토큰",
 *       마이페이지에서는 "포인트"로 라벨링할 뿐 백엔드에는 `points` 하나만 있다.
 *
 *       지갑이 없던 자녀도 서버가 만들어 주므로 0부터 시작한다.
 *     parameters:
 *       - $ref: '#/components/parameters/childId'
 *     responses:
 *       200:
 *         description: 잔액
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         points: { type: integer, example: 340 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/:childId/summary',
  rewardController.childIdParamValidation,
  rewardController.getSummary
);

/**
 * @openapi
 * /rewards/{childId}/history:
 *   get:
 *     tags: [리워드]
 *     summary: 포인트 획득 이력 (RW03)
 *     description: 최신순 페이지네이션. 날짜는 Asia/Seoul 기준 캘린더 날짜다.
 *     parameters:
 *       - $ref: '#/components/parameters/childId'
 *       - name: page
 *         in: query
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - name: reason
 *         in: query
 *         description: 지급 사유 필터
 *         schema: { type: string, example: mission_reward }
 *       - name: from
 *         in: query
 *         schema: { type: string, pattern: '^\d{4}-\d{2}-\d{2}$' }
 *       - name: to
 *         in: query
 *         schema: { type: string, pattern: '^\d{4}-\d{2}-\d{2}$' }
 *     responses:
 *       200:
 *         description: 이력
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         items:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               points: { type: integer }
 *                               reason: { type: string }
 *                               balanceAfter: { type: integer }
 *                               createdAt: { type: string, format: date-time }
 *                               metadata: { type: object, nullable: true }
 *                         pagination: { $ref: '#/components/schemas/Pagination' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:childId/history', rewardController.historyValidation, rewardController.getHistory);

/**
 * @openapi
 * /rewards/{childId}:
 *   get:
 *     tags: [리워드]
 *     summary: 포인트·레벨·연속출석일 (MP02, RW02, RW04)
 *     description: 다음 레벨까지의 진행도를 함께 준다.
 *     parameters:
 *       - $ref: '#/components/parameters/childId'
 *     responses:
 *       200:
 *         description: 리워드 정보
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         childProfileId: { type: integer }
 *                         points: { type: integer, example: 340 }
 *                         level: { type: integer, example: 3 }
 *                         streakDays: { type: integer, example: 4 }
 *                         levelProgress:
 *                           type: object
 *                           properties:
 *                             currentLevelFloor: { type: integer, example: 300 }
 *                             nextLevelAt: { type: integer, nullable: true, example: 600 }
 *                             pointsToNextLevel: { type: integer, example: 260 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:childId', rewardController.childIdParamValidation, rewardController.getRewards);

module.exports = router;
