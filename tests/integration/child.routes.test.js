jest.mock('../../src/services/child.service');

const request = require('supertest');
const childService = require('../../src/services/child.service');
const { generateAccessToken } = require('../../src/utils/jwt');
const app = require('../../src/app');

const token = generateAccessToken({ user_id: 1, email: 'a@b.com', role: 'parent' });
const auth = (req) => req.set('Authorization', `Bearer ${token}`);

describe('/api/children', () => {
  describe('id 파라미터 검증', () => {
    test('GET /api/children/:id - 숫자가 아니면 400이고 서비스는 호출되지 않는다', async () => {
      const res = await auth(request(app).get('/api/children/abc'));

      expect(res.status).toBe(400);
      expect(childService.getById).not.toHaveBeenCalled();
    });

    test('DELETE /api/children/:id - 0 이하이면 400', async () => {
      const res = await auth(request(app).delete('/api/children/0'));

      expect(res.status).toBe(400);
      expect(childService.remove).not.toHaveBeenCalled();
    });
  });

  describe('소유권 (다른 유저의 프로필 접근 차단)', () => {
    test('GET /api/children/:id - 서비스가 404를 던지면 그대로 전달된다', async () => {
      const err = new Error('자녀 프로필을 찾을 수 없습니다.');
      err.statusCode = 404;
      childService.getById.mockRejectedValue(err);

      const res = await auth(request(app).get('/api/children/5'));

      expect(res.status).toBe(404);
    });

    test('PUT /api/children/:id - 다른 유저 소유면 404', async () => {
      const err = new Error('자녀 프로필을 찾을 수 없습니다.');
      err.statusCode = 404;
      childService.update.mockRejectedValue(err);

      const res = await auth(request(app).put('/api/children/5').send({ child_name: '새이름' }));

      expect(res.status).toBe(404);
    });
  });

  describe('빈 PUT 요청 거부', () => {
    test('body가 비어있으면 서비스가 던진 400을 그대로 전달한다', async () => {
      const err = new Error('수정할 필드가 없습니다.');
      err.statusCode = 400;
      childService.update.mockRejectedValue(err);

      const res = await auth(request(app).put('/api/children/1').send({}));

      expect(res.status).toBe(400);
    });
  });

  describe('생성 유효성 검사', () => {
    test('vocabulary_level이 너무 길면 400', async () => {
      const res = await auth(
        request(app)
          .post('/api/children')
          .send({ child_name: '아이', vocabulary_level: 'x'.repeat(40) })
      );

      expect(res.status).toBe(400);
      expect(childService.create).not.toHaveBeenCalled();
    });

    test('profile_image_url이 URL 형식이 아니면 400', async () => {
      const res = await auth(
        request(app).post('/api/children').send({ child_name: '아이', profile_image_url: 'not-a-url' })
      );

      expect(res.status).toBe(400);
      expect(childService.create).not.toHaveBeenCalled();
    });

    test('정상 요청은 서비스 결과를 201로 반환한다', async () => {
      childService.create.mockResolvedValue({ child_profile_id: 1, child_name: '아이' });

      const res = await auth(request(app).post('/api/children').send({ child_name: '아이' }));

      expect(res.status).toBe(201);
      expect(res.body.data.profile.child_profile_id).toBe(1);
    });
  });

  describe('PATCH /api/children/:id/activate', () => {
    test('정상 요청은 서비스 결과를 200으로 반환한다', async () => {
      childService.activate.mockResolvedValue({ child_profile_id: 2, is_active: true });

      const res = await auth(request(app).patch('/api/children/2/activate'));

      expect(res.status).toBe(200);
      expect(res.body.data.profile.is_active).toBe(true);
    });

    test('id가 양의 정수가 아니면 400', async () => {
      const res = await auth(request(app).patch('/api/children/-1/activate'));

      expect(res.status).toBe(400);
      expect(childService.activate).not.toHaveBeenCalled();
    });
  });

  test('인증 토큰이 없으면 401', async () => {
    const res = await request(app).get('/api/children');
    expect(res.status).toBe(401);
  });
});
