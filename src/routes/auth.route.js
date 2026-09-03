const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

/**
 * @openapi
 * /auth/signup:
 *   post:
 *     tags: [인증]
 *     summary: 회원가입 (AU02)
 *     description: |
 *       **이메일 인증을 먼저 마쳐야 한다.** `email/send` → `email/verify` 순서를 건너뛰면 403.
 *
 *       **응답에 토큰이 없다.** 가입 후 로그인 상태로 만들려면 `login`을 이어서 호출해야 한다.
 *       서버 users에 이름 컬럼이 없어 이름은 받지 않는다.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email, example: parent@example.com }
 *               password:
 *                 type: string
 *                 description: 8자 이상, 영문·숫자·특수문자를 각각 1자 이상 포함
 *                 example: Password1!
 *     responses:
 *       201:
 *         description: 가입 완료 (토큰 없음)
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
 *                         user: { $ref: '#/components/schemas/User' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       403:
 *         description: 이메일 인증 미완료
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       409:
 *         description: 이미 사용 중인 이메일
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/signup', authController.signupValidation, authController.signup);

/**
 * @openapi
 * /auth/email/send:
 *   post:
 *     tags: [인증]
 *     summary: 회원가입 인증번호 발송 (AU02 1단계)
 *     description: |
 *       6자리 숫자를 메일로 보낸다. 유효시간 **5분**, 재발송 쿨다운 **60초**.
 *
 *       비밀번호 재설정용 인증번호와는 DB에서 분리되어 있어 서로 교차 사용할 수 없다.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: 발송됨
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Success' }
 *       409:
 *         description: 이미 가입된 이메일
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post('/email/send', authController.sendVerificationValidation, authController.sendVerification);

/**
 * @openapi
 * /auth/email/verify:
 *   post:
 *     tags: [인증]
 *     summary: 회원가입 인증번호 검증 (AU02 2단계)
 *     description: 시도 횟수 5회를 넘기면 재발송이 필요하다.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code]
 *             properties:
 *               email: { type: string, format: email }
 *               code: { type: string, description: 6자리 숫자, example: '123456' }
 *     responses:
 *       200:
 *         description: 인증 완료
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Success' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       410:
 *         description: 인증번호 만료
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post('/email/verify', authController.verifyEmailValidation, authController.verifyEmail);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [인증]
 *     summary: 로그인 (AU01)
 *     description: |
 *       accessToken(15분)과 refreshToken(7일)을 발급한다.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: 로그인 성공
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
 *                         accessToken: { type: string }
 *                         refreshToken: { type: string }
 *                         user: { $ref: '#/components/schemas/User' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403:
 *         description: 비활성화된 계정
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/login', authController.loginValidation, authController.login);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [인증]
 *     summary: 로그아웃
 *     description: 해당 refreshToken을 서버에서 폐기한다. **바디에 토큰을 담아야 한다.**
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: 로그아웃됨
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Success' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 */
router.post('/logout', authController.logout);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [인증]
 *     summary: 토큰 갱신
 *     description: |
 *       **refreshToken은 항상 회전된다.** 요청에 쓴 토큰은 즉시 폐기되고 새 토큰이 함께 발급되므로,
 *       클라이언트는 응답으로 받은 새 refreshToken을 반드시 저장해야 한다. 옛 토큰은 재사용할 수 없다.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: 갱신됨 (새 refreshToken 포함)
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
 *                         accessToken: { type: string }
 *                         refreshToken: { type: string }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401:
 *         description: 유효하지 않거나 이미 회전되어 폐기된 토큰
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/refresh', authController.refreshValidation, authController.refresh);

/**
 * @openapi
 * /auth/password/reset-request:
 *   post:
 *     tags: [인증]
 *     summary: 비밀번호 재설정 인증번호 발송 (AU03 1단계)
 *     description: |
 *       **가입 여부와 무관하게 항상 200과 같은 메시지를 반환한다**(계정 열거 공격 방지).
 *       가입된 이메일인 경우에만 실제로 메일이 발송된다.
 *
 *       회원가입용 인증번호와는 DB에서 분리되어 있어 서로 교차 사용할 수 없다.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: 가입되어 있다면 발송됨 (없어도 같은 응답)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Success' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post(
  '/password/reset-request',
  authController.passwordResetRequestValidation,
  authController.passwordResetRequest
);

/**
 * @openapi
 * /auth/password/reset:
 *   put:
 *     tags: [인증]
 *     summary: 비밀번호 재설정 (AU03 2단계)
 *     description: |
 *       인증번호 검증과 비밀번호 변경이 **한 번의 요청**으로 처리된다. 회원가입과 달리
 *       검증만 하는 단계가 따로 없다.
 *
 *       성공하면 해당 계정의 **기존 refreshToken이 모두 폐기**되어 다른 기기도 다시 로그인해야 한다.
 *
 *       메서드가 POST가 아니라 **PUT**이다.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code, newPassword]
 *             properties:
 *               email: { type: string, format: email }
 *               code: { type: string, description: reset-request로 받은 6자리 }
 *               newPassword:
 *                 type: string
 *                 description: 회원가입과 동일 정책 (8자 이상, 영문·숫자·특수문자)
 *     responses:
 *       200:
 *         description: 재설정됨
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Success' }
 *       400:
 *         description: 인증번호 불일치, 또는 가입되지 않은 이메일 (회원가입용 코드를 넣어도 400)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       410:
 *         description: 인증번호 만료
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.put('/password/reset', authController.passwordResetValidation, authController.passwordReset);

module.exports = router;
