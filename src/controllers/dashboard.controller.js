const { param, validationResult } = require('express-validator');
const dashboardService = require('../services/dashboard.service');
const response = require('../utils/response');

const summaryValidation = [param('childId').isInt({ min: 1 }).toInt()];

const summary = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return response.error(res, 400, '입력값을 확인해주세요.', errors.array());

    const result = await dashboardService.getSummary(req.user.user_id, req.params.childId);
    return response.success(res, 200, '대시보드 요약을 조회했습니다.', result);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

module.exports = { summaryValidation, summary };