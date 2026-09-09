/**
 * 배지 카탈로그 (RW04_ACH_02 — 조건 기반 배지 획득, MP02_RWD_03 — 보유 배지 확인).
 *
 * DB 테이블이 아니라 코드 상수로 둔 이유는 레벨 임계값·미션 카탈로그와 같다
 * (docs/WEEK3_A_DESIGN.md 4절): 배지를 런타임에 조정할 관리자 UI가 없는 단계라,
 * 테이블 하나와 시드 데이터를 늘리는 것보다 리뷰 가능한 PR로 관리하는 편이 낫다.
 * 조건 판정은 어차피 코드로 해야 하므로, 조건을 테이블에 두면 로직과 데이터가 갈라진다.
 *
 * `child_badges.badge_code`가 여기의 `badge_code`를 참조한다. FK는 아니며,
 * `daily_missions.mission_type` ↔ `MISSION_CATALOG`와 같은 관계다.
 *
 * ⚠️ 배지 이름·설명·조건 수치는 예시이며 기획 확정이 필요하다.
 *
 * ## evaluable 플래그
 *
 * 일부 조건(동화/퀴즈/단어장)은 개발자 B의 테이블이 아직 없어 판정할 수 없다.
 * 그런 배지는 `evaluable: false`로 두어 목록에는 보이되 "곧 열려요"로 표시하고,
 * 판정 대상에서는 제외한다. 조건 데이터가 준비되면 `evaluate.js`에 판정기를 추가하고
 * 이 플래그만 true로 바꾸면 된다.
 *
 * **badge_code는 절대 바꾸지 말 것** — 이미 수여된 child_badges 행의 의미가 달라진다.
 * 배지를 없앨 때도 카탈로그에서 지우기보다 새 코드를 추가하는 쪽을 고려한다
 * (지우면 과거에 수여받은 아이의 배지가 목록에서 사라진다).
 */

/**
 * @typedef {object} BadgeCondition
 * @property {string} type - 판정 기준. src/services/badgeEvaluators.js의 키와 일치해야 한다.
 * @property {number} value - 도달해야 하는 값 (이상, `>=`)
 */

/**
 * @typedef {object} Badge
 * @property {string} badge_code - 불변 식별자. child_badges에 저장된다.
 * @property {string} name - 아이에게 보여줄 이름
 * @property {string} description - 획득 조건 설명
 * @property {string} icon_key - 프론트가 이미지에 매핑할 키 (URL이 아니라 키다 —
 *   이미지 교체 시 백엔드 배포가 필요 없도록)
 * @property {BadgeCondition} condition
 * @property {boolean} evaluable - false면 아직 판정할 수 없는 배지("곧 열려요")
 */

/** @type {Badge[]} */
const BADGE_CATALOG = [
  // ── 출석 계열 (지금 판정 가능) ──
  {
    badge_code: 'attendance_first',
    name: '첫 걸음',
    description: '처음으로 출석했어요',
    icon_key: 'foot',
    condition: { type: 'attendance_total', value: 1 },
    evaluable: true,
  },
  {
    badge_code: 'attendance_30',
    name: '개근왕',
    description: '30일 동안 출석했어요',
    icon_key: 'calendar',
    condition: { type: 'attendance_total', value: 30 },
    evaluable: true,
  },
  {
    badge_code: 'streak_7',
    name: '일주일 개근',
    description: '7일 연속으로 출석했어요',
    icon_key: 'fire_small',
    condition: { type: 'streak_days', value: 7 },
    evaluable: true,
  },
  {
    badge_code: 'streak_10',
    name: '꾸준한 아이',
    description: '10일 연속으로 출석했어요',
    icon_key: 'fire',
    condition: { type: 'streak_days', value: 10 },
    evaluable: true,
  },

  // ── 포인트·레벨 계열 (지금 판정 가능) ──
  {
    badge_code: 'points_100',
    name: '포인트 수집가',
    description: '포인트를 100점 모았어요',
    icon_key: 'coin',
    condition: { type: 'total_points', value: 100 },
    evaluable: true,
  },
  {
    badge_code: 'points_1000',
    name: '포인트 부자',
    description: '포인트를 1000점 모았어요',
    icon_key: 'treasure',
    condition: { type: 'total_points', value: 1000 },
    evaluable: true,
  },
  {
    badge_code: 'level_5',
    name: '성장하는 아이',
    description: '레벨 5에 도달했어요',
    icon_key: 'sprout',
    condition: { type: 'level', value: 5 },
    evaluable: true,
  },

  // ── 미션 계열 (지금 판정 가능) ──
  {
    badge_code: 'mission_10',
    name: '미션 해결사',
    description: '미션을 10번 완료했어요',
    icon_key: 'check',
    condition: { type: 'mission_completed_total', value: 10 },
    evaluable: true,
  },

  // ── 동화·퀴즈·단어장 계열 (개발자 B 데이터 대기 — "곧 열려요") ──
  {
    badge_code: 'story_10',
    name: '이야기 친구',
    description: '동화를 10편 읽었어요',
    icon_key: 'book',
    condition: { type: 'story_read_total', value: 10 },
    evaluable: false,
  },
  {
    badge_code: 'quiz_50',
    name: '퀴즈 박사',
    description: '퀴즈를 50개 맞혔어요',
    icon_key: 'brain',
    condition: { type: 'quiz_correct_total', value: 50 },
    evaluable: false,
  },
  {
    badge_code: 'vocabulary_100',
    name: '단어 부자',
    description: '단어를 100개 모았어요',
    icon_key: 'pencil',
    condition: { type: 'vocabulary_saved_total', value: 100 },
    evaluable: false,
  },
];

const BADGE_CODES = BADGE_CATALOG.map((badge) => badge.badge_code);

/** 지금 판정할 수 있는 배지만. 수여 로직은 이것만 훑는다. */
const EVALUABLE_BADGES = BADGE_CATALOG.filter((badge) => badge.evaluable);

/**
 * badge_code에 해당하는 카탈로그 정의를 반환한다(없으면 undefined).
 * @param {string} badgeCode
 */
const getBadgeDefinition = (badgeCode) => {
  return BADGE_CATALOG.find((badge) => badge.badge_code === badgeCode);
};

module.exports = {
  BADGE_CATALOG,
  BADGE_CODES,
  EVALUABLE_BADGES,
  getBadgeDefinition,
};
