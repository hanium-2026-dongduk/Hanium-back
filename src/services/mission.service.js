const { DailyMission } = require('../models');
const childService = require('./child.service');
const rewardService = require('./reward.service');
const { withTransaction } = require('../utils/dbRetry');
const { MISSION_CATALOG, MISSION_TYPES, getMissionDefinition } = require('../config/missionCatalog');
const { getSeoulDateString } = require('../utils/dateUtils');

const badRequest = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

/**
 * 미션 행을 FOR UPDATE로 잠근 채 찾거나, 없으면 생성 시점의 카탈로그 값을 복사해 만든다.
 *
 * 미션 행은 그날 첫 접근 시점에 지연 생성되므로(WEEK3_A_DESIGN.md 3-2절), 같은 자녀의 첫
 * 두 요청이 동시에 도착하면 둘 다 "없음"을 보고 INSERT를 시도할 수 있다.
 * UNIQUE(child_profile_id, mission_date, mission_type)가 이를 막고, 실패한 쪽은 재조회해
 * 같은 행에 합류한다(reward.service.js의 findOrCreateWalletLocked와 동일 패턴).
 */
const findOrCreateMissionLocked = async (childProfileId, missionDate, missionType, t) => {
  const where = {
    child_profile_id: childProfileId,
    mission_date: missionDate,
    mission_type: missionType,
  };

  let mission = await DailyMission.findOne({ where, transaction: t, lock: t.LOCK.UPDATE });
  if (mission) return mission;

  const definition = getMissionDefinition(missionType);

  try {
    mission = await DailyMission.create(
      {
        ...where,
        target_count: definition.target_count,
        progress_count: 0,
        reward_points: definition.reward_points,
        status: 'pending',
      },
      { transaction: t }
    );
  } catch (err) {
    if (err.name !== 'SequelizeUniqueConstraintError') throw err;
    mission = await DailyMission.findOne({ where, transaction: t, lock: t.LOCK.UPDATE });
  }

  return mission;
};

/**
 * 완료된 미션의 보상을 지급하고 rewarded로 전이시킨다. 이미 rewarded면 아무것도 하지 않는다.
 *
 * idempotencyKey에 daily_mission_id를 쓰는 것이 "미션 하나당 보상 한 번"의 최종 보장이다.
 * 원본 이벤트 id가 아니라 미션 행의 PK를 쓰는 이유는, 같은 미션을 여러 이벤트가 밀어올려도
 * (예: 단어 5개 클릭) 지급 단위는 언제나 미션 1건이기 때문이다.
 */
const grantMissionReward = async (mission, t, eventId) => {
  const reward = await rewardService.addPoints({
    childProfileId: mission.child_profile_id,
    points: mission.reward_points,
    reason: 'mission_reward',
    idempotencyKey: `mission:${mission.daily_mission_id}`,
    metadata: {
      missionType: mission.mission_type,
      missionDate: mission.mission_date,
      ...(eventId === undefined ? {} : { eventId }),
    },
    transaction: t,
  });

  mission.status = 'rewarded';
  mission.rewarded_at = new Date();
  await mission.save({ transaction: t });

  return reward;
};

/**
 * 미션 진행도를 올리고, 목표 달성 시 완료 처리 + 포인트 지급까지 한 트랜잭션에서 수행한다.
 * 오늘자 미션 행이 없으면 먼저 지연 생성한다(3-2절).
 *
 * 상태 전이는 pending → completed → rewarded 단방향이며, 이미 rewarded인 미션에 대한
 * 호출은 진행도를 더 올리지 않고 조용히 무시된다(updated:false). 하루치 미션은 한 번
 * 보상받으면 그날은 끝이라는 뜻이다.
 *
 * completed까지 갔는데 지급 전에 트랜잭션이 깨진 경우, 다음 호출이 진행도 증가 없이
 * 지급만 이어서 시도한다 — completed와 rewarded를 나눠 둔 이유가 이 재개 지점이다.
 *
 * **잠금 순서**: 미션 행 → 지갑 행(addPoints 내부). 같은 트랜잭션에서 두 자원을 함께
 * 잠그는 다른 서비스(attendance.service)도 이 순서를 지켜야 교착이 생기지 않는다.
 *
 * @param {object} params
 * @param {number} params.childProfileId
 * @param {string} params.eventType - mission_type과 동일한 값 집합('story_read' 등)
 * @param {number} [params.amount=1] - progress_count 증가량
 * @param {string} [params.eventId] - 원본 이벤트 식별자. 현재 설계는 이 값으로 진행도 증가
 *   자체의 중복 제거를 하지 않는다(설계 문서 8절 결정사항 — 호출자가 이벤트당 정확히 1회
 *   호출할 책임을 짐). 보상 포인트의 중복 지급은 daily_mission_id 기반 멱등키가 막으므로
 *   이 값과 무관하게 항상 방지된다. 현재는 원장 metadata에 기록만 한다.
 * @param {import('sequelize').Transaction} [params.transaction] - 있으면 그 트랜잭션에 합류
 * @returns {Promise<{ updated: boolean, mission: object, reward: object|null }>}
 */
const recordProgress = async ({ childProfileId, eventType, amount = 1, eventId, transaction }) => {
  if (!MISSION_TYPES.includes(eventType)) {
    throw badRequest(`알 수 없는 미션 유형입니다: ${eventType}`);
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    throw badRequest('진행도 증가량은 1 이상의 정수여야 합니다.');
  }

  const missionDate = getSeoulDateString();

  return withTransaction(transaction, async (t) => {
    const mission = await findOrCreateMissionLocked(childProfileId, missionDate, eventType, t);

    // 이미 보상까지 끝난 미션 — 그날의 종착 상태이므로 진행도를 더 올리지 않는다.
    if (mission.status === 'rewarded') {
      return { updated: false, mission, reward: null };
    }

    // completed에서 멈춰 있던 미션은 진행도를 다시 올리지 않고 지급만 이어서 시도한다.
    if (mission.status === 'completed') {
      const reward = await grantMissionReward(mission, t, eventId);
      return { updated: true, mission, reward };
    }

    // 목표를 넘겨 쌓아봐야 쓸 곳이 없고 "7/5" 같은 표시만 만들므로 목표치에서 자른다.
    mission.progress_count = Math.min(mission.progress_count + amount, mission.target_count);

    if (mission.progress_count < mission.target_count) {
      await mission.save({ transaction: t });
      return { updated: true, mission, reward: null };
    }

    mission.status = 'completed';
    mission.completed_at = new Date();
    await mission.save({ transaction: t });

    const reward = await grantMissionReward(mission, t, eventId);
    return { updated: true, mission, reward };
  });
};

/**
 * 오늘자 미션 4종을 전부 지연 생성한다(이미 있으면 그대로 둔다).
 *
 * 카탈로그 순서대로 생성하는 것이 곧 잠금 획득 순서라, 동시에 들어온 요청들이 서로
 * 반대 순서로 행을 잡아 교착에 빠지는 상황을 막는다.
 *
 * @param {number} childProfileId
 * @param {object} [options]
 * @param {string} [options.missionDate] - YYYY-MM-DD (기본값: 오늘, KST)
 * @param {import('sequelize').Transaction} [options.transaction]
 * @returns {Promise<object[]>} 카탈로그 순서의 미션 행 목록
 */
const ensureMissions = async (childProfileId, { missionDate, transaction } = {}) => {
  const date = missionDate ?? getSeoulDateString();

  return withTransaction(transaction, async (t) => {
    const missions = [];
    for (const definition of MISSION_CATALOG) {
      // 순차 실행이 의도적이다 — 위 주석대로 카탈로그 순서가 곧 잠금 순서여야 하므로
      // Promise.all로 병렬화하면 안 된다.
      missions.push(await findOrCreateMissionLocked(childProfileId, date, definition.mission_type, t));
    }
    return missions;
  });
};

const toMissionView = (mission) => ({
  missionType: mission.mission_type,
  targetCount: mission.target_count,
  progressCount: mission.progress_count,
  rewardPoints: mission.reward_points,
  status: mission.status,
});

/**
 * GET /api/missions — 자녀 비종속 정적 카탈로그(설계 문서 7-3절).
 * @returns {{ missions: Array<{ missionType: string, targetCount: number, rewardPoints: number }> }}
 */
const getCatalog = () => ({
  missions: MISSION_CATALOG.map((definition) => ({
    missionType: definition.mission_type,
    targetCount: definition.target_count,
    rewardPoints: definition.reward_points,
  })),
});

/**
 * GET /api/missions/progress/:childId — 오늘자 미션 진행 상태(설계 문서 7-4절).
 *
 * 오늘자 행이 없으면 이 호출이 생성한다(부작용 있는 GET — Week2 heartbeat와 동일한 선례).
 *
 * 설계 문서 5-2절의 시그니처는 `getTodayProgress(childProfileId)`였으나, 7-4절이 404를
 * 규정하고 있어 소유권 검증에 필요한 userId를 받도록 했다(reward.service의 getRewards와
 * 동일한 형태).
 *
 * @param {number} userId - 소유권 검증용
 * @param {number} childProfileId
 * @returns {Promise<{ missionDate: string, missions: object[] }>}
 */
const getTodayProgress = async (userId, childProfileId) => {
  const profile = await childService.getById(userId, childProfileId);
  const missionDate = getSeoulDateString();
  const missions = await ensureMissions(profile.child_profile_id, { missionDate });

  return { missionDate, missions: missions.map(toMissionView) };
};

module.exports = {
  recordProgress,
  ensureMissions,
  getCatalog,
  getTodayProgress,
  toMissionView,
};
