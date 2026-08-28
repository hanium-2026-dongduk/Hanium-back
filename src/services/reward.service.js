const { Op } = require('sequelize');
const { RewardWallet, RewardTransaction } = require('../models');
const childService = require('./child.service');
const { withTransaction } = require('../utils/dbRetry');
const { computeLevelFromPoints, getLevelProgress } = require('../config/levelThresholds');
const { getSeoulDayStartInstant, addDays, isValidDateString } = require('../utils/dateUtils');

/**
 * 지급 사유 화이트리스트.
 *
 * 컬럼 자체는 VARCHAR라 값 추가에 마이그레이션이 필요 없다 — 개발자 B가 새 사유가
 * 필요하면 이 배열에만 추가하면 된다. 검증을 두는 이유는 오타로 만들어진 사유가
 * 이력에 조용히 섞여 RW03의 "유형별 조회"를 오염시키는 것을 막기 위함이다.
 *
 * 'attendance'는 현재 A의 코드가 직접 쓰지는 않는다 — 출석 보상은 'attendance' 데일리
 * 미션을 통해 'mission_reward'로 지급된다(아래 attendance.service.js 참고). 출석 자체에
 * 미션과 별개의 포인트를 붙일 여지를 남겨 계약상 유지한다.
 */
const REWARD_REASONS = [
  'attendance',
  'streak_bonus',
  'mission_reward',
  'story_read',
  'word_clicked',
  'quiz_answered',
];

const MAX_IDEMPOTENCY_KEY_LENGTH = 150;
const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 100;

const badRequest = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

/**
 * 지갑 행을 FOR UPDATE로 잠근 채 찾거나, 없으면 새로 만든다.
 *
 * 지갑은 자녀 생성 시점이 아니라 최초 접근 시점에 지연 생성되므로, 같은 자녀에 대한
 * 첫 두 요청이 동시에 도착하면 둘 다 "없음"을 보고 INSERT를 시도할 수 있다.
 * UNIQUE(child_profile_id)가 이를 막고, 실패한 쪽은 재조회해 같은 행에 합류한다
 * (usage.service.js의 findOrCreateSummary와 동일 패턴).
 */
const findOrCreateWalletLocked = async (childProfileId, t) => {
  const where = { child_profile_id: childProfileId };

  let wallet = await RewardWallet.findOne({ where, transaction: t, lock: t.LOCK.UPDATE });
  if (wallet) return wallet;

  try {
    wallet = await RewardWallet.create(
      { child_profile_id: childProfileId, points: 0, level: 1, streak_days: 0, last_activity_date: null },
      { transaction: t }
    );
  } catch (err) {
    if (err.name !== 'SequelizeUniqueConstraintError') throw err;
    wallet = await RewardWallet.findOne({ where, transaction: t, lock: t.LOCK.UPDATE });
  }

  return wallet;
};

/**
 * 포인트 지급 + 원장 기록을 하나의 트랜잭션으로 처리한다.
 *
 * 같은 childProfileId + idempotencyKey로 두 번 호출되면 두 번째는 지급 없이
 * alreadyProcessed:true로 안전하게 반환한다 — 호출자는 재시도/중복 이벤트를 걱정하지
 * 않아도 된다. 순서는 반드시 "지갑 행 잠금 → 멱등키 확인 → 지급"이다. 잠금을 먼저 잡아야
 * 동시에 들어온 같은 키의 두 요청이 서로의 커밋을 보게 되고, 그래도 빠져나가는 경쟁은
 * UNIQUE(child_profile_id, idempotency_key)가 최후에 막는다.
 *
 * 레벨은 포인트의 순수 함수라 이 안에서 함께 갱신한다 — 호출자가 checkLevelUp을 잊어도
 * 잔액과 레벨이 어긋난 상태가 저장되지 않게 하기 위함이며, "이번 지급으로 레벨이
 * 올랐는가"는 반환값(leveledUp/oldLevel/newLevel)으로 알려준다.
 *
 * @param {object} params
 * @param {number} params.childProfileId
 * @param {number} params.points - 양수 정수만 허용(이번 설계는 지급만 다룸)
 * @param {string} params.reason - REWARD_REASONS 중 하나
 * @param {string} params.idempotencyKey - `{domain}:{고유 PK}` 컨벤션
 * @param {object} [params.metadata] - 원장에 JSON으로 그대로 저장되는 부가 정보
 * @param {import('sequelize').Transaction} [params.transaction] - 있으면 그 트랜잭션에 합류
 * @returns {Promise<{ alreadyProcessed: boolean, wallet: object, rewardTransaction: object,
 *                     pointsAdded: number, leveledUp: boolean, oldLevel: number, newLevel: number }>}
 */
const addPoints = async ({ childProfileId, points, reason, idempotencyKey, metadata, transaction }) => {
  if (!Number.isInteger(points) || points <= 0) {
    throw badRequest('지급 포인트는 1 이상의 정수여야 합니다.');
  }
  if (!REWARD_REASONS.includes(reason)) {
    throw badRequest(`알 수 없는 지급 사유입니다: ${reason}`);
  }
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0) {
    throw badRequest('idempotencyKey가 필요합니다.');
  }
  if (idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw badRequest(`idempotencyKey는 ${MAX_IDEMPOTENCY_KEY_LENGTH}자를 넘을 수 없습니다.`);
  }

  return withTransaction(transaction, async (t) => {
    const wallet = await findOrCreateWalletLocked(childProfileId, t);

    const existing = await RewardTransaction.findOne({
      where: { child_profile_id: childProfileId, idempotency_key: idempotencyKey },
      transaction: t,
    });

    if (existing) {
      return {
        alreadyProcessed: true,
        wallet,
        rewardTransaction: existing,
        pointsAdded: 0,
        leveledUp: false,
        oldLevel: wallet.level,
        newLevel: wallet.level,
      };
    }

    const oldLevel = wallet.level;
    wallet.points += points;
    wallet.level = computeLevelFromPoints(wallet.points);
    await wallet.save({ transaction: t });

    const rewardTransaction = await RewardTransaction.create(
      {
        child_profile_id: childProfileId,
        points,
        reason,
        idempotency_key: idempotencyKey,
        balance_after: wallet.points,
        metadata: metadata ?? null,
      },
      { transaction: t }
    );

    return {
      alreadyProcessed: false,
      wallet,
      rewardTransaction,
      pointsAdded: points,
      leveledUp: wallet.level > oldLevel,
      oldLevel,
      newLevel: wallet.level,
    };
  });
};

/**
 * 현재 포인트로 레벨을 재계산해 반영한다.
 *
 * addPoints가 이미 레벨을 함께 갱신하므로 정상 경로에서는 항상 leveledUp:false다.
 * 이 함수의 쓰임새는 (1) 레벨 임계값(config/levelThresholds.js)을 조정한 뒤의 정합성
 * 보정, (2) 설계 문서에 공개한 인터페이스 유지다.
 *
 * @param {number} childProfileId
 * @param {object} [options]
 * @param {import('sequelize').Transaction} [options.transaction]
 * @returns {Promise<{ leveledUp: boolean, oldLevel: number, newLevel: number }>}
 */
const checkLevelUp = async (childProfileId, { transaction } = {}) => {
  return withTransaction(transaction, async (t) => {
    const wallet = await findOrCreateWalletLocked(childProfileId, t);
    const oldLevel = wallet.level;
    const newLevel = computeLevelFromPoints(wallet.points);

    if (newLevel !== oldLevel) {
      wallet.level = newLevel;
      await wallet.save({ transaction: t });
    }

    return { leveledUp: newLevel > oldLevel, oldLevel, newLevel };
  });
};

/**
 * 지갑을 조회한다(없으면 생성). 소유권 검증 없이 내부에서만 사용.
 * @param {number} childProfileId
 * @param {object} [options]
 * @param {import('sequelize').Transaction} [options.transaction]
 */
const getOrCreateWallet = async (childProfileId, { transaction } = {}) => {
  return withTransaction(transaction, async (t) => findOrCreateWalletLocked(childProfileId, t));
};

const toWalletView = (childProfileId, wallet) => ({
  childProfileId: Number(childProfileId),
  points: wallet.points,
  level: wallet.level,
  streakDays: wallet.streak_days,
  levelProgress: getLevelProgress(wallet.points),
});

/**
 * GET /api/rewards/:childId — 포인트/레벨/연속출석일 + 다음 레벨까지의 진행도
 * @param {number} userId
 * @param {number} childProfileId
 */
const getRewards = async (userId, childProfileId) => {
  const profile = await childService.getById(userId, childProfileId);
  const wallet = await getOrCreateWallet(profile.child_profile_id);
  return toWalletView(profile.child_profile_id, wallet);
};

/**
 * GET /api/rewards/:childId/summary — 메인 화면(MN02)용 경량 응답.
 * 프론트는 이 값을 "토큰"으로 라벨링한다.
 * @param {number} userId
 * @param {number} childProfileId
 */
const getSummary = async (userId, childProfileId) => {
  const profile = await childService.getById(userId, childProfileId);
  const wallet = await getOrCreateWallet(profile.child_profile_id);
  return { points: wallet.points };
};

/**
 * GET /api/rewards/:childId/history — 포인트 획득 이력(RW03), 최신순 페이지네이션.
 *
 * from/to는 Asia/Seoul 캘린더 날짜다. created_at은 UTC로 저장되므로 KST 하루의 경계를
 * 실제 시각으로 변환해 필터링한다(to는 그날 전체를 포함).
 *
 * @param {number} userId
 * @param {number} childProfileId
 * @param {object} [query]
 * @param {number} [query.page=1]
 * @param {number} [query.limit=20]
 * @param {string} [query.reason]
 * @param {string} [query.from] - YYYY-MM-DD
 * @param {string} [query.to] - YYYY-MM-DD
 */
const getHistory = async (userId, childProfileId, { page = 1, limit = DEFAULT_HISTORY_LIMIT, reason, from, to } = {}) => {
  const profile = await childService.getById(userId, childProfileId);

  const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
  const safeLimit = Number.isInteger(limit) && limit >= 1 ? Math.min(limit, MAX_HISTORY_LIMIT) : DEFAULT_HISTORY_LIMIT;

  if (reason !== undefined && !REWARD_REASONS.includes(reason)) {
    throw badRequest(`알 수 없는 지급 사유입니다: ${reason}`);
  }
  if (from !== undefined && !isValidDateString(from)) {
    throw badRequest('from은 YYYY-MM-DD 형식이어야 합니다.');
  }
  if (to !== undefined && !isValidDateString(to)) {
    throw badRequest('to는 YYYY-MM-DD 형식이어야 합니다.');
  }
  if (from !== undefined && to !== undefined && from > to) {
    throw badRequest('from은 to보다 이후일 수 없습니다.');
  }

  const where = { child_profile_id: profile.child_profile_id };
  if (reason !== undefined) where.reason = reason;

  const createdAtRange = {};
  if (from !== undefined) createdAtRange[Op.gte] = getSeoulDayStartInstant(from);
  // to는 "그날까지 포함"이므로 다음 날 00:00 KST 미만으로 잡는다.
  if (to !== undefined) createdAtRange[Op.lt] = getSeoulDayStartInstant(addDays(to, 1));
  if (Object.getOwnPropertySymbols(createdAtRange).length > 0) where.created_at = createdAtRange;

  const { count, rows } = await RewardTransaction.findAndCountAll({
    where,
    order: [
      ['created_at', 'DESC'],
      // 같은 초에 여러 건이 기록되면 created_at만으로는 순서가 불안정해 페이지 경계에서
      // 항목이 중복/누락될 수 있다. PK를 보조 정렬키로 두어 전순서를 확정한다.
      ['reward_transaction_id', 'DESC'],
    ],
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit,
  });

  return {
    items: rows.map((row) => ({
      points: row.points,
      reason: row.reason,
      balanceAfter: row.balance_after,
      createdAt: row.created_at,
      metadata: row.metadata ?? null,
    })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount: count,
      totalPages: Math.ceil(count / safeLimit),
    },
  };
};

module.exports = {
  REWARD_REASONS,
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  addPoints,
  checkLevelUp,
  getOrCreateWallet,
  getRewards,
  getSummary,
  getHistory,
};
