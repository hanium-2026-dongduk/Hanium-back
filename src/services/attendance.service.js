const { Op } = require('sequelize');
const { AttendanceLog } = require('../models');
const childService = require('./child.service');
const rewardService = require('./reward.service');
const missionService = require('./mission.service');
const badgeService = require('./badge.service');
const { runWithDeadlockRetry } = require('../utils/dbRetry');
const { getStreakBonusPoints } = require('../config/streakBonuses');
const {
  getSeoulDateString,
  getSeoulMonthString,
  getMonthRange,
  addDays,
  isValidMonthString,
} = require('../utils/dateUtils');

const badRequest = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

/**
 * 오늘자 출석 로그를 만든다. 이미 있으면 만들지 않고 "이미 출석함"을 알린다.
 *
 * UNIQUE(child_profile_id, attendance_date)가 하루 1회를 강제하므로, 동시에 도착한 두
 * 요청 중 INSERT에 성공한 쪽만 created:true를 받는다. 실패한 쪽은 중복 오류를 삼키고
 * created:false로 돌아가 포인트 지급 경로를 타지 않는다 — 출석 보상이 두 번 나가지
 * 않게 하는 첫 번째 방어선이다(두 번째는 addPoints의 멱등키).
 *
 * @returns {Promise<{ created: boolean }>}
 */
const createAttendanceLogIfAbsent = async (childProfileId, attendanceDate, t) => {
  const where = { child_profile_id: childProfileId, attendance_date: attendanceDate };

  const existing = await AttendanceLog.findOne({ where, transaction: t });
  if (existing) return { created: false };

  try {
    await AttendanceLog.create({ ...where, checked_at: new Date() }, { transaction: t });
    return { created: true };
  } catch (err) {
    if (err.name !== 'SequelizeUniqueConstraintError') throw err;
    return { created: false };
  }
};

/**
 * 연속 출석일을 갱신한다(설계 문서 3-3절).
 *
 * 어제 출석했으면 +1, 그 외에는 1로 리셋한다. last_activity_date가 이미 오늘이면
 * 이번 출석 이전에 다른 경로로 갱신됐다는 뜻이므로 건드리지 않는다.
 *
 * @returns {number} 갱신된 연속 출석일
 */
const applyStreak = (wallet, attendanceDate) => {
  const yesterday = addDays(attendanceDate, -1);

  if (wallet.last_activity_date === attendanceDate) {
    return wallet.streak_days;
  }

  wallet.streak_days = wallet.last_activity_date === yesterday ? wallet.streak_days + 1 : 1;
  wallet.last_activity_date = attendanceDate;

  return wallet.streak_days;
};

/**
 * 출석 체크(MN04). 소유권 검증 → 오늘자 로그 생성(멱등) → 최초 성공 시에만
 * 'attendance' 미션 진행 + 연속 출석일 갱신 + 마일스톤 보너스 지급을 한 트랜잭션에서 수행한다.
 *
 * 같은 날 두 번째 요청은 아무것도 바꾸지 않고 alreadyChecked:true로 돌아간다 —
 * 앱이 재실행/네트워크 재시도로 여러 번 호출해도 안전하다.
 *
 * **잠금 순서**: 출석 로그 → 미션 행 → 지갑 행. mission.service.recordProgress가 쓰는
 * 미션 → 지갑 순서를 그대로 이어받기 위해, 출석 포인트를 직접 지급하지 않고 미션을 통해
 * 먼저 지급한 뒤에 지갑의 streak을 갱신한다. 순서를 뒤집으면(지갑 먼저) 두 서비스가 서로
 * 반대 방향으로 잠금을 잡아 교착이 생긴다.
 *
 * 출석 자체의 포인트는 'attendance' 데일리 미션의 보상(mission_reward)으로 지급된다 —
 * 같은 출석에 미션 보상과 별도 출석 보상이 이중으로 붙지 않게 하기 위함이다.
 *
 * @param {number} userId - 소유권 검증용
 * @param {number} childProfileId
 * @returns {Promise<{ alreadyChecked: boolean, attendanceDate: string, streakDays: number, pointsEarned: number }>}
 */
const checkIn = async (userId, childProfileId) => {
  const profile = await childService.getById(userId, childProfileId);
  const attendanceDate = getSeoulDateString();

  // checkIn은 언제나 최상위 트랜잭션이다 — 외부 트랜잭션을 받지 않으므로(설계 문서 5-3절
  // 시그니처) 데드락 재시도를 여기서 책임진다.
  const result = await runWithDeadlockRetry(async (t) => {
    const { created } = await createAttendanceLogIfAbsent(profile.child_profile_id, attendanceDate, t);

    if (!created) {
      const wallet = await rewardService.getOrCreateWallet(profile.child_profile_id, { transaction: t });
      return {
        alreadyChecked: true,
        attendanceDate,
        streakDays: wallet.streak_days,
        pointsEarned: 0,
      };
    }

    const missionResult = await missionService.recordProgress({
      childProfileId: profile.child_profile_id,
      eventType: 'attendance',
      transaction: t,
    });
    const missionPoints = missionResult.reward?.pointsAdded ?? 0;

    const wallet = await rewardService.getOrCreateWallet(profile.child_profile_id, { transaction: t });
    const streakDays = applyStreak(wallet, attendanceDate);
    await wallet.save({ transaction: t });

    // 마일스톤(3·7·14·30일)에 정확히 도달한 날만 1회 지급된다. 멱등키에 출석 날짜가 들어가
    // 있어 같은 날 재시도로 중복 지급되지 않는다.
    const bonusPoints = getStreakBonusPoints(streakDays);
    let bonusAdded = 0;

    if (bonusPoints > 0) {
      const bonus = await rewardService.addPoints({
        childProfileId: profile.child_profile_id,
        points: bonusPoints,
        reason: 'streak_bonus',
        idempotencyKey: `streak:${profile.child_profile_id}:${attendanceDate}`,
        metadata: { streakDays, attendanceDate },
        transaction: t,
      });
      bonusAdded = bonus.pointsAdded;
    }

    return {
      alreadyChecked: false,
      attendanceDate,
      streakDays,
      pointsEarned: missionPoints + bonusAdded,
    };
  });

  // 출석 일수·연속일·포인트가 모두 확정된 뒤에 배지를 판정한다.
  // 트랜잭션 **밖**에서 부르는 이유: 배지는 부가 기능이라 판정이 실패해도 출석 자체를
  // 되돌리면 안 된다. 이번에 놓쳐도 다음 이벤트 때 다시 재므로 누락되지 않는다.
  const badgesAwarded = await badgeService.evaluateQuietly(profile.child_profile_id);

  return { ...result, badgesAwarded };
};

/**
 * 조회 대상 월의 출석률 분모를 정한다(설계 문서 7-2절).
 *
 * 진행 중인 이번 달은 아직 오지 않은 날까지 분모에 넣으면 월초마다 출석률이 부당하게
 * 낮아 보이므로 오늘까지 경과한 일수만 센다. 지난 달·다음 달은 월 전체 일수를 쓴다.
 *
 * ⚠️ 이 계산 방식은 기획 확인이 필요하다(설계 문서 8절).
 */
const resolveDenominator = (month, daysInMonth, today) => {
  if (month !== today.slice(0, 7)) return daysInMonth;
  return Number(today.slice(8, 10));
};

/**
 * GET /api/attendance/:childId?month=YYYY-MM — 월간 출석 현황(MP03/PD02).
 *
 * @param {number} userId - 소유권 검증용
 * @param {number} childProfileId
 * @param {object} [query]
 * @param {string} [query.month] - YYYY-MM (기본값: 이번 달, KST)
 * @returns {Promise<{ childProfileId: number, month: string, attendedDates: string[],
 *                     attendedCount: number, denominator: number, attendanceRate: number,
 *                     currentStreak: number }>}
 */
const getMonthly = async (userId, childProfileId, { month } = {}) => {
  if (month !== undefined && !isValidMonthString(month)) {
    throw badRequest('month는 YYYY-MM 형식이어야 합니다.');
  }

  const profile = await childService.getById(userId, childProfileId);
  const targetMonth = month ?? getSeoulMonthString();
  const { firstDate, lastDate, daysInMonth } = getMonthRange(targetMonth);

  const logs = await AttendanceLog.findAll({
    where: {
      child_profile_id: profile.child_profile_id,
      attendance_date: { [Op.between]: [firstDate, lastDate] },
    },
    order: [['attendance_date', 'ASC']],
  });

  const wallet = await rewardService.getOrCreateWallet(profile.child_profile_id);
  const denominator = resolveDenominator(targetMonth, daysInMonth, getSeoulDateString());
  const attendedCount = logs.length;

  return {
    childProfileId: Number(profile.child_profile_id),
    month: targetMonth,
    attendedDates: logs.map((log) => log.attendance_date),
    attendedCount,
    denominator,
    // 소수 1자리 반올림. 분모는 최소 1이라 0으로 나눌 일이 없다.
    attendanceRate: Math.round((attendedCount / denominator) * 1000) / 10,
    currentStreak: wallet.streak_days,
  };
};

module.exports = {
  checkIn,
  getMonthly,
  applyStreak,
};
