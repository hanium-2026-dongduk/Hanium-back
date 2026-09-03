const express = require('express');
const router = express.Router();
const stickerController = require('../controllers/sticker.controller');
const { authenticate } = require('../middlewares/auth');

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

// GET /api/stickers - 보낼 수 있는 스티커 목록 (PD04_STK_01)
router.get('/', stickerController.getCatalog);

// POST /api/stickers/send - 자녀에게 칭찬 스티커 발송 (PD04_STK_01)
router.post('/send', stickerController.sendValidation, stickerController.send);

// GET /api/stickers/received/:childId - 자녀가 받은 스티커 목록 (MP05_STK_01)
router.get(
  '/received/:childId',
  stickerController.receivedValidation,
  stickerController.getReceived
);

module.exports = router;
