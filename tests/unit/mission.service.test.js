jest.mock('../../src/models', () => ({
  DailyMission: { findOne: jest.fn(), create: jest.fn() },
  sequelize: {
    transaction: jest.fn((cb) => cb({ LOCK: { UPDATE: 'UPDATE' } })),
  },
}));

jest.mock('../../src/services/child.service', () => ({
  getById: jest.fn(),
}));

jest.mock('../../src/services/reward.service', () => ({
  addPoints: jest.fn(),
}));

const { DailyMission, sequelize } = require('../../src/models');
const childService = require('../../src/services/child.service');
const rewardService = require('../../src/services/reward.service');
const missionService = require('../../src/services/mission.service');
const { MISSION_CATALOG } = require('../../src/config/missionCatalog');
const { getSeoulDateString } = require('../../src/utils/dateUtils');

const buildMission = (overrides = {}) => ({
  daily_mission_id: 10,
  child_profile_id: 1,
  mission_date: getSeoulDateString(),
  mission_type: 'story_read',
  target_count: 1,
  progress_count: 0,
  reward_points: 20,
  status: 'pending',
  completed_at: null,
  rewarded_at: null,
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const mockRewardGranted = () => {
  rewardService.addPoints.mockResolvedValue({
    alreadyProcessed: false,
    pointsAdded: 20,
    leveledUp: false,
    rewardTransaction: { reward_transaction_id: 1 },
  });
};

describe('mission.service', () => {
  describe('recordProgress — 입력 검증', () => {
    test('카탈로그에 없는 미션 유형이면 400을 던진다', async () => {
      await expect(
        missionService.recordProgress({ childProfileId: 1, eventType: 'unknown_event' })
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(DailyMission.findOne).not.toHaveBeenCalled();
    });

    test('진행도 증가량이 0 이하이거나 정수가 아니면 400을 던진다', async () => {
      for (const amount of [0, -1, 1.5]) {
        await expect(
          missionService.recordProgress({ childProfileId: 1, eventType: 'story_read', amount })
        ).rejects.toMatchObject({ statusCode: 400 });
      }
    });
  });

  describe('recordProgress — 지연 생성', () => {
    test('오늘자 미션 행이 없으면 카탈로그 값을 복사해 생성한다', async () => {
      DailyMission.findOne.mockResolvedValue(null);
      DailyMission.create.mockResolvedValue(buildMission());
      mockRewardGranted();

      await missionService.recordProgress({ childProfileId: 1, eventType: 'story_read' });

      expect(DailyMission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          child_profile_id: 1,
          mission_type: 'story_read',
          target_count: 1,
          reward_points: 20,
          progress_count: 0,
          status: 'pending',
        }),
        expect.anything()
      );
    });

    test('동시 생성으로 UNIQUE 충돌이 나면 재조회해 같은 행에 합류한다', async () => {
      const existing = buildMission({ progress_count: 0, target_count: 5, mission_type: 'word_clicked' });
      DailyMission.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);

      const uniqueError = new Error('duplicate');
      uniqueError.name = 'SequelizeUniqueConstraintError';
      DailyMission.create.mockRejectedValue(uniqueError);

      const result = await missionService.recordProgress({
        childProfileId: 1,
        eventType: 'word_clicked',
      });

      expect(result.mission).toBe(existing);
      expect(existing.progress_count).toBe(1);
    });

    test('UNIQUE 충돌이 아닌 오류는 그대로 전파한다', async () => {
      DailyMission.findOne.mockResolvedValue(null);
      DailyMission.create.mockRejectedValue(new Error('DB가 죽었습니다'));

      await expect(
        missionService.recordProgress({ childProfileId: 1, eventType: 'story_read' })
      ).rejects.toThrow('DB가 죽었습니다');
    });
  });

  describe('recordProgress — 상태 전이', () => {
    test('목표 미달이면 진행도만 올리고 pending을 유지하며 포인트를 지급하지 않는다', async () => {
      const mission = buildMission({ mission_type: 'word_clicked', target_count: 5, progress_count: 1 });
      DailyMission.findOne.mockResolvedValue(mission);

      const result = await missionService.recordProgress({
        childProfileId: 1,
        eventType: 'word_clicked',
        amount: 2,
      });

      expect(mission.progress_count).toBe(3);
      expect(mission.status).toBe('pending');
      expect(rewardService.addPoints).not.toHaveBeenCalled();
      expect(result).toMatchObject({ updated: true, reward: null });
    });

    test('목표 도달 시 completed를 거쳐 rewarded까지 전이하고 포인트를 지급한다', async () => {
      const mission = buildMission();
      DailyMission.findOne.mockResolvedValue(mission);
      mockRewardGranted();

      const result = await missionService.recordProgress({
        childProfileId: 1,
        eventType: 'story_read',
      });

      expect(mission.progress_count).toBe(1);
      expect(mission.status).toBe('rewarded');
      expect(mission.completed_at).toBeInstanceOf(Date);
      expect(mission.rewarded_at).toBeInstanceOf(Date);
      expect(result.updated).toBe(true);
      expect(result.reward.pointsAdded).toBe(20);
    });

    test('보상 지급의 멱등키는 daily_mission_id 기반이다', async () => {
      const mission = buildMission({ daily_mission_id: 77 });
      DailyMission.findOne.mockResolvedValue(mission);
      mockRewardGranted();

      await missionService.recordProgress({ childProfileId: 1, eventType: 'story_read' });

      expect(rewardService.addPoints).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'mission:77',
          reason: 'mission_reward',
          points: 20,
        })
      );
    });

    test('목표를 넘는 증가량은 target_count에서 잘린다', async () => {
      const mission = buildMission({ mission_type: 'word_clicked', target_count: 5, progress_count: 0 });
      DailyMission.findOne.mockResolvedValue(mission);
      mockRewardGranted();

      await missionService.recordProgress({
        childProfileId: 1,
        eventType: 'word_clicked',
        amount: 99,
      });

      expect(mission.progress_count).toBe(5);
    });

    test('이미 rewarded면 진행도를 올리지 않고 updated:false로 무시한다', async () => {
      const mission = buildMission({ status: 'rewarded', progress_count: 1 });
      DailyMission.findOne.mockResolvedValue(mission);

      const result = await missionService.recordProgress({
        childProfileId: 1,
        eventType: 'story_read',
      });

      expect(result).toMatchObject({ updated: false, reward: null });
      expect(mission.progress_count).toBe(1);
      expect(mission.save).not.toHaveBeenCalled();
      expect(rewardService.addPoints).not.toHaveBeenCalled();
    });

    test('completed에서 멈춘 미션은 진행도를 다시 올리지 않고 지급만 이어서 시도한다', async () => {
      const mission = buildMission({ status: 'completed', progress_count: 1, completed_at: new Date() });
      DailyMission.findOne.mockResolvedValue(mission);
      mockRewardGranted();

      const result = await missionService.recordProgress({
        childProfileId: 1,
        eventType: 'story_read',
      });

      expect(mission.progress_count).toBe(1);
      expect(mission.status).toBe('rewarded');
      expect(result.updated).toBe(true);
      expect(rewardService.addPoints).toHaveBeenCalledTimes(1);
    });

    test('eventId를 넘기면 원장 metadata에 함께 기록된다', async () => {
      DailyMission.findOne.mockResolvedValue(buildMission());
      mockRewardGranted();

      await missionService.recordProgress({
        childProfileId: 1,
        eventType: 'story_read',
        eventId: 'story-42',
      });

      expect(rewardService.addPoints).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ missionType: 'story_read', eventId: 'story-42' }),
        })
      );
    });
  });

  describe('recordProgress — 트랜잭션 합류', () => {
    test('외부 트랜잭션을 넘기면 새 트랜잭션을 열지 않고 그대로 재사용한다', async () => {
      const outer = { LOCK: { UPDATE: 'UPDATE' } };
      const mission = buildMission({ mission_type: 'word_clicked', target_count: 5 });
      DailyMission.findOne.mockResolvedValue(mission);

      await missionService.recordProgress({
        childProfileId: 1,
        eventType: 'word_clicked',
        transaction: outer,
      });

      expect(sequelize.transaction).not.toHaveBeenCalled();
      expect(DailyMission.findOne).toHaveBeenCalledWith(expect.objectContaining({ transaction: outer }));
    });

    test('트랜잭션을 넘기지 않으면 스스로 최상위 트랜잭션을 연다', async () => {
      const mission = buildMission({ mission_type: 'word_clicked', target_count: 5 });
      DailyMission.findOne.mockResolvedValue(mission);

      await missionService.recordProgress({ childProfileId: 1, eventType: 'word_clicked' });

      expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCatalog', () => {
    test('카탈로그를 API 응답 형태로 변환해 반환한다', () => {
      const { missions } = missionService.getCatalog();

      expect(missions).toHaveLength(MISSION_CATALOG.length);
      expect(missions[0]).toEqual({
        missionType: MISSION_CATALOG[0].mission_type,
        targetCount: MISSION_CATALOG[0].target_count,
        rewardPoints: MISSION_CATALOG[0].reward_points,
      });
    });
  });

  describe('getTodayProgress', () => {
    test('소유하지 않은 자녀 프로필이면 404를 그대로 전달한다', async () => {
      const notFound = new Error('자녀 프로필을 찾을 수 없습니다.');
      notFound.statusCode = 404;
      childService.getById.mockRejectedValue(notFound);

      await expect(missionService.getTodayProgress(1, 999)).rejects.toMatchObject({ statusCode: 404 });
      expect(DailyMission.findOne).not.toHaveBeenCalled();
    });

    test('오늘자 미션 4종을 카탈로그 순서대로 생성해 반환한다', async () => {
      childService.getById.mockResolvedValue({ child_profile_id: 1, user_id: 1 });
      DailyMission.findOne.mockResolvedValue(null);
      DailyMission.create.mockImplementation((values) => Promise.resolve(buildMission(values)));

      const result = await missionService.getTodayProgress(1, 1);

      expect(result.missionDate).toBe(getSeoulDateString());
      expect(result.missions.map((mission) => mission.missionType)).toEqual(
        MISSION_CATALOG.map((definition) => definition.mission_type)
      );
      expect(result.missions[0]).toEqual({
        missionType: MISSION_CATALOG[0].mission_type,
        targetCount: MISSION_CATALOG[0].target_count,
        progressCount: 0,
        rewardPoints: MISSION_CATALOG[0].reward_points,
        status: 'pending',
      });
    });

    test('이미 있는 행은 다시 생성하지 않고 현재 진행도를 그대로 반환한다', async () => {
      childService.getById.mockResolvedValue({ child_profile_id: 1, user_id: 1 });
      DailyMission.findOne.mockImplementation(({ where }) =>
        Promise.resolve(
          buildMission({
            mission_type: where.mission_type,
            progress_count: 1,
            status: 'rewarded',
          })
        )
      );

      const result = await missionService.getTodayProgress(1, 1);

      expect(DailyMission.create).not.toHaveBeenCalled();
      expect(result.missions.every((mission) => mission.status === 'rewarded')).toBe(true);
    });
  });
});
