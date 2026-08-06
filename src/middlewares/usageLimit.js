const { ChildProfile, GuardianSetting, UsageDailySummary } = require('../models');
const response = require('../utils/response');
const { getSeoulDateString } = require('../services/usage.service');

/**
 * 재사용 가능한 사용 시간 제한 게이트 (미들웨어 팩토리).
 *
 * 이번 저장소(Week 2 시점)에는 이 미들웨어를 걸 실제 학습 콘텐츠 라우트(동화 생성,
 * 퀴즈 등, 개발자 B 담당)가 아직 없다. heartbeat 엔드포인트(POST /api/usage/heartbeat)는
 * 이 미들웨어를 쓰지 않고 usage.service 안에서 "기록"과 "초과 시 차단"을 같은
 * 트랜잭션으로 직접 수행한다. 이 미들웨어는 그와 달리 "아직 시작하지 않은 동작
 * (예: 동화 생성 시작)을 애초에 막는" 용도로, 개발자 B가 콘텐츠 라우트를 추가할 때
 * 아래처럼 바로 재사용하면 된다:
 *
 *   router.post(
 *     '/stories/generate',
 *     authenticate,
 *     checkUsageLimit({ getChildProfileId: (req) => req.body.child_profile_id }),
 *     storyController.generate
 *   );
 *
 * 정책:
 * - child_profile_id를 확정할 수 없거나(파라미터 누락/형식 오류) 소유권이 확인되지
 *   않으면 이 미들웨어는 판단을 보류하고 통과시킨다(그 라우트 자신의 validation/로직이
 *   처리하도록 위임).
 * - 소유권까지 확인된 뒤 DB 조회 자체가 실패하면(DB 장애 등) "판단할 수 없으니 통과"가
 *   아니라 **fail-closed**로 503을 반환한다. 이전 구현은 DB 에러를 조용히 삼켜 제한을
 *   그냥 통과시켰는데(fail-open), 아동 보호(사용 시간 제한) 기능이 인프라 장애 상황에서
 *   조용히 무력화되는 것은 이 기능의 목적에 반하므로 명시적으로 fail-closed로 바꿨다.
 * - 클라이언트가 보내는 어떤 헤더도 신뢰하지 않는다(X-Usage-Minutes류는 완전히 삭제).
 *
 * @param {object} options
 * @param {(req: import('express').Request) => number|string} options.getChildProfileId
 */
const checkUsageLimit = ({ getChildProfileId }) => {
  return async (req, res, next) => {
    try {
      if (!req.user) return next();

      const rawId = getChildProfileId(req);
      const childProfileId = Number.parseInt(rawId, 10);
      if (!Number.isInteger(childProfileId) || childProfileId <= 0) {
        return next();
      }

      const profile = await ChildProfile.findOne({
        where: { child_profile_id: childProfileId, user_id: req.user.user_id },
      });
      if (!profile) return next();

      const setting = await GuardianSetting.findOne({ where: { user_id: req.user.user_id } });
      if (!setting || setting.daily_usage_limit_minutes == null) return next();

      const usageDate = getSeoulDateString();
      const summary = await UsageDailySummary.findOne({
        where: { child_profile_id: childProfileId, usage_date: usageDate },
      });

      const accumulatedSeconds = summary ? summary.accumulated_seconds : 0;
      const limitSeconds = setting.daily_usage_limit_minutes * 60;

      if (accumulatedSeconds >= limitSeconds) {
        return response.error(res, 403, '오늘의 사용 시간이 초과되었습니다.', {
          limitMinutes: setting.daily_usage_limit_minutes,
          accumulatedSeconds,
        });
      }

      return next();
    } catch {
      return response.error(
        res,
        503,
        '사용 시간 제한 정보를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.'
      );
    }
  };
};

module.exports = { checkUsageLimit };
