// 컨트롤러가 모듈 로드 시점에 MAX_LIMIT으로 validation 체인을 만들기 때문에,
// 자동 목으로 상수까지 undefined가 되면 체인 구성 자체가 깨진다.
// 상수는 실제 값을 쓰고 DB를 타는 함수만 목으로 바꾼다.
jest.mock('../../src/services/sticker.service', () => {
  const actual = jest.requireActual('../../src/services/sticker.service');
  return {
    ...actual,
    send: jest.fn(),
    getReceived: jest.fn(),
  };
});

const request = require('supertest');
const stickerService = require('../../src/services/sticker.service');
const { generateAccessToken } = require('../../src/utils/jwt');
const { STICKER_CATALOG } = require('../../src/config/stickerCatalog');
const app = require('../../src/app');

const token = generateAccessToken({ user_id: 1, email: 'a@b.com', role: 'parent' });
const auth = (req) => req.set('Authorization', `Bearer ${token}`);

describe('/api/stickers', () => {
  describe('GET /', () => {
    test('인증 없이 호출하면 401', async () => {
      const res = await request(app).get('/api/stickers');

      expect(res.status).toBe(401);
    });

    test('보낼 수 있는 스티커 목록을 반환한다', async () => {
      const res = await auth(request(app).get('/api/stickers'));

      expect(res.status).toBe(200);
      expect(res.body.data.stickers).toHaveLength(STICKER_CATALOG.length);
    });
  });

  describe('POST /send', () => {
    test('인증 없이 호출하면 401', async () => {
      const res = await request(app)
        .post('/api/stickers/send')
        .send({ child_profile_id: 1, sticker_code: 'well_done' });

      expect(res.status).toBe(401);
      expect(stickerService.send).not.toHaveBeenCalled();
    });

    test('알 수 없는 스티커는 400', async () => {
      const res = await auth(
        request(app).post('/api/stickers/send').send({ child_profile_id: 1, sticker_code: 'hacking' })
      );

      expect(res.status).toBe(400);
      expect(stickerService.send).not.toHaveBeenCalled();
    });

    test('child_profile_id가 없으면 400', async () => {
      const res = await auth(
        request(app).post('/api/stickers/send').send({ sticker_code: 'well_done' })
      );

      expect(res.status).toBe(400);
      expect(stickerService.send).not.toHaveBeenCalled();
    });

    test('발송에 성공하면 201과 보낸 스티커를 반환한다', async () => {
      stickerService.send.mockResolvedValue({
        sticker: {
          sticker_send_id: 1,
          sticker_code: 'well_done',
          name: '잘했어요',
          icon_key: 'thumbs_up',
          message: '잘했어!',
          sent_at: '2026-08-20T00:00:00.000Z',
        },
      });

      const res = await auth(
        request(app)
          .post('/api/stickers/send')
          .send({ child_profile_id: 1, sticker_code: 'well_done', message: '잘했어!' })
      );

      expect(res.status).toBe(201);
      expect(stickerService.send).toHaveBeenCalledWith(1, {
        childProfileId: 1,
        stickerCode: 'well_done',
        message: '잘했어!',
      });
      expect(res.body.data.sticker.name).toBe('잘했어요');
    });

    test('남의 자녀면 404를 그대로 전달한다', async () => {
      const notFound = Object.assign(new Error('자녀 프로필을 찾을 수 없습니다.'), {
        statusCode: 404,
      });
      stickerService.send.mockRejectedValue(notFound);

      const res = await auth(
        request(app)
          .post('/api/stickers/send')
          .send({ child_profile_id: 999, sticker_code: 'well_done' })
      );

      expect(res.status).toBe(404);
    });
  });

  describe('GET /received/:childId', () => {
    test('인증 없이 호출하면 401', async () => {
      const res = await request(app).get('/api/stickers/received/1');

      expect(res.status).toBe(401);
      expect(stickerService.getReceived).not.toHaveBeenCalled();
    });

    test('childId가 양의 정수가 아니면 400', async () => {
      const res = await auth(request(app).get('/api/stickers/received/abc'));

      expect(res.status).toBe(400);
      expect(stickerService.getReceived).not.toHaveBeenCalled();
    });

    test('받은 스티커를 페이지네이션과 함께 반환한다', async () => {
      stickerService.getReceived.mockResolvedValue({
        items: [{ sticker_send_id: 1, sticker_code: 'well_done', name: '잘했어요' }],
        pagination: { page: 1, limit: 20, totalCount: 1, totalPages: 1 },
      });

      const res = await auth(request(app).get('/api/stickers/received/1'));

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.totalCount).toBe(1);
    });

    test('page/limit이 실제로 서비스에 전달된다 (Express 5 query 새니타이저 회귀 방지)', async () => {
      stickerService.getReceived.mockResolvedValue({ items: [], pagination: {} });

      await auth(request(app).get('/api/stickers/received/1?page=2&limit=5'));

      expect(stickerService.getReceived).toHaveBeenCalledWith(1, 1, { page: 2, limit: 5 });
    });

    test('limit이 상한을 넘으면 400', async () => {
      const res = await auth(request(app).get('/api/stickers/received/1?limit=9999'));

      expect(res.status).toBe(400);
      expect(stickerService.getReceived).not.toHaveBeenCalled();
    });
  });
});
