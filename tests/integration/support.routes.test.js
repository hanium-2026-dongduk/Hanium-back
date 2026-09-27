jest.mock('../../src/services/support.service');

const request = require('supertest');
const support = require('../../src/services/support.service');
const { generateAccessToken } = require('../../src/utils/jwt');
const app = require('../../src/app');

const token = generateAccessToken({ user_id: 7, email: 'parent@example.com', role: 'parent' });
const auth = (req) => req.set('Authorization', `Bearer ${token}`);
const emptyList = { items: [], pagination: { page: 1, limit: 20, totalCount: 0, totalPages: 1 } };

beforeEach(() => {
  support.listNotices.mockResolvedValue(emptyList);
  support.getNotice.mockResolvedValue({ notice: { notice_id: 1, is_read: false } });
  support.markNoticeRead.mockResolvedValue({ notice_id: 1, is_read: true, read_at: '2026-09-27T00:00:00Z' });
  support.listEvents.mockResolvedValue(emptyList);
  support.getEvent.mockResolvedValue({ event: { event_id: 1, status: 'ongoing' } });
  support.listFaqs.mockResolvedValue(emptyList);
  support.createInquiry.mockResolvedValue({ inquiry: { inquiry_id: 1, status: 'pending' } });
  support.listInquiries.mockResolvedValue(emptyList);
  support.getInquiry.mockResolvedValue({ inquiry: { inquiry_id: 1, status: 'answered' } });
});

describe('고객지원 API', () => {
  test.each([
    ['get', '/api/notices'], ['get', '/api/notices/1'], ['post', '/api/notices/1/read'],
    ['get', '/api/events'], ['get', '/api/events/1'], ['get', '/api/faqs'],
    ['get', '/api/faqs/recommended'], ['post', '/api/inquiries'],
    ['get', '/api/inquiries'], ['get', '/api/inquiries/1'],
  ])('인증 없는 %s %s 요청은 401', async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
  });

  test('공지 목록은 계정 ID와 페이지 조건으로 조회한다', async () => {
    const res = await auth(request(app).get('/api/notices?page=2&limit=5'));
    expect(res.status).toBe(200);
    expect(support.listNotices).toHaveBeenCalledWith(7, { page: 2, limit: 5 });
    expect(res.body.data).toEqual(emptyList);
  });

  test('공지 읽음 처리는 인증된 계정과 공지 ID를 전달한다', async () => {
    const res = await auth(request(app).post('/api/notices/1/read'));
    expect(res.status).toBe(200);
    expect(support.markNoticeRead).toHaveBeenCalledWith(7, 1);
  });

  test('잘못된 이벤트 상태와 ID는 400으로 거부한다', async () => {
    const status = await auth(request(app).get('/api/events?status=upcoming'));
    const id = await auth(request(app).get('/api/events/abc'));
    expect(status.status).toBe(400);
    expect(id.status).toBe(400);
    expect(support.listEvents).not.toHaveBeenCalled();
    expect(support.getEvent).not.toHaveBeenCalled();
  });

  test('이벤트 상태를 서비스에 전달한다', async () => {
    const res = await auth(request(app).get('/api/events?status=ended'));
    expect(res.status).toBe(200);
    expect(support.listEvents).toHaveBeenCalledWith({ status: 'ended', page: 1, limit: 20 });
  });

  test('FAQ 검색과 추천 목록을 구분한다', async () => {
    const search = await auth(request(app).get('/api/faqs?keyword=%20환불%20'));
    const recommended = await auth(request(app).get('/api/faqs/recommended'));
    expect(search.status).toBe(200);
    expect(recommended.status).toBe(200);
    expect(support.listFaqs).toHaveBeenNthCalledWith(1, { keyword: '환불', page: 1, limit: 20 });
    expect(support.listFaqs).toHaveBeenNthCalledWith(2, { recommendedOnly: true, page: 1, limit: 20 });
  });

  test('빈 문의는 저장하지 않고 정상 문의는 계정에 연결한다', async () => {
    const invalid = await auth(request(app).post('/api/inquiries').send({ title: ' ', content: ' ' }));
    expect(invalid.status).toBe(400);
    expect(support.createInquiry).not.toHaveBeenCalled();

    const valid = await auth(request(app).post('/api/inquiries').send({ title: '문의', content: '내용' }));
    expect(valid.status).toBe(201);
    expect(support.createInquiry).toHaveBeenCalledWith(7, { title: '문의', content: '내용' });
  });

  test('다른 사람의 문의는 404로 응답한다', async () => {
    support.getInquiry.mockRejectedValue(Object.assign(new Error('문의를 찾을 수 없습니다.'), { statusCode: 404 }));
    const res = await auth(request(app).get('/api/inquiries/42'));
    expect(res.status).toBe(404);
    expect(support.getInquiry).toHaveBeenCalledWith(7, 42);
  });
});
