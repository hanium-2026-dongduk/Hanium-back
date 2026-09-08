const { AttendanceLog, DailyMission, RewardWallet } = require('../models');

/**
 * 배지 조건 판정기 모음 (RW04_ACH_02).
 *
 * 카탈로그의 `condition.type` → 여기의 키. 각 함수는 자녀의 **현재 수치**를 돌려주고,
 * 수여 여부는 badgeService가 `>= condition.value`로 판단한다. 판정기가 조건값을 알 필요는
 * 없다 — 같은 지표를 쓰는 배지가 여러 개(streak_7, streak_10)라 한 번만 재면 되기 때문이다.
 *
 * ## 새 판정기를 추가할 때
 *
 * 개발자 B의 테이블(동화·퀴즈·단어장)이 준비되면 여기에 함수를 추가하고,
 * `badgeCatalog.js`에서 해당 배지의 `evaluable`을 true로 바꾸면 된다.
 * 그 전까지 그 배지들은 목록에만 보이고("곧 열려요") 판정 대상에서 빠진다.
 *
 * 모든 판정기는 같은 시그니처를 지킨다.
 *   (childProfileId, { transaction }) => Promise<number>
 */

/** 누적 출석 일수. attendance_logs는 자녀·날짜당 1행이라 행 수가 곧 일수다. */
const attendance_total = async (childProfileId, { transaction } = {}) => {
  return AttendanceLog.count({
    where: { child_profile_id: childProfileId },
    transaction,
  });
};

/** 현재 연속 출석일. 끊기면 리셋되므로 "최고 기록"이 아니라 현재값이다. */
const streak_days = async (childProfileId, { transaction } = {}) => {
  const wallet = await RewardWallet.findOne({
    where: { child_profile_id: childProfileId },
    transaction,
  });
  return wallet ? wallet.streak_days : 0;
};

/**
 * 보유 포인트.
 *
 * 지금은 차감이 없어서 "누적 획득량"과 같다. 나중에 포인트를 쓰는 기능이 생기면
 * 이 값은 잔액이 되므로, 그때는 reward_transactions의 지급 합계를 세도록 바꿔야 한다
 * (배지는 "모은 적 있다"는 성취라 잔액이 줄었다고 회수하면 안 된다).
 */
const total_points = async (childProfileId, { transaction } = {}) => {
  const wallet = await RewardWallet.findOne({
    where: { child_profile_id: childProfileId },
    transaction,
  });
  return wallet ? wallet.points : 0;
};

/** 현재 레벨. */
const level = async (childProfileId, { transaction } = {}) => {
  const wallet = await RewardWallet.findOne({
    where: { child_profile_id: childProfileId },
    transaction,
  });
  return wallet ? wallet.level : 1;
};

/**
 * 완료한 미션 수.
 *
 * 'completed'와 'rewarded'를 모두 센다 — 진행도는 채웠는데 포인트 지급 단계에서 멈춘
 * 미션도 아이 입장에서는 "해낸 것"이기 때문이다.
 */
const mission_completed_total = async (childProfileId, { transaction } = {}) => {
  return DailyMission.count({
    where: {
      child_profile_id: childProfileId,
      status: ['completed', 'rewarded'],
    },
    transaction,
  });
};

const EVALUATORS = {
  attendance_total,
  streak_days,
  total_points,
  level,
  mission_completed_total,
  // 개발자 B 데이터 대기:
  //   story_read_total, quiz_correct_total, vocabulary_saved_total
};

/**
 * 조건 타입에 해당하는 판정기를 반환한다(없으면 undefined).
 * @param {string} conditionType
 */
const getEvaluator = (conditionType) => EVALUATORS[conditionType];

module.exports = { EVALUATORS, getEvaluator };
