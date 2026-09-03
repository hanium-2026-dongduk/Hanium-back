/**
 * 연속 출석(streak) 마일스톤 보너스 (RW02_STREAK_01 — "연속 학습일 관리 + 보너스").
 *
 * 설계 문서(WEEK3_A_DESIGN.md)는 streak 계산 규칙(3-3절)만 정의하고 보너스 수치는
 * 정하지 않았으므로, 레벨 임계값·미션 카탈로그와 같은 컨벤션(코드 상수 + 기획 확정 대상)으로
 * 여기에 둔다.
 *
 * ⚠️ 수치는 예시이며 기획 확정이 필요하다.
 *
 * 정책: streak_days가 마일스톤 값과 **정확히 일치하는 날 1회만** 지급한다(3일차에 20점을
 * 받았다면 4·5일차에는 다시 받지 않는다). 연속이 끊겨 streak가 1로 리셋된 뒤 다시 3일을
 * 채우면 그때는 새로운 지급 대상이다 — 다만 지급 멱등키에 출석 날짜가 들어가므로
 * (`streak:{childProfileId}:{attendanceDate}`) 같은 날 중복 지급되는 일은 없다.
 */

const STREAK_BONUSES = [
  { days: 3, points: 20 },
  { days: 7, points: 50 },
  { days: 14, points: 100 },
  { days: 30, points: 300 },
];

/**
 * 해당 연속일수에 지급할 보너스 포인트를 반환한다(마일스톤이 아니면 0).
 * @param {number} streakDays
 * @returns {number}
 */
const getStreakBonusPoints = (streakDays) => {
  const milestone = STREAK_BONUSES.find((bonus) => bonus.days === streakDays);
  return milestone ? milestone.points : 0;
};

module.exports = {
  STREAK_BONUSES,
  getStreakBonusPoints,
};
