const { body, param, query, validationResult } = require('express-validator');
const attendanceService = require('../services/attendance.service');
const response = require('../utils/response');

const checkValidation = [
  body('child_profile_id')
    .isInt({ min: 1 })
    .withMessage('child_profile_id는 양의 정수여야 합니다.')
    .toInt(),
];

const monthlyValidation = [
  param('childId').isInt({ min: 1 }).withMessage('childId는 양의 정수여야 합니다.').toInt(),
  query('month')
    .optional()
    .matches(/^\d{4}-(0[1-9]|1[0-2])$/)
    .withMessage('month는 YYYY-MM 형식이어야 합니다.'),
];

/**
 * POST /api/attendance/check
 *
 * 그날 첫 출석은 201, 같은 날 재요청은 200으로 구분한다(설계 문서 7-1절).
 * 재요청이 오류가 아닌 이유는 checkIn이 멱등이기 때문 — 앱이 재시도해도 안전하다.
 */
const check = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const result = await attendanceService.checkIn(req.user.user_id, req.body.child_profile_id);

    return result.alreadyChecked
      ? response.success(res, 200, '오늘은 이미 출석했습니다.', result)
      : response.success(res, 201, '출석이 기록되었습니다.', result);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

/**
 * GET /api/attendance/:childId?month=YYYY-MM
 */
const getMonthly = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const result = await attendanceService.getMonthly(req.user.user_id, req.params.childId, {
      month: req.query.month,
    });
    return response.success(res, 200, '월간 출석 현황을 조회했습니다.', result);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

module.exports = { checkValidation, check, monthlyValidation, getMonthly };
