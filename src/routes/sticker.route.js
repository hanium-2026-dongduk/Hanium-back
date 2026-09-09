const express = require('express');
const router = express.Router();
const stickerController = require('../controllers/sticker.controller');
const { authenticate } = require('../middlewares/auth');

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

/**
 * @openapi
 * /stickers:
 *   get:
 *     tags: [스티커]
 *     summary: 보낼 수 있는 스티커 목록 (PD04_STK_01)
 *     description: 보호자가 무엇을 보낼지 고르는 화면에서 쓴다. `icon_key`는 URL이 아니라 키다.
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
 *                         stickers:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               sticker_code: { type: string, example: well_done }
 *                               name: { type: string, example: 잘했어요 }
 *                               icon_key: { type: string, example: thumbs_up }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/', stickerController.getCatalog);

/**
 * @openapi
 * /stickers/send:
 *   post:
 *     tags: [스티커]
 *     summary: 칭찬 스티커 발송 (PD04_STK_01)
 *     description: |
 *       **멱등하지 않다** — 같은 스티커를 여러 번 보내는 것이 정상이다(배지는 "한 번 달성",
 *       스티커는 "계속 주고받는 것"). 중복 발송돼도 포인트가 나가지 않아 해가 없어 멱등키를 두지 않았다.
 *       버튼 연타가 문제라면 프론트에서 잠근다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [child_profile_id, sticker_code]
 *             properties:
 *               child_profile_id: { type: integer, minimum: 1 }
 *               sticker_code: { type: string, example: well_done }
 *               message:
 *                 type: string
 *                 maxLength: 200
 *                 description: 함께 보내는 한마디(선택). 공백만 있으면 없는 것으로 본다.
 *     responses:
 *       201:
 *         description: 발송됨
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
 *                         sticker:
 *                           type: object
 *                           properties:
 *                             sticker_send_id: { type: integer }
 *                             sticker_code: { type: string }
 *                             name: { type: string }
 *                             icon_key: { type: string, nullable: true }
 *                             message: { type: string, nullable: true }
 *                             sent_at: { type: string, format: date-time }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/send', stickerController.sendValidation, stickerController.send);

/**
 * @openapi
 * /stickers/received/{childId}:
 *   get:
 *     tags: [스티커]
 *     summary: 받은 스티커 목록 (MP05_STK_01)
 *     description: |
 *       최신순 페이지네이션. 정렬은 `sent_at DESC, sticker_send_id DESC`로, 같은 초에 여러 건이
 *       들어와도 페이지 경계에서 항목이 중복/누락되지 않는다.
 *
 *       카탈로그에서 사라진 코드도 목록에서 빠지지 않는다 — 이름을 못 찾으면 코드를 그대로 쓴다.
 *     parameters:
 *       - $ref: '#/components/parameters/childId'
 *       - name: page
 *         in: query
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
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
 *                         items:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               sticker_send_id: { type: integer }
 *                               sticker_code: { type: string }
 *                               name: { type: string }
 *                               icon_key: { type: string, nullable: true }
 *                               message: { type: string, nullable: true }
 *                               sent_at: { type: string, format: date-time }
 *                         pagination: { $ref: '#/components/schemas/Pagination' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/received/:childId',
  stickerController.receivedValidation,
  stickerController.getReceived
);

module.exports = router;
