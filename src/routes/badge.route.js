const express = require('express');
const router = express.Router();
const badgeController = require('../controllers/badge.controller');
const { authenticate } = require('../middlewares/auth');

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

/**
 * @openapi
 * /badges:
 *   get:
 *     tags: [배지]
 *     summary: 전체 배지 카탈로그 (MP02_RWD_03)
 *     description: |
 *       자녀와 무관한 정적 목록. 어떤 배지가 있는지 미리 보여주는 화면에서 쓴다.
 *
 *       `icon_key`는 URL이 아니라 **키**다. 프론트가 이미지에 매핑한다.
 *       `condition`을 노출하는 이유는 "10일 중 3일" 같은 진행도를 그릴 수 있게 하기 위함이다.
 *     responses:
 *       200:
 *         description: 카탈로그
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
 *                         badges:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               badge_code: { type: string, example: streak_10 }
 *                               name: { type: string, example: 꾸준한 아이 }
 *                               description: { type: string }
 *                               icon_key: { type: string }
 *                               condition:
 *                                 type: object
 *                                 properties:
 *                                   type: { type: string, example: streak_days }
 *                                   value: { type: integer, example: 10 }
 *                               evaluable:
 *                                 type: boolean
 *                                 description: false면 아직 판정할 수 없는 배지
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
// ':childId' 라우트보다 먼저 둬야 '/'가 childId로 잡히지 않는다.
router.get('/', badgeController.getCatalog);

/**
 * @openapi
 * /badges/{childId}:
 *   get:
 *     tags: [배지]
 *     summary: 자녀의 배지 현황 (MP02_RWD_03)
 *     description: |
 *       획득한 배지와 못 한 배지를 **모두** 돌려준다. 잠긴 배지를 보여주는 것 자체가 동기부여이기 때문.
 *
 *       상태 3가지를 구분한다:
 *       - `earned` — 획득함
 *       - `locked` — 아직 조건 미달 (**노력하면 딸 수 있음**)
 *       - `coming_soon` — 판정 기능이 아직 없음 (**아무리 해도 못 땀**)
 *
 *       `locked`와 `coming_soon`을 같게 표시하면 사용자 눈에는 버그다.
 *     parameters:
 *       - $ref: '#/components/parameters/childId'
 *     responses:
 *       200:
 *         description: 배지 현황
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
 *                         badges:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               badge_code: { type: string }
 *                               name: { type: string }
 *                               description: { type: string }
 *                               icon_key: { type: string }
 *                               condition: { type: object }
 *                               status: { type: string, enum: [earned, locked, coming_soon] }
 *                               awarded_at: { type: string, format: date-time, nullable: true }
 *                         earned_count: { type: integer, example: 1 }
 *                         total_count: { type: integer, example: 11 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:childId', badgeController.childIdParamValidation, badgeController.getChildBadges);

module.exports = router;
