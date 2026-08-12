jest.mock('../../src/services/mission.service');

const request = require('supertest');
const missionService = require('../../src/services/mission.service');
const { generateAccessToken } = require('../../src/utils/jwt');
const app = require('../../src/app');

const token = generateAccessToken({ user_id: 1, email: 'a@b.com', role: 'parent' });
const auth = (req) => req.set('Authorization', `Bearer ${token}`);

describe('/api/missions', () => {
  describe('GET /', () => {
    test('인증 없이 호출하면 401', async () => {
      const res = await request(app).get('/api/missions');

      expect(res.status).toBe(401);
    });

    test('미션 카탈로그를 반환한다', async () => {
      missionService.getCatalog.mockReturnValue({
        missions: [{ missionType: 'attendance', targetCount: 1, rewardPoints: 10 }],
      });

      const res = await auth(request(app).get('/api/missions'));

      expect(res.status).toBe(200);
      expect(res.body.data.missions).toHaveLength(1);
      expect(res.body.data.missions[0].missionType).toBe('attendance');
    });
  });

  describe('GET /progress/:childId', () => {
    test('childId가 양의 정수가 아니면 400', async () => {
      const res = await auth(request(app).get('/api/missions/progress/abc'));

      expect(res.status).toBe(400);
      expect(missionService.getTodayProgress).not.toHaveBeenCalled();
    });

    test('오늘의 미션 진행 상황을 반환한다', async () => {
      missionService.getTodayProgress.mockResolvedValue({
        missionDate: '2026-08-12',
        missions: [
          {
            missionType: 'attendance',
            targetCount: 1,
            progressCount: 1,
            rewardPoints: 10,
            status: 'rewarded',
          },
        ],
      });

      const res = await auth(request(app).get('/api/missions/progress/1'));

      expect(res.status).toBe(200);
      expect(missionService.getTodayProgress).toHaveBeenCalledWith(1, 1);
      expect(res.body.data.missions[0].status).toBe('rewarded');
    });

    test('다른 유저의 자녀 프로필이면 서비스가 던진 404를 그대로 전달한다', async () => {
      const err = new Error('자녀 프로필을 찾을 수 없습니다.');
      err.statusCode = 404;
      missionService.getTodayProgress.mockRejectedValue(err);

      const res = await auth(request(app).get('/api/missions/progress/999'));

      expect(res.status).toBe(404);
    });
  });
});
