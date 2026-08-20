jest.mock('../../src/models', () => ({
  ChildBadge: { findAll: jest.fn(), findOrCreate: jest.fn() },
  AttendanceLog: { count: jest.fn() },
  DailyMission: { count: jest.fn() },
  RewardWallet: { findOne: jest.fn() },
  sequelize: {
    transaction: jest.fn((cb) => cb({ LOCK: { UPDATE: 'UPDATE' } })),
  },
}));

jest.mock('../../src/services/child.service', () => ({
  getById: jest.fn(),
}));

const { ChildBadge, AttendanceLog, DailyMission, RewardWallet } = require('../../src/models');
const childService = require('../../src/services/child.service');
const badgeService = require('../../src/services/badge.service');
const { BADGE_CATALOG, EVALUABLE_BADGES } = require('../../src/config/badgeCatalog');

const CHILD_ID = 1;

/** 판정기가 읽는 값들을 한 번에 세팅한다. */
const mockMetrics = ({ attendance = 0, missions = 0, points = 0, level = 1, streak = 0 } = {}) => {
  AttendanceLog.count.mockResolvedValue(attendance);
  DailyMission.count.mockResolvedValue(missions);
  RewardWallet.findOne.mockResolvedValue({ points, level, streak_days: streak });
};

const mockOwned = (codes) => {
  ChildBadge.findAll.mockResolvedValue(codes.map((code) => ({ badge_code: code, awarded_at: new Date('2026-08-01') })));
};

beforeEach(() => {
  jest.clearAllMocks();
  ChildBadge.findOrCreate.mockImplementation(async () => [{}, true]);
});

describe('배지 카탈로그', () => {
  test('모든 배지는 고유한 badge_code를 갖는다', () => {
    const codes = BADGE_CATALOG.map((b) => b.badge_code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test('판정 가능한 배지는 모두 대응하는 판정기가 있다', () => {
    // evaluable: true인데 판정기가 없으면 그 배지는 영영 수여되지 않는다.
    const { getEvaluator } = require('../../src/services/badgeEvaluators');
    for (const badge of EVALUABLE_BADGES) {
      expect(getEvaluator(badge.condition.type)).toBeDefined();
    }
  });

  test('조건값은 모두 양수다', () => {
    for (const badge of BADGE_CATALOG) {
      expect(badge.condition.value).toBeGreaterThan(0);
    }
  });

  test('getCatalog은 전체 배지를 evaluable과 함께 돌려준다', () => {
    const { badges } = badgeService.getCatalog();

    expect(badges).toHaveLength(BADGE_CATALOG.length);
    expect(badges.some((b) => b.evaluable === false)).toBe(true);
    expect(badges[0]).toHaveProperty('condition.value');
  });
});

describe('배지 수여는', () => {
  test('조건을 넘긴 배지를 준다', async () => {
    mockOwned([]);
    // 출석 1회 이상 → attendance_first
    mockMetrics({ attendance: 1 });

    const { awarded } = await badgeService.evaluateAndAward(CHILD_ID);

    expect(awarded).toContain('attendance_first');
  });

  test('조건에 못 미치면 주지 않는다', async () => {
    mockOwned([]);
    mockMetrics({ attendance: 0, streak: 0, points: 0, level: 1, missions: 0 });

    const { awarded } = await badgeService.evaluateAndAward(CHILD_ID);

    expect(awarded).toEqual([]);
    expect(ChildBadge.findOrCreate).not.toHaveBeenCalled();
  });

  test('같은 지표를 쓰는 배지들을 한 번에 준다', async () => {
    mockOwned([]);
    // streak 10이면 streak_7과 streak_10 둘 다 조건 충족
    mockMetrics({ streak: 10 });

    const { awarded } = await badgeService.evaluateAndAward(CHILD_ID);

    expect(awarded).toEqual(expect.arrayContaining(['streak_7', 'streak_10']));
  });

  test('같은 지표는 한 번만 잰다', async () => {
    mockOwned([]);
    mockMetrics({ streak: 10 });

    await badgeService.evaluateAndAward(CHILD_ID);

    // streak_7 / streak_10 두 배지가 streak_days를 쓰지만 지갑 조회는 타입당 1회여야 한다.
    // (total_points, level도 지갑을 읽으므로 3회 — 지표 타입 수만큼)
    const walletReads = RewardWallet.findOne.mock.calls.length;
    expect(walletReads).toBe(3);
  });

  test('이미 가진 배지는 다시 주지 않는다', async () => {
    mockOwned(['attendance_first']);
    mockMetrics({ attendance: 5 });

    const { awarded } = await badgeService.evaluateAndAward(CHILD_ID);

    expect(awarded).not.toContain('attendance_first');
  });

  test('판정 불가(evaluable: false) 배지는 조건과 무관하게 주지 않는다', async () => {
    mockOwned([]);
    // 모든 지표를 아주 크게 줘도 story_10 등은 판정 대상이 아니다.
    mockMetrics({ attendance: 9999, missions: 9999, points: 9999, level: 99, streak: 9999 });

    const { awarded } = await badgeService.evaluateAndAward(CHILD_ID);

    expect(awarded).not.toContain('story_10');
    expect(awarded).not.toContain('quiz_50');
    expect(awarded).not.toContain('vocabulary_100');
  });

  test('동시 실행으로 다른 쪽이 먼저 넣었으면 수여 목록에 넣지 않는다', async () => {
    mockOwned([]);
    mockMetrics({ attendance: 1 });
    // UNIQUE 제약에 걸려 created:false로 돌아온 상황
    ChildBadge.findOrCreate.mockResolvedValue([{}, false]);

    const { awarded } = await badgeService.evaluateAndAward(CHILD_ID);

    expect(awarded).toEqual([]);
  });

  test('지갑이 없는 자녀도 예외 없이 판정된다', async () => {
    mockOwned([]);
    AttendanceLog.count.mockResolvedValue(0);
    DailyMission.count.mockResolvedValue(0);
    RewardWallet.findOne.mockResolvedValue(null);

    await expect(badgeService.evaluateAndAward(CHILD_ID)).resolves.toEqual({ awarded: [] });
  });
});

describe('evaluateQuietly는', () => {
  test('실패해도 예외를 던지지 않고 빈 배열을 준다', async () => {
    // 배지 판정이 깨져도 출석/보상 같은 본래 동작을 막으면 안 된다.
    ChildBadge.findAll.mockRejectedValue(new Error('DB 폭발'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(badgeService.evaluateQuietly(CHILD_ID)).resolves.toEqual([]);
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });

  test('성공하면 수여된 코드를 그대로 돌려준다', async () => {
    mockOwned([]);
    mockMetrics({ attendance: 1 });

    await expect(badgeService.evaluateQuietly(CHILD_ID)).resolves.toContain('attendance_first');
  });
});

describe('자녀 배지 현황은', () => {
  beforeEach(() => {
    childService.getById.mockResolvedValue({ child_profile_id: CHILD_ID });
  });

  test('획득/미획득/곧 열림을 구분해서 준다', async () => {
    mockOwned(['attendance_first']);

    const result = await badgeService.getChildBadges(10, CHILD_ID);
    const byCode = Object.fromEntries(result.badges.map((b) => [b.badge_code, b]));

    expect(byCode.attendance_first.status).toBe('earned');
    expect(byCode.attendance_first.awarded_at).not.toBeNull();
    expect(byCode.streak_10.status).toBe('locked');
    // 판정 기능이 없는 배지는 "아직 못 딴 것"과 구분된다.
    expect(byCode.story_10.status).toBe('coming_soon');
  });

  test('획득 수와 전체 수를 함께 준다', async () => {
    mockOwned(['attendance_first', 'streak_7']);

    const result = await badgeService.getChildBadges(10, CHILD_ID);

    expect(result.earned_count).toBe(2);
    expect(result.total_count).toBe(BADGE_CATALOG.length);
  });

  test('남의 자녀면 child.service가 던지는 404를 그대로 올린다', async () => {
    const notFound = Object.assign(new Error('자녀 프로필을 찾을 수 없습니다.'), { statusCode: 404 });
    childService.getById.mockRejectedValue(notFound);

    await expect(badgeService.getChildBadges(999, CHILD_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});
