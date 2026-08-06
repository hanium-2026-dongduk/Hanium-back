jest.mock('../../src/services/usage.service');

const request = require('supertest');
const usageService = require('../../src/services/usage.service');
const { generateAccessToken } = require('../../src/utils/jwt');
const app = require('../../src/app');

const token = generateAccessToken({ user_id: 1, email: 'a@b.com', role: 'parent' });
const auth = (req) => req.set('Authorization', `Bearer ${token}`);

describe('/api/usage', () => {
  describe('POST /heartbeat', () => {
    test('child_profile_id가 없으면 400이고 서비스는 호출되지 않는다', async () => {
      const res = await auth(request(app).post('/api/usage/heartbeat').send({}));

      expect(res.status).toBe(400);
      expect(usageService.recordHeartbeat).not.toHaveBeenCalled();
    });

    test('클라이언트가 X-Usage-Minutes 헤더를 조작해도 서버 계산 결과에 영향을 줄 수 없다', async () => {
      usageService.recordHeartbeat.mockResolvedValue({
        accumulatedSeconds: 42,
        limitSeconds: null,
        remainingSeconds: null,
      });

      const res = await auth(
        request(app)
          .post('/api/usage/heartbeat')
          .set('X-Usage-Minutes', '0') // 헤더로 사용량을 0으로 조작 시도
          .send({ child_profile_id: 1 })
      );

      expect(res.status).toBe(200);
      // 서비스는 (userId, childProfileId)만으로 호출되며, 어떤 헤더 값도 전달되지 않는다
      expect(usageService.recordHeartbeat).toHaveBeenCalledWith(1, 1);
      expect(res.body.data.accumulatedSeconds).toBe(42);
    });

    test('한도 초과 시 서비스가 던진 403을 그대로 전달한다', async () => {
      const err = new Error('오늘의 사용 시간이 초과되었습니다.');
      err.statusCode = 403;
      usageService.recordHeartbeat.mockRejectedValue(err);

      const res = await auth(request(app).post('/api/usage/heartbeat').send({ child_profile_id: 1 }));

      expect(res.status).toBe(403);
    });

    test('다른 유저의 자녀 프로필이면 서비스가 던진 404를 그대로 전달한다', async () => {
      const err = new Error('자녀 프로필을 찾을 수 없습니다.');
      err.statusCode = 404;
      usageService.recordHeartbeat.mockRejectedValue(err);

      const res = await auth(request(app).post('/api/usage/heartbeat').send({ child_profile_id: 999 }));

      expect(res.status).toBe(404);
    });
  });

  describe('GET /:childId/today', () => {
    test('childId가 양의 정수가 아니면 400', async () => {
      const res = await auth(request(app).get('/api/usage/abc/today'));

      expect(res.status).toBe(400);
      expect(usageService.getTodayUsage).not.toHaveBeenCalled();
    });

    test('정상 조회', async () => {
      usageService.getTodayUsage.mockResolvedValue({
        date: '2026-07-31',
        accumulatedSeconds: 100,
        limitSeconds: 600,
        remainingSeconds: 500,
        limitReached: false,
      });

      const res = await auth(request(app).get('/api/usage/1/today'));

      expect(res.status).toBe(200);
      expect(res.body.data.remainingSeconds).toBe(500);
    });
  });

  test('인증 토큰이 없으면 401', async () => {
    const res = await request(app).post('/api/usage/heartbeat').send({ child_profile_id: 1 });
    expect(res.status).toBe(401);
  });
});
