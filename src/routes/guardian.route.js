const express = require('express');
const router = express.Router();
const guardianController = require('../controllers/guardian.controller');
const { authenticate } = require('../middlewares/auth');
const { requireGuardianToken } = require('../middlewares/guardianAuth');

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

/**
 * @openapi
 * /guardian/pin:
 *   put:
 *     tags: [보호자]
 *     summary: 보호자 PIN 설정·변경
 *     description: |
 *       PIN을 바꾸면 기존에 발급된 guardianToken이 즉시 무효가 된다(`pin_version`).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pin: { type: string, description: 숫자 PIN }
 *     responses:
 *       200:
 *         description: 설정됨
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Success' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.put('/pin', guardianController.setPinValidation, guardianController.setPin);

/**
 * @openapi
 * /guardian/pin/verify:
 *   post:
 *     tags: [보호자]
 *     summary: PIN 검증 (guardianToken 발급)
 *     description: |
 *       성공하면 보호자 전용 작업에 쓰는 `guardianToken`을 준다.
 *       이 토큰은 `X-Guardian-Token` 헤더로 보낸다 — `Authorization`에는 쓸 수 없다.
 *
 *       연속 오답 시 DB 기반으로 잠긴다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pin: { type: string }
 *     responses:
 *       200:
 *         description: 검증됨 (guardianToken 발급)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Success' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post('/pin/verify', guardianController.verifyPinValidation, guardianController.verifyPin);

/**
 * @openapi
 * /guardian/reauth:
 *   post:
 *     tags: [보호자]
 *     summary: 계정 비밀번호 재인증
 *     description: PIN을 잊었을 때 계정 비밀번호로 재인증한다. 연속 실패 시 잠긴다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: 재인증됨
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Success' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post('/reauth', guardianController.reauthValidation, guardianController.reauth);

/**
 * @openapi
 * /guardian/settings:
 *   get:
 *     tags: [보호자]
 *     summary: 보호자 설정 조회
 *     description: 사용 시간 한도 등. PIN 해시는 응답에 포함되지 않는다.
 *     responses:
 *       200:
 *         description: 설정
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Success' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/settings', guardianController.getSettings);

/**
 * @openapi
 * /guardian/settings:
 *   put:
 *     tags: [보호자]
 *     summary: 보호자 설정 변경
 *     description: |
 *       **PIN 검증 토큰이 필요하다.** `pin/verify`로 받은 값을 `X-Guardian-Token` 헤더에 넣는다.
 *       accessToken만으로는 접근할 수 없다.
 *     security:
 *       - bearerAuth: []
 *         guardianToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200:
 *         description: 변경됨
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Success' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.put(
  '/settings',
  requireGuardianToken,
  guardianController.updateSettingsValidation,
  guardianController.updateSettings
);

module.exports = router;
