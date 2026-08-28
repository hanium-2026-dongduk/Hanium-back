const { param, query, validationResult } = require('express-validator');
const rewardService = require('../services/reward.service');
const response = require('../utils/response');

const childIdParamValidation = [
  param('childId').isInt({ min: 1 }).withMessage('childId는 양의 정수여야 합니다.').toInt(),
];

const historyValidation = [
  param('childId').isInt({ min: 1 }).withMessage('childId는 양의 정수여야 합니다.').toInt(),
  query('page').optional().isInt({ min: 1 }).withMessage('page는 1 이상의 정수여야 합니다.'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: rewardService.MAX_HISTORY_LIMIT })
    .withMessage(`limit은 1 이상 ${rewardService.MAX_HISTORY_LIMIT} 이하의 정수여야 합니다.`),
  query('reason')
    .optional()
    .isIn(rewardService.REWARD_REASONS)
    .withMessage('알 수 없는 지급 사유입니다.'),
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
 * Express 5의 req.query는 읽기 전용이라 express-validator의 `.toInt()` 같은 새니타이저가
 * 값을 되돌려 쓰지 못한다(검증 자체는 정상 동작한다). 그대로 넘기면 문자열이 서비스의
 * Number.isInteger 검사에 걸려 조용히 기본값으로 떨어지므로, 여기서 직접 변환한다.
 *
 * @param {string|undefined} value
 * @returns {number|undefined}
 */
const toOptionalInt = (value) => (value === undefined ? undefined : Number(value));

/**
 * GET /api/rewards/:childId
 */
const getRewards = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const result = await rewardService.getRewards(req.user.user_id, req.params.childId);
    return response.success(res, 200, '리워드 정보를 조회했습니다.', result);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

/**
 * GET /api/rewards/:childId/summary — 메인 화면(MN02)용 경량 응답.
 */
const getSummary = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const result = await rewardService.getSummary(req.user.user_id, req.params.childId);
    return response.success(res, 200, '보유 포인트를 조회했습니다.', result);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

/**
 * GET /api/rewards/:childId/history — 포인트 획득 이력(RW03).
 */
const getHistory = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const result = await rewardService.getHistory(req.user.user_id, req.params.childId, {
      page: toOptionalInt(req.query.page),
      limit: toOptionalInt(req.query.limit),
      reason: req.query.reason,
      from: req.query.from,
      to: req.query.to,
    });
    return response.success(res, 200, '포인트 획득 이력을 조회했습니다.', result);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

module.exports = {
  childIdParamValidation,
  historyValidation,
  getRewards,
  getSummary,
  getHistory,
};
