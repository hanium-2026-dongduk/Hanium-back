const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendance.controller');
const { authenticate } = require('../middlewares/auth');

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

/**
 * @openapi
 * /attendance/check:
 *   post:
 *     tags: [출석]
 *     summary: 출석 체크 (MN04)
 *     description: |
 *       **멱등하다.** 같은 날 몇 번을 호출해도 출석은 한 번만 기록되고 포인트도 한 번만 지급된다.
 *       앱 재실행·네트워크 재시도로 중복 호출해도 안전하다.
 *
 *       출석 자체에는 포인트를 주지 않는다 — `attendance` 데일리 미션의 보상으로 일원화되어 있다.
 *
 *       응답의 `badgesAwarded`가 비어 있지 않으면 배지 획득 축하 화면을 띄우면 된다.
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
 *       201:
 *         description: 그날 첫 출석
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
 *                         alreadyChecked: { type: boolean, example: false }
 *                         attendanceDate: { type: string, example: '2026-08-25' }
 *                         streakDays: { type: integer, example: 3 }
 *                         pointsEarned: { type: integer, example: 30 }
 *                         badgesAwarded:
 *                           type: array
 *                           items: { type: string }
 *                           example: [attendance_first]
 *       200:
 *         description: 같은 날 재요청 (아무것도 바뀌지 않음)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Success' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/check', attendanceController.checkValidation, attendanceController.check);

/**
 * @openapi
 * /attendance/{childId}:
 *   get:
 *     tags: [출석]
 *     summary: 월간 출석 현황 (MP03, PD02)
 *     description: |
 *       진행 중인 이번 달은 오늘까지 경과한 일수만 분모로 쓴다(월초마다 출석률이 부당하게
 *       낮아 보이지 않도록). 지난 달·다음 달은 월 전체 일수를 쓴다.
 *     parameters:
 *       - $ref: '#/components/parameters/childId'
 *       - name: month
 *         in: query
 *         description: 'YYYY-MM (기본값: 이번 달, KST)'
 *         schema: { type: string, pattern: '^\d{4}-\d{2}$', example: '2026-08' }
 *     responses:
 *       200:
 *         description: 월간 현황
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
 *                         month: { type: string, example: '2026-08' }
 *                         attendedDates:
 *                           type: array
 *                           items: { type: string, example: '2026-08-25' }
 *                         attendedCount: { type: integer }
 *                         denominator: { type: integer }
 *                         attendanceRate: { type: number, example: 62.5 }
 *                         currentStreak: { type: integer }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:childId', attendanceController.monthlyValidation, attendanceController.getMonthly);

module.exports = router;
