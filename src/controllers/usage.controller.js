const { body, param, query, validationResult } = require('express-validator');
const usageService = require('../services/usage.service');
const response = require('../utils/response');

const heartbeatValidation = [
  body('child_profile_id')
    .isInt({ min: 1 })
    .withMessage('child_profile_id는 양의 정수여야 합니다.')
    .toInt(),
];

const todayParamValidation = [
  param('childId').isInt({ min: 1 }).withMessage('childId는 양의 정수여야 합니다.').toInt(),
];

/**
 * POST /api/usage/heartbeat
 */
const heartbeat = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const result = await usageService.recordHeartbeat(req.user.user_id, req.body.child_profile_id);
    return response.success(res, 200, '사용 시간이 기록되었습니다.', result);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

/**
 * GET /api/usage/:childId/today
 */
const getToday = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const result = await usageService.getTodayUsage(req.user.user_id, req.params.childId);
    return response.success(res, 200, '오늘의 사용 시간을 조회했습니다.', result);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

const summaryValidation = [
  param('childId').isInt({ min: 1 }).withMessage('childId는 양의 정수여야 합니다.').toInt(),
  query('from')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('from은 YYYY-MM-DD 형식이어야 합니다.'),
  query('to')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('to는 YYYY-MM-DD 형식이어야 합니다.'),
];

/**
 * GET /api/usage/:childId/summary?from&to
 */
const getSummary = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const { from, to } = req.query;
    const result = await usageService.getSummary(req.user.user_id, req.params.childId, { from, to });
    return response.success(res, 200, '기간별 사용 시간을 조회했습니다.', result);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

module.exports = { heartbeatValidation, heartbeat, todayParamValidation, getToday, getSummary, summaryValidation};
