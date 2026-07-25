const { body, validationResult } = require('express-validator');
const guardianService = require('../services/guardian.service');
const response = require('../utils/response');

/**
 * PIN 설정 유효성 검사
 */
const setPinValidation = [
  body('pin')
    .isLength({ min: 4, max: 6 })
    .withMessage('PIN은 4~6자리여야 합니다.')
    .isNumeric()
    .withMessage('PIN은 숫자만 입력 가능합니다.'),
];

/**
 * PIN 검증 유효성 검사
 */
const verifyPinValidation = [
  body('pin')
    .isLength({ min: 4, max: 6 })
    .withMessage('PIN은 4~6자리여야 합니다.')
    .isNumeric()
    .withMessage('PIN은 숫자만 입력 가능합니다.'),
];

/**
 * 보호자 설정 업데이트 유효성 검사
 */
const updateSettingsValidation = [
  body('daily_usage_limit_minutes')
    .optional()
    .isInt({ min: 1, max: 1440 })
    .withMessage('사용 제한 시간은 1~1440분 사이여야 합니다.'),
  body('push_enabled')
    .optional()
    .isBoolean()
    .withMessage('push_enabled는 true/false여야 합니다.'),
];

/**
 * PUT /api/guardian/pin
 * PIN 설정/변경
 */
const setPin = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const { pin } = req.body;
    const result = await guardianService.setPin(req.user.user_id, pin);

    return response.success(res, 200, result.message);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

/**
 * POST /api/guardian/pin/verify
 * PIN 검증
 */
const verifyPin = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const { pin } = req.body;
    const result = await guardianService.verifyPin(req.user.user_id, pin);

    return response.success(res, 200, 'PIN이 확인되었습니다.', result);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

/**
 * PUT /api/guardian/settings
 * 보호자 설정 업데이트
 */
const updateSettings = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const { daily_usage_limit_minutes, push_enabled } = req.body;
    const setting = await guardianService.updateSettings(req.user.user_id, {
      daily_usage_limit_minutes,
      push_enabled,
    });

    return response.success(res, 200, '보호자 설정이 업데이트되었습니다.', { setting });
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

/**
 * GET /api/guardian/settings
 * 보호자 설정 조회
 */
const getSettings = async (req, res, next) => {
  try {
    const setting = await guardianService.getSettings(req.user.user_id);
    return response.success(res, 200, '보호자 설정을 조회했습니다.', { setting });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  setPinValidation,
  setPin,
  verifyPinValidation,
  verifyPin,
  updateSettingsValidation,
  updateSettings,
  getSettings,
};
