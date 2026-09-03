jest.mock('../../src/models', () => ({
  AttendanceLog: { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn() },
  sequelize: {
    transaction: jest.fn((cb) => cb({ LOCK: { UPDATE: 'UPDATE' } })),
  },
}));

jest.mock('../../src/services/child.service', () => ({
  getById: jest.fn(),
}));

jest.mock('../../src/services/reward.service', () => ({
  addPoints: jest.fn(),
  getOrCreateWallet: jest.fn(),
}));

jest.mock('../../src/services/mission.service', () => ({
  recordProgress: jest.fn(),
}));

const { AttendanceLog } = require('../../src/models');
const childService = require('../../src/services/child.service');
const rewardService = require('../../src/services/reward.service');
const missionService = require('../../src/services/mission.service');
const attendanceService = require('../../src/services/attendance.service');
const { getSeoulDateString, addDays } = require('../../src/utils/dateUtils');

const TODAY = getSeoulDateString();

const buildWallet = (overrides = {}) => ({
  child_profile_id: 1,
  points: 0,
  level: 1,
  streak_days: 0,
  last_activity_date: null,
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const mockOwnedProfile = () => {
  childService.getById.mockResolvedValue({ child_profile_id: 1, user_id: 1 });
};

const mockMissionReward = (pointsAdded = 10) => {
  missionService.recordProgress.mockResolvedValue({
    updated: true,
    mission: { mission_type: 'attendance' },
    reward: { pointsAdded, alreadyProcessed: false },
  });
};

describe('attendance.service', () => {
  describe('checkIn', () => {
    test('소유하지 않은 자녀 프로필이면 404를 그대로 전달한다', async () => {
      const notFound = new Error('자녀 프로필을 찾을 수 없습니다.');
      notFound.statusCode = 404;
      childService.getById.mockRejectedValue(notFound);

      await expect(attendanceService.checkIn(1, 999)).rejects.toMatchObject({ statusCode: 404 });
      expect(AttendanceLog.create).not.toHaveBeenCalled();
    });

    test('그날 첫 출석이면 로그를 만들고 미션 보상 포인트를 반환한다', async () => {
      mockOwnedProfile();
      AttendanceLog.findOne.mockResolvedValue(null);
      AttendanceLog.create.mockResolvedValue({});
      mockMissionReward(10);
      rewardService.getOrCreateWallet.mockResolvedValue(buildWallet());

      const result = await attendanceService.checkIn(1, 1);

      expect(AttendanceLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ child_profile_id: 1, attendance_date: TODAY }),
        expect.anything()
      );
      expect(result).toMatchObject({
        alreadyChecked: false,
        attendanceDate: TODAY,
        streakDays: 1,
        pointsEarned: 10,
      });
    });

    test('출석 포인트는 직접 지급하지 않고 attendance 미션을 통해 지급한다', async () => {
      mockOwnedProfile();
      AttendanceLog.findOne.mockResolvedValue(null);
      AttendanceLog.create.mockResolvedValue({});
      mockMissionReward(10);
      rewardService.getOrCreateWallet.mockResolvedValue(buildWallet());

      await attendanceService.checkIn(1, 1);

      expect(missionService.recordProgress).toHaveBeenCalledWith(
        expect.objectContaining({ childProfileId: 1, eventType: 'attendance' })
      );
      // 마일스톤이 아니므로 streak_bonus 지급도 없다 → addPoints 직접 호출 0회
      expect(rewardService.addPoints).not.toHaveBeenCalled();
    });

    test('같은 날 재요청은 아무것도 바꾸지 않고 alreadyChecked로 돌아간다', async () => {
      mockOwnedProfile();
      AttendanceLog.findOne.mockResolvedValue({ attendance_log_id: 1 });
      rewardService.getOrCreateWallet.mockResolvedValue(buildWallet({ streak_days: 4 }));

      const result = await attendanceService.checkIn(1, 1);

      expect(result).toMatchObject({ alreadyChecked: true, streakDays: 4, pointsEarned: 0 });
      expect(AttendanceLog.create).not.toHaveBeenCalled();
      expect(missionService.recordProgress).not.toHaveBeenCalled();
      expect(rewardService.addPoints).not.toHaveBeenCalled();
    });

    test('동시 요청으로 UNIQUE 충돌이 나면 진 쪽은 포인트 지급 경로를 타지 않는다', async () => {
      mockOwnedProfile();
      AttendanceLog.findOne.mockResolvedValue(null);
      const uniqueError = new Error('duplicate');
      uniqueError.name = 'SequelizeUniqueConstraintError';
      AttendanceLog.create.mockRejectedValue(uniqueError);
      rewardService.getOrCreateWallet.mockResolvedValue(buildWallet({ streak_days: 2 }));

      const result = await attendanceService.checkIn(1, 1);

      expect(result).toMatchObject({ alreadyChecked: true, pointsEarned: 0 });
      expect(missionService.recordProgress).not.toHaveBeenCalled();
    });

    test('UNIQUE 충돌이 아닌 오류는 그대로 전파한다', async () => {
      mockOwnedProfile();
      AttendanceLog.findOne.mockResolvedValue(null);
      AttendanceLog.create.mockRejectedValue(new Error('DB가 죽었습니다'));

      await expect(attendanceService.checkIn(1, 1)).rejects.toThrow('DB가 죽었습니다');
    });

    test('연속 출석 마일스톤에 도달하면 보너스를 함께 지급한다', async () => {
      mockOwnedProfile();
      AttendanceLog.findOne.mockResolvedValue(null);
      AttendanceLog.create.mockResolvedValue({});
      mockMissionReward(10);
      // 어제까지 2일 연속 → 오늘 출석으로 3일차(마일스톤 20점)
      rewardService.getOrCreateWallet.mockResolvedValue(
        buildWallet({ streak_days: 2, last_activity_date: addDays(TODAY, -1) })
      );
      rewardService.addPoints.mockResolvedValue({ pointsAdded: 20, alreadyProcessed: false });

      const result = await attendanceService.checkIn(1, 1);

      expect(rewardService.addPoints).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'streak_bonus',
          points: 20,
          idempotencyKey: `streak:1:${TODAY}`,
        })
      );
      expect(result).toMatchObject({ streakDays: 3, pointsEarned: 30 });
    });

    test('마일스톤이 아닌 연속일수에는 보너스를 지급하지 않는다', async () => {
      mockOwnedProfile();
      AttendanceLog.findOne.mockResolvedValue(null);
      AttendanceLog.create.mockResolvedValue({});
      mockMissionReward(10);
      rewardService.getOrCreateWallet.mockResolvedValue(
        buildWallet({ streak_days: 3, last_activity_date: addDays(TODAY, -1) })
      );

      const result = await attendanceService.checkIn(1, 1);

      expect(result.streakDays).toBe(4);
      expect(rewardService.addPoints).not.toHaveBeenCalled();
      expect(result.pointsEarned).toBe(10);
    });

    test('출석 미션이 이미 보상 완료된 경우 미션 포인트는 0으로 집계된다', async () => {
      mockOwnedProfile();
      AttendanceLog.findOne.mockResolvedValue(null);
      AttendanceLog.create.mockResolvedValue({});
      missionService.recordProgress.mockResolvedValue({ updated: false, mission: {}, reward: null });
      rewardService.getOrCreateWallet.mockResolvedValue(buildWallet());

      const result = await attendanceService.checkIn(1, 1);

      expect(result.pointsEarned).toBe(0);
      expect(result.alreadyChecked).toBe(false);
    });
  });

  describe('applyStreak', () => {
    test('어제 출석했으면 연속일수를 1 늘린다', () => {
      const wallet = buildWallet({ streak_days: 4, last_activity_date: addDays(TODAY, -1) });
      expect(attendanceService.applyStreak(wallet, TODAY)).toBe(5);
      expect(wallet.last_activity_date).toBe(TODAY);
    });

    test('연속이 끊겼으면 1로 리셋한다', () => {
      const wallet = buildWallet({ streak_days: 9, last_activity_date: addDays(TODAY, -3) });
      expect(attendanceService.applyStreak(wallet, TODAY)).toBe(1);
    });

    test('첫 출석(기록 없음)이면 1이 된다', () => {
      const wallet = buildWallet({ streak_days: 0, last_activity_date: null });
      expect(attendanceService.applyStreak(wallet, TODAY)).toBe(1);
    });

    test('이미 오늘로 갱신돼 있으면 건드리지 않는다', () => {
      const wallet = buildWallet({ streak_days: 6, last_activity_date: TODAY });
      expect(attendanceService.applyStreak(wallet, TODAY)).toBe(6);
    });
  });

  describe('getMonthly', () => {
    test('month 형식이 잘못되면 400을 던진다', async () => {
      await expect(attendanceService.getMonthly(1, 1, { month: '2026-13' })).rejects.toMatchObject({
        statusCode: 400,
      });
      await expect(attendanceService.getMonthly(1, 1, { month: '202608' })).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(childService.getById).not.toHaveBeenCalled();
    });

    test('소유하지 않은 자녀 프로필이면 404를 그대로 전달한다', async () => {
      const notFound = new Error('자녀 프로필을 찾을 수 없습니다.');
      notFound.statusCode = 404;
      childService.getById.mockRejectedValue(notFound);

      await expect(attendanceService.getMonthly(1, 999)).rejects.toMatchObject({ statusCode: 404 });
    });

    test('지난 달은 월 전체 일수를 분모로 출석률을 계산한다', async () => {
      mockOwnedProfile();
      AttendanceLog.findAll.mockResolvedValue([
        { attendance_date: '2026-06-01' },
        { attendance_date: '2026-06-02' },
        { attendance_date: '2026-06-15' },
      ]);
      rewardService.getOrCreateWallet.mockResolvedValue(buildWallet({ streak_days: 2 }));

      const result = await attendanceService.getMonthly(1, 1, { month: '2026-06' });

      expect(result).toMatchObject({
        month: '2026-06',
        attendedCount: 3,
        denominator: 30,
        attendanceRate: 10,
        currentStreak: 2,
      });
      expect(result.attendedDates).toEqual(['2026-06-01', '2026-06-02', '2026-06-15']);
    });

    test('진행 중인 이번 달은 오늘까지 경과한 일수를 분모로 쓴다', async () => {
      mockOwnedProfile();
      AttendanceLog.findAll.mockResolvedValue([{ attendance_date: TODAY }]);
      rewardService.getOrCreateWallet.mockResolvedValue(buildWallet());

      const result = await attendanceService.getMonthly(1, 1);

      expect(result.month).toBe(TODAY.slice(0, 7));
      expect(result.denominator).toBe(Number(TODAY.slice(8, 10)));
    });

    test('출석률은 소수 1자리로 반올림한다', async () => {
      mockOwnedProfile();
      // 2026-06(30일) 중 1일 출석 → 3.333...% → 3.3
      AttendanceLog.findAll.mockResolvedValue([{ attendance_date: '2026-06-01' }]);
      rewardService.getOrCreateWallet.mockResolvedValue(buildWallet());

      const result = await attendanceService.getMonthly(1, 1, { month: '2026-06' });

      expect(result.attendanceRate).toBe(3.3);
    });

    test('출석 기록이 없으면 0%를 반환한다', async () => {
      mockOwnedProfile();
      AttendanceLog.findAll.mockResolvedValue([]);
      rewardService.getOrCreateWallet.mockResolvedValue(buildWallet());

      const result = await attendanceService.getMonthly(1, 1, { month: '2026-06' });

      expect(result).toMatchObject({ attendedCount: 0, attendanceRate: 0 });
      expect(result.attendedDates).toEqual([]);
    });
  });
});
