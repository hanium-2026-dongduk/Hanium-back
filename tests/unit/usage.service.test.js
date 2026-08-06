jest.mock('../../src/models', () => ({
  GuardianSetting: { findOne: jest.fn() },
  UsageDailySummary: { findOne: jest.fn(), create: jest.fn() },
  sequelize: {
    transaction: jest.fn((cb) => cb({ LOCK: { UPDATE: 'UPDATE' } })),
  },
}));

jest.mock('../../src/services/child.service', () => ({
  getById: jest.fn(),
}));

const { GuardianSetting, UsageDailySummary } = require('../../src/models');
const childService = require('../../src/services/child.service');
const usageService = require('../../src/services/usage.service');

const buildSummary = (overrides = {}) => ({
  child_profile_id: 1,
  usage_date: '2026-07-31',
  accumulated_seconds: 0,
  last_heartbeat_at: null,
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('usage.service', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('recordHeartbeat', () => {
    test('소유하지 않은(존재하지 않는) 자녀 프로필이면 404를 그대로 전달한다', async () => {
      const notFound = new Error('자녀 프로필을 찾을 수 없습니다.');
      notFound.statusCode = 404;
      childService.getById.mockRejectedValue(notFound);

      await expect(usageService.recordHeartbeat(1, 999)).rejects.toMatchObject({ statusCode: 404 });
      expect(UsageDailySummary.findOne).not.toHaveBeenCalled();
    });

    test('그날의 첫 heartbeat는 0초를 적립하고 last_heartbeat_at만 기록한다', async () => {
      childService.getById.mockResolvedValue({ child_profile_id: 1, user_id: 1 });
      const summary = buildSummary({ last_heartbeat_at: null });
      UsageDailySummary.findOne.mockResolvedValue(summary);
      GuardianSetting.findOne.mockResolvedValue(null);

      const result = await usageService.recordHeartbeat(1, 1);

      expect(result.accumulatedSeconds).toBe(0);
      expect(summary.last_heartbeat_at).not.toBeNull();
      expect(summary.save).toHaveBeenCalledTimes(1);
    });

    test('이전 heartbeat로부터 경과한 시간만큼만 누적한다', async () => {
      const now = new Date('2026-07-31T10:00:30.000Z');
      jest.useFakeTimers({ now });

      childService.getById.mockResolvedValue({ child_profile_id: 1, user_id: 1 });
      const summary = buildSummary({
        accumulated_seconds: 100,
        last_heartbeat_at: new Date('2026-07-31T10:00:00.000Z'), // 30초 전
      });
      UsageDailySummary.findOne.mockResolvedValue(summary);
      GuardianSetting.findOne.mockResolvedValue(null);

      const result = await usageService.recordHeartbeat(1, 1);

      expect(result.accumulatedSeconds).toBe(130); // 100 + 30
    });

    test('경과 시간이 캡(90초)을 넘으면 캡만큼만 적립한다(클라이언트가 값을 조작할 수 없음)', async () => {
      const now = new Date('2026-07-31T12:00:00.000Z');
      jest.useFakeTimers({ now });

      childService.getById.mockResolvedValue({ child_profile_id: 1, user_id: 1 });
      const summary = buildSummary({
        accumulated_seconds: 0,
        last_heartbeat_at: new Date('2026-07-31T09:00:00.000Z'), // 3시간 전
      });
      UsageDailySummary.findOne.mockResolvedValue(summary);
      GuardianSetting.findOne.mockResolvedValue(null);

      const result = await usageService.recordHeartbeat(1, 1);

      expect(result.accumulatedSeconds).toBe(usageService.HEARTBEAT_CAP_SECONDS);
    });

    test('클라이언트가 body에 임의의 시간 값을 보내도 서버 계산 결과에 영향을 주지 않는다', async () => {
      const now = new Date('2026-07-31T10:00:10.000Z');
      jest.useFakeTimers({ now });

      childService.getById.mockResolvedValue({ child_profile_id: 1, user_id: 1 });
      const summary = buildSummary({
        accumulated_seconds: 0,
        last_heartbeat_at: new Date('2026-07-31T10:00:00.000Z'),
      });
      UsageDailySummary.findOne.mockResolvedValue(summary);
      GuardianSetting.findOne.mockResolvedValue(null);

      // recordHeartbeat 시그니처 자체가 클라이언트 시간 값을 받지 않는다 — 이 테스트는
      // 그 계약을 문서화한다. 결과는 오직 서버 시계(10초 경과)에 의해서만 결정된다.
      const result = await usageService.recordHeartbeat(1, 1);

      expect(result.accumulatedSeconds).toBe(10);
    });

    test('누적 시간이 한도에 도달하지 않았으면 남은 시간과 함께 정상 반환한다', async () => {
      childService.getById.mockResolvedValue({ child_profile_id: 1, user_id: 1 });
      const summary = buildSummary({ accumulated_seconds: 100, last_heartbeat_at: null });
      UsageDailySummary.findOne.mockResolvedValue(summary);
      GuardianSetting.findOne.mockResolvedValue({ daily_usage_limit_minutes: 10 }); // 600초

      const result = await usageService.recordHeartbeat(1, 1);

      expect(result.limitSeconds).toBe(600);
      expect(result.remainingSeconds).toBe(500);
    });

    test('누적 시간이 한도에 도달하면 403을 던진다', async () => {
      const now = new Date('2026-07-31T10:01:00.000Z');
      jest.useFakeTimers({ now });

      childService.getById.mockResolvedValue({ child_profile_id: 1, user_id: 1 });
      const summary = buildSummary({
        accumulated_seconds: 595,
        last_heartbeat_at: new Date('2026-07-31T10:00:00.000Z'), // +60초 → 655초
      });
      UsageDailySummary.findOne.mockResolvedValue(summary);
      GuardianSetting.findOne.mockResolvedValue({ daily_usage_limit_minutes: 10 }); // 600초

      await expect(usageService.recordHeartbeat(1, 1)).rejects.toMatchObject({ statusCode: 403 });
      // 초과했더라도 실제 경과 시간은 그대로 기록되어야 한다(사실대로 기록 후 차단)
      expect(summary.accumulated_seconds).toBe(655);
    });

    test('제한이 설정되어 있지 않으면(null) 무제한으로 통과한다', async () => {
      childService.getById.mockResolvedValue({ child_profile_id: 1, user_id: 1 });
      const summary = buildSummary({ accumulated_seconds: 999999, last_heartbeat_at: null });
      UsageDailySummary.findOne.mockResolvedValue(summary);
      GuardianSetting.findOne.mockResolvedValue({ daily_usage_limit_minutes: null });

      const result = await usageService.recordHeartbeat(1, 1);

      expect(result.limitSeconds).toBeNull();
      expect(result.remainingSeconds).toBeNull();
    });

    test('요약 행이 없으면(그날 첫 진입) 새로 생성한다', async () => {
      childService.getById.mockResolvedValue({ child_profile_id: 1, user_id: 1 });
      UsageDailySummary.findOne.mockResolvedValue(null);
      const created = buildSummary({ last_heartbeat_at: null });
      UsageDailySummary.create.mockResolvedValue(created);
      GuardianSetting.findOne.mockResolvedValue(null);

      await usageService.recordHeartbeat(1, 1);

      expect(UsageDailySummary.create).toHaveBeenCalledWith(
        expect.objectContaining({ child_profile_id: 1, accumulated_seconds: 0 }),
        expect.objectContaining({ transaction: expect.anything() })
      );
    });
  });

  describe('getTodayUsage', () => {
    test('오늘 기록이 없으면 accumulatedSeconds 0으로 반환한다', async () => {
      childService.getById.mockResolvedValue({ child_profile_id: 1, user_id: 1 });
      UsageDailySummary.findOne.mockResolvedValue(null);
      GuardianSetting.findOne.mockResolvedValue({ daily_usage_limit_minutes: 30 });

      const result = await usageService.getTodayUsage(1, 1);

      expect(result.accumulatedSeconds).toBe(0);
      expect(result.limitSeconds).toBe(1800);
      expect(result.limitReached).toBe(false);
    });

    test('다른 자녀 프로필의 사용량과 섞이지 않는다 (child_profile_id로 조회)', async () => {
      childService.getById.mockResolvedValue({ child_profile_id: 42, user_id: 1 });
      UsageDailySummary.findOne.mockResolvedValue(buildSummary({ child_profile_id: 42, accumulated_seconds: 77 }));
      GuardianSetting.findOne.mockResolvedValue(null);

      await usageService.getTodayUsage(1, 42);

      expect(UsageDailySummary.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ child_profile_id: 42 }) })
      );
    });
  });
});
