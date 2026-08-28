const { param, validationResult } = require('express-validator');
const missionService = require('../services/mission.service');
const response = require('../utils/response');

const progressParamValidation = [
  param('childId').isInt({ min: 1 }).withMessage('childId는 양의 정수여야 합니다.').toInt(),
];

/**
 * GET /api/missions
 *
 * 자녀 비종속 정적 카탈로그다(인증만 필요, 소유권 검증 없음). DB를 타지 않으므로
 * 서비스 호출도 동기다.
 */
const getCatalog = (req, res, next) => {
  try {
    return response.success(res, 200, '미션 목록을 조회했습니다.', missionService.getCatalog());
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/missions/progress/:childId
 *
 * 오늘자 미션 행이 없으면 이 호출이 생성한다 — 부작용이 있는 GET이다(설계 문서 3-2절).
 * 스케줄러가 없는 구조에서 Week2 heartbeat와 동일한 선례를 따른다.
 */
const getProgress = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const result = await missionService.getTodayProgress(req.user.user_id, req.params.childId);
    return response.success(res, 200, '오늘의 미션 진행 상황을 조회했습니다.', result);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

module.exports = { getCatalog, progressParamValidation, getProgress };
