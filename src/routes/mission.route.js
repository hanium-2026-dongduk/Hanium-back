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
 * /missions/word-click:
 *   post:
 *     tags: [미션]
 *     summary: 단어 클릭 미션 진행도 기록
 *     description: 동화 화면에서 영어 단어를 눌렀을 때 호출한다. 하루 목표 5회 이후 호출은 무시된다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [child_profile_id]
 *             properties:
 *               child_profile_id: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: 기록된 미션 진행도와 이번 호출의 획득 포인트 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post(
  '/word-click',
  missionController.wordClickValidation,
  missionController.recordWordClick
);

/**
 * @openapi
 * /missions/progress/{childId}:
 *   get:
 *     tags: [미션]
 *     summary: 오늘의 미션 진행 상황 (RW01)
 *     description: |
 *       그날의 미션 행이 없으면 **조회 시점에 지연 생성**된다(Asia/Seoul 기준).
 *
 *       출석·동화 읽기·단어 클릭·퀴즈 풀이 이벤트가 각각 진행도를 갱신한다.
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
