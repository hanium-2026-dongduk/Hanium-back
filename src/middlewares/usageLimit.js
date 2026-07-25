const { GuardianSetting } = require('../models');
const response = require('../utils/response');

/**
 * 사용 시간 제한 미들웨어
 * 보호자가 설정한 일일 사용 제한 시간을 체크합니다.
 * 제한 시간 초과 시 403 응답을 반환합니다.
 *
 * 참고: 실제 사용 시간 추적은 프론트엔드에서 세션 시간을 누적하고
 * 이 미들웨어는 설정된 제한 값만 체크합니다.
 * 향후 usage_logs 테이블 추가 시 서버사이드 추적으로 전환 가능.
 */
const checkUsageLimit = async (req, res, next) => {
  try {
    // req.user가 없으면 (인증 미들웨어 미적용) 패스
    if (!req.user) return next();

    const setting = await GuardianSetting.findOne({
      where: { user_id: req.user.user_id },
    });

    // 설정이 없거나 제한이 미설정이면 통과
    if (!setting || !setting.daily_usage_limit_minutes) {
      return next();
    }

    // 프론트에서 보내는 X-Usage-Minutes 헤더로 현재 사용 시간 확인
    const usedMinutes = parseInt(req.headers['x-usage-minutes'], 10);

    if (!isNaN(usedMinutes) && usedMinutes >= setting.daily_usage_limit_minutes) {
      return response.error(
        res,
        403,
        '오늘의 사용 시간이 초과되었습니다.',
        { limit: setting.daily_usage_limit_minutes, used: usedMinutes }
      );
    }

    // 남은 시간 정보를 응답 헤더에 추가
    if (!isNaN(usedMinutes)) {
      const remaining = setting.daily_usage_limit_minutes - usedMinutes;
      res.set('X-Remaining-Minutes', String(Math.max(0, remaining)));
    }

    next();
  } catch (err) {
    // 미들웨어 에러는 조용히 패스 (서비스 중단 방지)
    next();
  }
};

module.exports = { checkUsageLimit };
