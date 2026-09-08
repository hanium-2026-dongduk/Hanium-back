const express = require('express');
const router = express.Router();
const usageController = require('../controllers/usage.controller');
const { authenticate } = require('../middlewares/auth');

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

/**
 * @openapi
 * /usage/heartbeat:
 *   post:
 *     tags: [사용 시간]
 *     summary: 사용 시간 heartbeat 기록
 *     description: |
 *       앱이 주기적으로 호출해 학습 시간을 누적한다. 서버가 경과 시간을 자체 계산하므로
 *       클라이언트가 보낸 값을 그대로 믿지 않는다.
 *
 *       보호자가 설정한 한도를 넘으면 403.
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
 *       200:
 *         description: 누적됨
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Success' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403:
 *         description: 사용 시간 한도 초과
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/heartbeat', usageController.heartbeatValidation, usageController.heartbeat);

/**
 * @openapi
 * /usage/{childId}/today:
 *   get:
 *     tags: [사용 시간]
 *     summary: 오늘 누적 사용 시간
 *     description: Asia/Seoul 기준 오늘 하루 누적치.
 *     parameters:
 *       - $ref: '#/components/parameters/childId'
 *     responses:
 *       200:
 *         description: 누적 시간
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Success' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:childId/today', usageController.todayParamValidation, usageController.getToday);

module.exports = router;
