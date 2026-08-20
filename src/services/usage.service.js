const { GuardianSetting, UsageDailySummary, sequelize } = require('../models');
const childService = require('./child.service');

// heartbeat 하나가 크레딧할 수 있는 최대 경과 시간(초). 프론트와의 계약상 heartbeat는
// 30~60초 간격으로 호출되므로, 이보다 넉넉한 상한을 둬서 앱이 백그라운드로 갔다가 한참
// 뒤에 heartbeat를 보내거나(네트워크 재시도, 슬립 등) 의도적으로 느리게 보내는 경우에도
// 실제 경과 시간보다 크게 부풀려 적립되지 않게 한다.
const HEARTBEAT_CAP_SECONDS = 90;

/**
 * Asia/Seoul 캘린더 기준 날짜 문자열(YYYY-MM-DD)을 반환한다.
 * 서버 프로세스가 어느 타임존에서 구동되든 항상 KST 자정을 하루의 경계로 삼는다.
 */
const getSeoulDateString = (date = new Date()) => {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(date);
};

const MAX_DEADLOCK_RETRIES = 3;

const isDeadlockError = (err) => {
  return err?.original?.code === 'ER_LOCK_DEADLOCK' || err?.parent?.code === 'ER_LOCK_DEADLOCK';
};

/**
 * findOrCreateSummary의 "없으면 INSERT, 유니크 충돌 나면 재조회" 패턴은, 같은 자녀의
 * 그날 첫 heartbeat가 여러 개 동시에 도착하면 InnoDB가 갭 락 경합으로 데드락을 낼 수 있다
 * (여러 트랜잭션이 동시에 "없음"을 보고 INSERT를 시도하는 전형적인 상황). 데드락은
 * MySQL이 한쪽 트랜잭션을 강제로 롤백시켜 해결하는 정상적인 동시성 제어 메커니즘이므로,
 * 그 트랜잭션만 짧게 재시도하면 안전하게 완료된다.
 */
const runWithDeadlockRetry = async (fn) => {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_DEADLOCK_RETRIES; attempt += 1) {
    try {
      return await sequelize.transaction(fn);
    } catch (err) {
      lastErr = err;
      if (!isDeadlockError(err) || attempt === MAX_DEADLOCK_RETRIES) {
        throw err;
      }
    }
  }
  throw lastErr;
};

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
  getSeoulDateString,
  HEARTBEAT_CAP_SECONDS,
};
