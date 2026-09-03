const { body, param, query, validationResult } = require('express-validator');
const stickerService = require('../services/sticker.service');
const response = require('../utils/response');
const { STICKER_CODES, MAX_MESSAGE_LENGTH } = require('../config/stickerCatalog');

const sendValidation = [
  body('child_profile_id')
    .isInt({ min: 1 })
    .withMessage('child_profile_id는 양의 정수여야 합니다.')
    .toInt(),
  body('sticker_code').isIn(STICKER_CODES).withMessage('알 수 없는 스티커입니다.'),
  body('message')
    .optional({ nullable: true })
    .isLength({ max: MAX_MESSAGE_LENGTH })
    .withMessage(`한마디는 ${MAX_MESSAGE_LENGTH}자까지 쓸 수 있습니다.`),
];

const receivedValidation = [
  param('childId').isInt({ min: 1 }).withMessage('childId는 양의 정수여야 합니다.').toInt(),
  query('page').optional().isInt({ min: 1 }).withMessage('page는 1 이상의 정수여야 합니다.'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: stickerService.MAX_LIMIT })
    .withMessage(`limit은 1 이상 ${stickerService.MAX_LIMIT} 이하의 정수여야 합니다.`),
];

/**
 * Express 5의 req.query는 읽기 전용이라 express-validator의 `.toInt()`가 값을 되돌려
 * 쓰지 못한다(reward.controller와 동일 사유). 여기서 직접 변환한다.
 *
 * @param {string|undefined} value
 * @returns {number|undefined}
 */
const toOptionalInt = (value) => (value === undefined ? undefined : Number(value));

/**
 * GET /api/stickers — 보낼 수 있는 스티커 목록 (PD04_STK_01).
 */
const getCatalog = async (req, res, next) => {
  try {
    return response.success(res, 200, '스티커 목록을 조회했습니다.', stickerService.getCatalog());
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

/**
 * POST /api/stickers/send — 자녀에게 칭찬 스티커 발송 (PD04_STK_01).
 */
const send = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const result = await stickerService.send(req.user.user_id, {
      childProfileId: req.body.child_profile_id,
      stickerCode: req.body.sticker_code,
      message: req.body.message,
    });
    return response.success(res, 201, '칭찬 스티커를 보냈습니다.', result);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

/**
 * GET /api/stickers/received/:childId — 자녀가 받은 스티커 목록 (MP05_STK_01).
 */
const getReceived = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const result = await stickerService.getReceived(req.user.user_id, req.params.childId, {
      page: toOptionalInt(req.query.page),
      limit: toOptionalInt(req.query.limit),
    });
    return response.success(res, 200, '받은 스티커를 조회했습니다.', result);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

module.exports = {
  sendValidation,
  receivedValidation,
  getCatalog,
  send,
  getReceived,
};
