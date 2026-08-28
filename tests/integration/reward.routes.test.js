// 컨트롤러가 모듈 로드 시점에 REWARD_REASONS/MAX_HISTORY_LIMIT으로 validation 체인을
// 만들기 때문에, 자동 목으로 상수까지 undefined가 되면 체인 구성 자체가 깨진다.
// 상수는 실제 값을 그대로 쓰고 함수만 목으로 바꾼다.
jest.mock('../../src/services/reward.service', () => {
  const actual = jest.requireActual('../../src/services/reward.service');
  return {
    ...actual,
    getRewards: jest.fn(),
    getSummary: jest.fn(),
    getHistory: jest.fn(),
  };
});

const request = require('supertest');
const rewardService = require('../../src/services/reward.service');
const { generateAccessToken } = require('../../src/utils/jwt');
const app = require('../../src/app');

const token = generateAccessToken({ user_id: 1, email: 'a@b.com', role: 'parent' });
const auth = (req) => req.set('Authorization', `Bearer ${token}`);

describe('/api/rewards', () => {
  describe('GET /:childId', () => {
    test('인증 없이 호출하면 401', async () => {
      const res = await request(app).get('/api/rewards/1');

      expect(res.status).toBe(401);
      expect(rewardService.getRewards).not.toHaveBeenCalled();
    });

    test('childId가 양의 정수가 아니면 400', async () => {
      const res = await auth(request(app).get('/api/rewards/abc'));

      expect(res.status).toBe(400);
      expect(rewardService.getRewards).not.toHaveBeenCalled();
    });

    test('포인트/레벨/연속출석일과 다음 레벨까지의 진행도를 반환한다', async () => {
      rewardService.getRewards.mockResolvedValue({
        childProfileId: 1,
        points: 340,
        level: 3,
        streakDays: 4,
        levelProgress: { currentLevelFloor: 300, nextLevelAt: 600, pointsToNextLevel: 260 },
      });

      const res = await auth(request(app).get('/api/rewards/1'));

      expect(res.status).toBe(200);
      expect(rewardService.getRewards).toHaveBeenCalledWith(1, 1);
      expect(res.body.data.levelProgress.pointsToNextLevel).toBe(260);
    });

    test('다른 유저의 자녀 프로필이면 서비스가 던진 404를 그대로 전달한다', async () => {
      const err = new Error('자녀 프로필을 찾을 수 없습니다.');
      err.statusCode = 404;
      rewardService.getRewards.mockRejectedValue(err);

      const res = await auth(request(app).get('/api/rewards/999'));

      expect(res.status).toBe(404);
    });
  });

  describe('GET /:childId/summary', () => {
    test('보유 포인트만 담은 경량 응답을 반환한다', async () => {
      rewardService.getSummary.mockResolvedValue({ points: 340 });

      const res = await auth(request(app).get('/api/rewards/1/summary'));

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ points: 340 });
      // /:childId 라우트가 먼저 잡아채지 않고 summary 핸들러가 실행돼야 한다
      expect(rewardService.getRewards).not.toHaveBeenCalled();
    });
  });

  describe('GET /:childId/history', () => {
    const emptyPage = {
      items: [],
      pagination: { page: 1, limit: 20, totalCount: 0, totalPages: 0 },
    };

    test('쿼리 없이 호출하면 서비스 기본값이 적용되도록 undefined를 넘긴다', async () => {
      rewardService.getHistory.mockResolvedValue(emptyPage);

      const res = await auth(request(app).get('/api/rewards/1/history'));

      expect(res.status).toBe(200);
      expect(rewardService.getHistory).toHaveBeenCalledWith(1, 1, {
        page: undefined,
        limit: undefined,
        reason: undefined,
        from: undefined,
        to: undefined,
      });
    });

    test('page/limit은 문자열이 아니라 숫자로 서비스에 전달된다', async () => {
      // Express 5의 req.query는 읽기 전용이라 express-validator의 .toInt()가 값을 되돌려
      // 쓰지 못한다. 문자열이 그대로 넘어가면 서비스의 Number.isInteger 검사에 걸려
      // 조용히 기본값(1페이지)으로 떨어지므로, 컨트롤러가 직접 변환해야 한다.
      rewardService.getHistory.mockResolvedValue(emptyPage);

      const res = await auth(request(app).get('/api/rewards/1/history?page=3&limit=5'));

      expect(res.status).toBe(200);
      expect(rewardService.getHistory).toHaveBeenCalledWith(
        1,
        1,
        expect.objectContaining({ page: 3, limit: 5 })
      );
    });

    test('page가 1 미만이면 400', async () => {
      const res = await auth(request(app).get('/api/rewards/1/history?page=0'));

      expect(res.status).toBe(400);
      expect(rewardService.getHistory).not.toHaveBeenCalled();
    });

    test('limit이 상한을 넘으면 400', async () => {
      const res = await auth(
        request(app).get(`/api/rewards/1/history?limit=${rewardService.MAX_HISTORY_LIMIT + 1}`)
      );

      expect(res.status).toBe(400);
      expect(rewardService.getHistory).not.toHaveBeenCalled();
    });

    test('알 수 없는 reason이면 400', async () => {
      const res = await auth(request(app).get('/api/rewards/1/history?reason=hacking'));

      expect(res.status).toBe(400);
      expect(rewardService.getHistory).not.toHaveBeenCalled();
    });

    test('허용된 reason은 그대로 전달한다', async () => {
      rewardService.getHistory.mockResolvedValue(emptyPage);

      const res = await auth(request(app).get('/api/rewards/1/history?reason=mission_reward'));

      expect(res.status).toBe(200);
      expect(rewardService.getHistory).toHaveBeenCalledWith(
        1,
        1,
        expect.objectContaining({ reason: 'mission_reward' })
      );
    });

    test('from/to 형식이 잘못되면 400', async () => {
      const res = await auth(request(app).get('/api/rewards/1/history?from=2026-8-1'));

      expect(res.status).toBe(400);
      expect(rewardService.getHistory).not.toHaveBeenCalled();
    });

    test('이력 목록과 페이지네이션을 반환한다', async () => {
      rewardService.getHistory.mockResolvedValue({
        items: [
          {
            points: 20,
            reason: 'mission_reward',
            balanceAfter: 340,
            createdAt: '2026-08-12T01:00:00.000Z',
            metadata: { missionType: 'story_read' },
          },
        ],
        pagination: { page: 1, limit: 20, totalCount: 1, totalPages: 1 },
      });

      const res = await auth(request(app).get('/api/rewards/1/history'));

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.pagination.totalCount).toBe(1);
    });
  });
});
