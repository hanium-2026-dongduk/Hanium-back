/**
 * 레벨 정책 (RW04_ACH_01 — 누적 포인트 기반 레벨).
 *
 * DB 테이블이 아니라 코드 상수로 둔 이유(docs/WEEK3_A_DESIGN.md 4절): 레벨 임계값을
 * 런타임에 조정할 관리자 UI가 없는 단계라, 테이블을 늘리는 것보다 리뷰 가능한 PR로
 * 밸런스를 관리하는 편이 적합하다고 판단.
 *
 * ⚠️ 아래 수치는 예시이며 기획 확정이 필요하다(WEEK3_A_DESIGN.md 8절 3번).
 */

// index i에 있는 값 = 레벨 (i+1)이 되기 위해 필요한 누적 포인트.
// level 1: 0점~, level 2: 100점~, level 3: 300점~ ...
const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5200];

const MAX_LEVEL = LEVEL_THRESHOLDS.length;

/**
 * 누적 포인트로부터 레벨을 계산하는 순수 함수.
 * 별도의 누적 카운터를 두지 않고 항상 현재 포인트로부터 재계산하므로, 포인트와 레벨이
 * 어긋난 상태 자체가 존재할 수 없다.
 *
 * @param {number} points - 누적(=현재) 포인트
 * @returns {number} 1 이상의 레벨
 */
const computeLevelFromPoints = (points) => {
  const safePoints = Number.isFinite(points) ? points : 0;
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i += 1) {
    if (safePoints >= LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  return level;
};

/**
 * 현재 레벨 구간과 다음 레벨까지 남은 포인트를 계산한다(GET /api/rewards/:childId 응답용).
 * 최고 레벨에 도달하면 nextLevelAt / pointsToNextLevel은 null이다.
 *
 * @param {number} points
 * @returns {{ currentLevelFloor: number, nextLevelAt: number|null, pointsToNextLevel: number|null }}
 */
const getLevelProgress = (points) => {
  const safePoints = Number.isFinite(points) ? points : 0;
  const level = computeLevelFromPoints(safePoints);
  const currentLevelFloor = LEVEL_THRESHOLDS[level - 1];
  const nextLevelAt = level >= MAX_LEVEL ? null : LEVEL_THRESHOLDS[level];

  return {
    currentLevelFloor,
    nextLevelAt,
    pointsToNextLevel: nextLevelAt === null ? null : Math.max(0, nextLevelAt - safePoints),
  };
};

module.exports = {
  LEVEL_THRESHOLDS,
  MAX_LEVEL,
  computeLevelFromPoints,
  getLevelProgress,
};
