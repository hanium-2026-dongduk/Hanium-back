// getCatalog은 카탈로그 상수를 그대로 읽는 순수 함수라 목으로 바꾸지 않고 실제 동작을 본다.
// 자녀별 조회만 DB를 타므로 그 함수만 목으로 대체한다.
jest.mock('../../src/services/badge.service', () => {
  const actual = jest.requireActual('../../src/services/badge.service');
  return {
    ...actual,
    getChildBadges: jest.fn(),
  };
});

const request = require('supertest');
const badgeService = require('../../src/services/badge.service');
const { generateAccessToken } = require('../../src/utils/jwt');
const { BADGE_CATALOG } = require('../../src/config/badgeCatalog');
const app = require('../../src/app');

const token = generateAccessToken({ user_id: 1, email: 'a@b.com', role: 'parent' });
const auth = (req) => req.set('Authorization', `Bearer ${token}`);

describe('/api/badges', () => {
  describe('GET /', () => {
    test('인증 없이 호출하면 401', async () => {
      const res = await request(app).get('/api/badges');

      expect(res.status).toBe(401);
    });

    test('전체 배지 카탈로그를 반환한다', async () => {
      const res = await auth(request(app).get('/api/badges'));

      expect(res.status).toBe(200);
      expect(res.body.data.badges).toHaveLength(BADGE_CATALOG.length);
      expect(res.body.data.badges[0]).toEqual(
        expect.objectContaining({
          badge_code: expect.any(String),
          name: expect.any(String),
          description: expect.any(String),
          icon_key: expect.any(String),
          evaluable: expect.any(Boolean),
        })
      );
    });

    test('프론트가 진행도를 그릴 수 있도록 조건 수치를 함께 준다', async () => {
      const res = await auth(request(app).get('/api/badges'));

      expect(res.body.data.badges[0].condition).toEqual(
        expect.objectContaining({ type: expect.any(String), value: expect.any(Number) })
      );
    });
  });

  describe('GET /:childId', () => {
    test('인증 없이 호출하면 401', async () => {
      const res = await request(app).get('/api/badges/1');

      expect(res.status).toBe(401);
      expect(badgeService.getChildBadges).not.toHaveBeenCalled();
    });

    test('childId가 양의 정수가 아니면 400', async () => {
      const res = await auth(request(app).get('/api/badges/abc'));

      expect(res.status).toBe(400);
      expect(badgeService.getChildBadges).not.toHaveBeenCalled();
    });

    test('자녀의 배지 현황을 상태와 함께 반환한다', async () => {
      badgeService.getChildBadges.mockResolvedValue({
        badges: [
          { badge_code: 'attendance_first', status: 'earned', awarded_at: '2026-08-01T00:00:00.000Z' },
          { badge_code: 'streak_10', status: 'locked', awarded_at: null },
          { badge_code: 'story_10', status: 'coming_soon', awarded_at: null },
        ],
        earned_count: 1,
        total_count: 3,
      });

      const res = await auth(request(app).get('/api/badges/1'));

      expect(res.status).toBe(200);
      expect(badgeService.getChildBadges).toHaveBeenCalledWith(1, 1);
      expect(res.body.data.earned_count).toBe(1);
      expect(res.body.data.badges.map((b) => b.status)).toEqual([
        'earned',
        'locked',
        'coming_soon',
      ]);
    });

    test('남의 자녀면 404를 그대로 전달한다', async () => {
      const notFound = Object.assign(new Error('자녀 프로필을 찾을 수 없습니다.'), {
        statusCode: 404,
      });
      badgeService.getChildBadges.mockRejectedValue(notFound);

      const res = await auth(request(app).get('/api/badges/999'));

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
