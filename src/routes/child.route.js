const express = require('express');
const router = express.Router();
const childController = require('../controllers/child.controller');
const { authenticate } = require('../middlewares/auth');

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

/**
 * @openapi
 * /children:
 *   post:
 *     tags: [자녀 프로필]
 *     summary: 자녀 프로필 생성 (AU04)
 *     description: |
 *       **첫 프로필은 자동으로 활성(`is_active: true`)이 되고, 두 번째부터는 비활성으로 생성된다.**
 *       활성 전환은 `PATCH /children/{id}/activate`로만 가능하다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [child_name]
 *             properties:
 *               child_name: { type: string, minLength: 1, maxLength: 100, example: 민준 }
 *               age: { type: integer, minimum: 1, maximum: 15, example: 7 }
 *               learning_level: { type: string, enum: [beginner, intermediate, advanced] }
 *               vocabulary_level: { type: string, maxLength: 30 }
 *               profile_image_url: { type: string, format: uri, maxLength: 500 }
 *     responses:
 *       201:
 *         description: 생성됨
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
 *                         profile: { $ref: '#/components/schemas/ChildProfile' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/', childController.createValidation, childController.create);

/**
 * @openapi
 * /children:
 *   get:
 *     tags: [자녀 프로필]
 *     summary: 자녀 프로필 목록 (AU04)
 *     description: 로그인한 보호자 소유의 프로필만 생성순으로 반환한다.
 *     responses:
 *       200:
 *         description: 목록
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
 *                         profiles:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/ChildProfile' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/', childController.getAll);

/**
 * @openapi
 * /children/{id}:
 *   get:
 *     tags: [자녀 프로필]
 *     summary: 자녀 프로필 단건 조회
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: 프로필
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
 *                         profile: { $ref: '#/components/schemas/ChildProfile' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', childController.idParamValidation, childController.getById);

/**
 * @openapi
 * /children/{id}:
 *   put:
 *     tags: [자녀 프로필]
 *     summary: 자녀 프로필 수정 (AU04)
 *     description: |
 *       메서드가 PATCH가 아니라 **PUT**이다.
 *
 *       허용된 필드만 반영되고 나머지는 조용히 무시된다(mass assignment 방지).
 *       **반영할 필드가 하나도 없는 요청은 400으로 거부된다.**
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               child_name: { type: string, maxLength: 100 }
 *               age: { type: integer, minimum: 1, maximum: 15 }
 *               learning_level: { type: string, enum: [beginner, intermediate, advanced] }
 *               vocabulary_level: { type: string, maxLength: 30 }
 *               profile_image_url: { type: string, format: uri, maxLength: 500 }
 *     responses:
 *       200:
 *         description: 수정됨
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
 *                         profile: { $ref: '#/components/schemas/ChildProfile' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.put(
  '/:id',
  childController.idParamValidation,
  childController.updateValidation,
  childController.update
);

/**
 * @openapi
 * /children/{id}:
 *   delete:
 *     tags: [자녀 프로필]
 *     summary: 자녀 프로필 삭제
 *     description: |
 *       **연결된 데이터가 함께 삭제된다** — 출석 기록, 미션, 포인트 지갑과 원장, 배지, 받은 스티커.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: 삭제됨
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Success' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', childController.idParamValidation, childController.remove);

/**
 * @openapi
 * /children/{id}/activate:
 *   patch:
 *     tags: [자녀 프로필]
 *     summary: 활성 프로필 전환 (AU04)
 *     description: |
 *       한 보호자에게 활성 프로필은 **항상 최대 1개**다. 이 API가 유일한 전환 수단이며,
 *       프로필 수정으로는 `is_active`를 바꿀 수 없다.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: 전환됨
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
 *                         profile: { $ref: '#/components/schemas/ChildProfile' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id/activate', childController.idParamValidation, childController.activate);

module.exports = router;
