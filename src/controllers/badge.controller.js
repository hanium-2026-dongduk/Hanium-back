const { param, validationResult } = require('express-validator');
const badgeService = require('../services/badge.service');
const response = require('../utils/response');

const childIdParamValidation = [
  param('childId').isInt({ min: 1 }).withMessage('childId는 양의 정수여야 합니다.').toInt(),
];

/**
 * GET /api/badges — 전체 배지 카탈로그 (MP02_RWD_03).
 *
 * 자녀와 무관한 정적 목록이다. 어떤 배지가 있는지 미리 보여주는 화면에서 쓴다.
 */
const getCatalog = async (req, res, next) => {
  try {
    return response.success(res, 200, '배지 목록을 조회했습니다.', badgeService.getCatalog());
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

/**
 * GET /api/badges/:childId — 자녀의 배지 현황 (MP02_RWD_03).
 *
 * 획득한 배지와 못 한 배지를 모두 상태와 함께 돌려준다.
 */
const getChildBadges = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const result = await badgeService.getChildBadges(req.user.user_id, req.params.childId);
    return response.success(res, 200, '배지 현황을 조회했습니다.', result);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

module.exports = {
  childIdParamValidation,
  getCatalog,
  getChildBadges,
};
