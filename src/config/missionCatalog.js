/**
 * 데일리 미션 카탈로그 (RW01_POINT_02 — 데일리 미션 달성 보상).
 *
 * 레벨 임계값과 동일한 논리로 DB 테이블이 아니라 코드 상수로 둔다
 * (docs/WEEK3_A_DESIGN.md 2-2절). 자녀의 그날 첫 접근 시점에 이 카탈로그를 기준으로
 * daily_missions 행이 지연 생성된다.
 *
 * ⚠️ target_count / reward_points 수치는 예시이며 기획 확정이 필요하다(8절 2번).
 *
 * 카탈로그에 미션을 추가/삭제해도 마이그레이션은 필요 없다. 다만 이미 생성된 그날의
 * 행에는 소급되지 않는다 — 추가된 미션은 다음 날(또는 아직 미션 행이 없는 자녀)부터
 * 생성된다. mission_type 값을 "바꾸는" 것은 과거 이력의 의미를 바꾸므로 피할 것.
 */

const MISSION_CATALOG = [
  { mission_type: 'attendance', target_count: 1, reward_points: 10 },
  { mission_type: 'story_read', target_count: 1, reward_points: 20 },
  { mission_type: 'word_clicked', target_count: 5, reward_points: 15 },
  { mission_type: 'quiz_answered', target_count: 1, reward_points: 20 },
];

const MISSION_TYPES = MISSION_CATALOG.map((mission) => mission.mission_type);

/**
 * mission_type에 해당하는 카탈로그 정의를 반환한다(없으면 undefined).
 * @param {string} missionType
 */
const getMissionDefinition = (missionType) => {
  return MISSION_CATALOG.find((mission) => mission.mission_type === missionType);
};

module.exports = {
  MISSION_CATALOG,
  MISSION_TYPES,
  getMissionDefinition,
};
