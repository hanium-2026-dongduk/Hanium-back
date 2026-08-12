const { GuardianSetting, UsageDailySummary } = require('../models');
const childService = require('./child.service');
const { getSeoulDateString } = require('../utils/dateUtils');
const { runWithDeadlockRetry } = require('../utils/dbRetry');

// heartbeat 하나가 크레딧할 수 있는 최대 경과 시간(초). 프론트와의 계약상 heartbeat는
// 30~60초 간격으로 호출되므로, 이보다 넉넉한 상한을 둬서 앱이 백그라운드로 갔다가 한참
// 뒤에 heartbeat를 보내거나(네트워크 재시도, 슬립 등) 의도적으로 느리게 보내는 경우에도
// 실제 경과 시간보다 크게 부풀려 적립되지 않게 한다.
const HEARTBEAT_CAP_SECONDS = 90;

const getDailyLimitSeconds = async (userId, transaction) => {
  const setting = await GuardianSetting.findOne({ where: { user_id: userId }, transaction });
  if (!setting || setting.daily_usage_limit_minutes == null) return null;
  return setting.daily_usage_limit_minutes * 60;
};

/**
 * (child_profile_id, usage_date) 요약 행을 잠근 상태로 찾거나 새로 만든다.
 * 같은 자녀의 그날 첫 heartbeat가 동시에 두 번 들어오는 경쟁 상황에서, 두 트랜잭션이
 * 모두 "없음"을 보고 동시에 INSERT를 시도할 수 있다 — UNIQUE(child_profile_id, usage_date)
 * 제약이 이를 막고, 실패한 쪽은 다시 조회(이번엔 상대 트랜잭션의 커밋을 기다려 잠금을
 * 얻은 뒤)해 같은 행을 찾아 정상적으로 누적을 이어간다.
 */
const findOrCreateSummary = async (childProfileId, usageDate, t) => {
  let summary = await UsageDailySummary.findOne({
    where: { child_profile_id: childProfileId, usage_date: usageDate },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  if (summary) return summary;

  try {
    summary = await UsageDailySummary.create(
      {
        child_profile_id: childProfileId,
        usage_date: usageDate,
        accumulated_seconds: 0,
        last_heartbeat_at: null,
      },
      { transaction: t }
    );
  } catch (err) {
    if (err.name !== 'SequelizeUniqueConstraintError') throw err;
    summary = await UsageDailySummary.findOne({
      where: { child_profile_id: childProfileId, usage_date: usageDate },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
  }

  return summary;
};

/**
 * 사용 시간 heartbeat 기록.
 *
 * 클라이언트가 보내는 어떤 시간/분 값도 신뢰하지 않는다 — 오직 "지금 요청이 도착했다"는
 * 사실과 서버가 이전에 기록해둔 last_heartbeat_at만을 근거로, 그 차이(상한 캡 적용)만큼만
 * 서버 시계 기준으로 누적한다. 소유권 확인은 child.service.getById(존재하지 않거나 다른
 * 유저의 프로필이면 404)에 위임해 다른 유저의 사용량과 섞이지 않게 한다.
 *
 * @param {number} userId
 * @param {number} childProfileId
 * @returns {object} { accumulatedSeconds, limitSeconds, remainingSeconds }
 */
const recordHeartbeat = async (userId, childProfileId) => {
  const profile = await childService.getById(userId, childProfileId);

  const outcome = await runWithDeadlockRetry(async (t) => {
    const now = new Date();
    const usageDate = getSeoulDateString(now);

    const summary = await findOrCreateSummary(profile.child_profile_id, usageDate, t);

    let deltaSeconds = 0;
    if (summary.last_heartbeat_at) {
      const elapsedSeconds = (now.getTime() - new Date(summary.last_heartbeat_at).getTime()) / 1000;
      deltaSeconds = Math.max(0, Math.min(elapsedSeconds, HEARTBEAT_CAP_SECONDS));
    }
    // 그날의 첫 heartbeat는 비교 기준(last_heartbeat_at)이 없으므로 0을 적립한다
    // (과다 적립보다 소폭 과소 적립이 낫다는 원칙).

    summary.accumulated_seconds += Math.round(deltaSeconds);
    summary.last_heartbeat_at = now;
    await summary.save({ transaction: t });

    const limitSeconds = await getDailyLimitSeconds(userId, t);

    return { accumulatedSeconds: summary.accumulated_seconds, limitSeconds };
  });

  const limitReached =
    outcome.limitSeconds != null && outcome.accumulatedSeconds >= outcome.limitSeconds;
  const remainingSeconds =
    outcome.limitSeconds != null ? Math.max(0, outcome.limitSeconds - outcome.accumulatedSeconds) : null;

  if (limitReached) {
    const error = new Error('오늘의 사용 시간이 초과되었습니다.');
    error.statusCode = 403;
    throw error;
  }

  return {
    accumulatedSeconds: outcome.accumulatedSeconds,
    limitSeconds: outcome.limitSeconds,
    remainingSeconds,
  };
};

/**
 * 오늘 누적 사용 시간 조회 (읽기 전용)
 * @param {number} userId
 * @param {number} childProfileId
 */
const getTodayUsage = async (userId, childProfileId) => {
  const profile = await childService.getById(userId, childProfileId);
  const usageDate = getSeoulDateString();

  const summary = await UsageDailySummary.findOne({
    where: { child_profile_id: profile.child_profile_id, usage_date: usageDate },
  });

  const limitSeconds = await getDailyLimitSeconds(userId);
  const accumulatedSeconds = summary ? summary.accumulated_seconds : 0;
  const remainingSeconds = limitSeconds != null ? Math.max(0, limitSeconds - accumulatedSeconds) : null;

  return {
    date: usageDate,
    accumulatedSeconds,
    limitSeconds,
    remainingSeconds,
    limitReached: limitSeconds != null && accumulatedSeconds >= limitSeconds,
  };
};

module.exports = {
  recordHeartbeat,
  getTodayUsage,
  // utils/dateUtils로 옮겼지만, 이미 이 경로로 가져다 쓰는 곳(middlewares/usageLimit.js)이
  // 있어 재export로 유지한다. 신규 코드는 utils/dateUtils에서 직접 가져올 것.
  getSeoulDateString,
  HEARTBEAT_CAP_SECONDS,
};
