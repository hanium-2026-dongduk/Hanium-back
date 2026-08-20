const { ChildBadge } = require('../models');
const childService = require('./child.service');
const { withTransaction } = require('../utils/dbRetry');
const { BADGE_CATALOG, EVALUABLE_BADGES, getBadgeDefinition } = require('../config/badgeCatalog');
const { getEvaluator } = require('./badgeEvaluators');

/**
 * 배지 서비스 (RW04_ACH_02 — 조건 기반 배지 획득, MP02_RWD_03 — 보유 배지 확인).
 *
 * 배지 종류는 코드 상수(src/config/badgeCatalog.js), 획득 기록만 DB(child_badges)다.
 */

/** 자녀별 배지 상태. */
const BADGE_STATUS = {
  /** 획득함 */
  EARNED: 'earned',
  /** 아직 조건 미달 */
  LOCKED: 'locked',
  /** 판정 기능이 아직 없음(개발자 B 데이터 대기) */
  COMING_SOON: 'coming_soon',
};

/**
 * 전체 배지 카탈로그. 인증만 필요하고 자녀와 무관한 정적 목록이다.
 * @returns {{ badges: Array }}
 */
const getCatalog = () => {
  return {
    badges: BADGE_CATALOG.map((badge) => ({
      badge_code: badge.badge_code,
      name: badge.name,
      description: badge.description,
      icon_key: badge.icon_key,
      // 조건 수치는 노출한다 — 프론트가 "10일 중 3일" 같은 진행도를 보여줄 수 있어야 한다.
      condition: badge.condition,
      evaluable: badge.evaluable,
    })),
  };
};

/**
 * 자녀의 배지 현황. 획득한 것과 못 한 것을 모두 돌려준다.
 *
 * 못 딴 배지를 감추지 않는 이유: MP02_RWD_03이 "획득한 배지 표시"이고, 아이 앱에서는
 * 잠긴 배지를 보여주는 것 자체가 동기부여이기 때문이다. 다만 "아직 못 딴 것"(locked)과
 * "판정 기능이 없는 것"(coming_soon)은 구분해서 준다 — 후자는 아무리 해도 못 따므로
 * 프론트가 "곧 열려요"로 다르게 표시해야 한다.
 *
 * @param {number} userId
 * @param {number} childProfileId
 * @returns {Promise<{ badges: Array, earned_count: number, total_count: number }>}
 */
const getChildBadges = async (userId, childProfileId) => {
  const profile = await childService.getById(userId, childProfileId);

  const owned = await ChildBadge.findAll({
    where: { child_profile_id: profile.child_profile_id },
  });
  const awardedAtByCode = new Map(owned.map((row) => [row.badge_code, row.awarded_at]));

  const badges = BADGE_CATALOG.map((badge) => {
    const awardedAt = awardedAtByCode.get(badge.badge_code);
    let status = BADGE_STATUS.LOCKED;
    if (awardedAt) {
      status = BADGE_STATUS.EARNED;
    } else if (!badge.evaluable) {
      status = BADGE_STATUS.COMING_SOON;
    }

    return {
      badge_code: badge.badge_code,
      name: badge.name,
      description: badge.description,
      icon_key: badge.icon_key,
      condition: badge.condition,
      status,
      awarded_at: awardedAt || null,
    };
  });

  return {
    badges,
    earned_count: awardedAtByCode.size,
    total_count: BADGE_CATALOG.length,
  };
};

/**
 * 조건을 만족한 배지를 수여한다. **멱등하다** — 이미 가진 배지는 건너뛴다.
 *
 * 포인트를 주지 않는다. 배지는 성취 표시일 뿐이고, 배지에도 포인트를 붙이면 같은 행동에
 * 미션 보상과 배지 보상이 이중으로 나간다. (기획에서 배지 보상이 필요하다고 하면
 * rewardService.addPoints를 idempotencyKey `badge:{childProfileId}:{badge_code}`로 부르면 된다)
 *
 * 판정은 `evaluable: true`인 배지만 훑는다. 같은 지표를 쓰는 배지가 여러 개라
 * (streak_7, streak_10) 지표는 타입당 한 번만 잰다.
 *
 * 출석 체크·미션 보상처럼 수치가 변하는 지점에서 호출한다. 실패해도 본래 동작(출석·보상)을
 * 막지 않도록, 호출부에서 예외를 삼키는 것을 권장한다 — 배지는 부가 기능이다.
 *
 * @param {number} childProfileId
 * @param {object} [options]
 * @param {import('sequelize').Transaction} [options.transaction]
 * @returns {Promise<{ awarded: string[] }>} 이번 호출로 새로 받은 badge_code 목록
 */
const evaluateAndAward = async (childProfileId, { transaction } = {}) => {
  return withTransaction(transaction, async (t) => {
    const owned = await ChildBadge.findAll({
      where: { child_profile_id: childProfileId },
      attributes: ['badge_code'],
      transaction: t,
    });
    const ownedCodes = new Set(owned.map((row) => row.badge_code));

    const candidates = EVALUABLE_BADGES.filter((badge) => !ownedCodes.has(badge.badge_code));
    if (candidates.length === 0) return { awarded: [] };

    // 같은 조건 타입을 여러 배지가 공유하므로 지표는 타입당 한 번만 잰다.
    const measured = new Map();
    const awarded = [];

    for (const badge of candidates) {
      const { type, value } = badge.condition;

      if (!measured.has(type)) {
        const evaluator = getEvaluator(type);
        if (!evaluator) {
          // 카탈로그가 evaluable: true인데 판정기가 없다 — 설정 실수다.
          // 배지 하나 때문에 출석/보상 전체를 막을 수는 없으니 건너뛴다.
          measured.set(type, null);
        } else {
          measured.set(type, await evaluator(childProfileId, { transaction: t }));
        }
      }

      const current = measured.get(type);
      if (current === null || current < value) continue;

      // UNIQUE(child_profile_id, badge_code)가 중복을 막는다. 동시 실행으로 다른 쪽이
      // 먼저 넣었으면 created=false로 돌아오므로 수여 목록에 넣지 않는다.
      const [, created] = await ChildBadge.findOrCreate({
        where: { child_profile_id: childProfileId, badge_code: badge.badge_code },
        defaults: { awarded_at: new Date() },
        transaction: t,
      });
      if (created) awarded.push(badge.badge_code);
    }

    return { awarded };
  });
};

/**
 * [evaluateAndAward]를 부르되 실패해도 예외를 던지지 않는다.
 *
 * 배지는 부가 기능이라, 배지 판정이 깨졌다고 출석 체크나 미션 보상 같은 본래 동작이
 * 실패하면 안 된다. 그래서 **본래 동작의 트랜잭션이 커밋된 뒤에** 이걸 부른다.
 * 이번에 못 받았어도 다음 이벤트 때 조건을 다시 재므로 배지가 영영 누락되지는 않는다.
 *
 * 개발자 B도 동화 읽기·퀴즈 정답 처리를 커밋한 뒤 이 함수를 부르면 된다.
 *
 * @param {number} childProfileId
 * @returns {Promise<string[]>} 이번에 새로 받은 badge_code 목록 (실패 시 빈 배열)
 */
const evaluateQuietly = async (childProfileId) => {
  try {
    const { awarded } = await evaluateAndAward(childProfileId);
    return awarded;
  } catch (err) {
    console.error(`[badge] 판정 실패 (child_profile_id=${childProfileId}):`, err.message);
    return [];
  }
};

module.exports = {
  BADGE_STATUS,
  getCatalog,
  getChildBadges,
  evaluateAndAward,
  evaluateQuietly,
  getBadgeDefinition,
};
