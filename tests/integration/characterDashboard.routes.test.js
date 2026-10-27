jest.mock('../../src/config/db', () => ({ execute: jest.fn() }));
jest.mock('../../src/services/child.service', () => ({ getById: jest.fn() }));

const request = require('supertest');
const { Op } = require('sequelize');
const pool = require('../../src/config/db');
const childService = require('../../src/services/child.service');
const { Character, VocabularyEntry, QuizAttempt, StoryReadLog } = require('../../src/models');
const { generateAccessToken } = require('../../src/utils/jwt');
const app = require('../../src/app');

const token = generateAccessToken({ user_id: 1, email: 'a@b.com', role: 'parent' });
const auth = (req) => req.set('Authorization', `Bearer ${token}`);
const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

beforeEach(() => {
  jest.clearAllMocks();
  childService.getById.mockResolvedValue({ child_profile_id: 7 });
});

afterEach(() => jest.restoreAllMocks());

describe('/api/characters', () => {
  beforeEach(() => {
    jest.spyOn(Character, 'findAll').mockResolvedValue([]);
    jest.spyOn(Character, 'create').mockImplementation(async (attrs) => ({ character_id: 30, ...attrs }));
  });

  describe('GET /', () => {
    test('child_profile_id가 숫자가 아니면 400', async () => {
      const res = await auth(request(app).get('/api/characters?child_profile_id=abc'));

      expect(res.status).toBe(400);
      expect(Character.findAll).not.toHaveBeenCalled();
    });

    test('child_profile_id를 숫자로 바꿔 공용 프리셋과 내 자녀 캐릭터를 조회한다', async () => {
      Character.findAll.mockResolvedValue([{ character_id: 1, type: 'PRESET' }]);

      const res = await auth(request(app).get('/api/characters?child_profile_id=7'));

      expect(res.status).toBe(200);
      expect(childService.getById).toHaveBeenCalledWith(1, 7);
      expect(Character.findAll).toHaveBeenCalledWith({
        where: { [Op.or]: [{ type: 'PRESET', child_profile_id: null }, { child_profile_id: 7 }] },
      });
      expect(res.body.data).toEqual([{ character_id: 1, type: 'PRESET' }]);
    });
  });

  describe('POST /', () => {
    test('인증 없이 호출하면 401', async () => {
      const res = await request(app).post('/api/characters').send({ child_profile_id: 7, name: '토리' });

      expect(res.status).toBe(401);
      expect(Character.create).not.toHaveBeenCalled();
    });

    test('선택값을 비우면 기본값으로 채우고 이름 앞뒤 공백을 지운다', async () => {
      const res = await auth(request(app).post('/api/characters')).send({ child_profile_id: '7', name: '  토리  ' });

      expect(res.status).toBe(201);
      expect(Character.create).toHaveBeenCalledWith({
        child_profile_id: 7,
        name: '토리',
        personality: '밝음',
        description: '',
        image_url: null,
        type: 'CUSTOM',
      });
    });

    test('imageUrl을 image_url 컬럼으로 저장한다', async () => {
      const res = await auth(request(app).post('/api/characters')).send({
        child_profile_id: 7,
        name: '토리',
        personality: '용감함',
        description: '숲에 사는 토끼',
        imageUrl: '/images/tori.png',
      });

      expect(res.status).toBe(201);
      expect(Character.create).toHaveBeenCalledWith(
        expect.objectContaining({ personality: '용감함', description: '숲에 사는 토끼', image_url: '/images/tori.png' })
      );
    });

    test.each([
      ['name이 공백뿐', { child_profile_id: 7, name: '   ' }],
      ['name이 255자 초과', { child_profile_id: 7, name: '가'.repeat(256) }],
      ['personality가 문자열이 아님', { child_profile_id: 7, name: '토리', personality: 3 }],
      ['imageUrl이 255자 초과', { child_profile_id: 7, name: '토리', imageUrl: `/images/${'a'.repeat(250)}` }],
    ])('%s이면 400', async (_name, body) => {
      const res = await auth(request(app).post('/api/characters')).send(body);

      expect(res.status).toBe(400);
      expect(Character.create).not.toHaveBeenCalled();
    });
  });
});

describe('GET /api/dashboard/:childId', () => {
  const mockCounts = ({ stories = 0, favorites = 0, reads = 0, words = 0, quiz } = {}) => {
    pool.execute
      .mockResolvedValueOnce([[{ count: stories }]])
      .mockResolvedValueOnce([[{ count: favorites }]]);
    jest.spyOn(StoryReadLog, 'count').mockResolvedValue(reads);
    jest.spyOn(VocabularyEntry, 'count').mockResolvedValue(words);
    jest.spyOn(QuizAttempt, 'findOne').mockResolvedValue(
      quiz || { totalAttempts: 0, averageScore: null, lastAttemptAt: null }
    );
  };

  test('인증 없이 호출하면 401', async () => {
    const res = await request(app).get('/api/dashboard/7');

    expect(res.status).toBe(401);
  });

  test('childId가 숫자가 아니면 400', async () => {
    const res = await auth(request(app).get('/api/dashboard/abc'));

    expect(res.status).toBe(400);
    expect(childService.getById).not.toHaveBeenCalled();
  });

  test('내 자녀가 아니면 집계하지 않고 404', async () => {
    childService.getById.mockRejectedValue(httpError(404, '자녀 프로필을 찾을 수 없습니다.'));

    const res = await auth(request(app).get('/api/dashboard/99'));

    expect(res.status).toBe(404);
    expect(pool.execute).not.toHaveBeenCalled();
  });

  test('동화·즐겨찾기·읽기·단어·퀴즈 통계를 모아 준다 (평균 점수는 소수 첫째 자리)', async () => {
    mockCounts({
      stories: 5,
      favorites: 2,
      reads: 4,
      words: 12,
      quiz: { totalAttempts: '3', averageScore: '83.3333', lastAttemptAt: '2026-10-26T09:00:00.000Z' },
    });

    const res = await auth(request(app).get('/api/dashboard/7'));

    expect(res.status).toBe(200);
    expect(childService.getById).toHaveBeenCalledWith(1, 7);
    expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('FROM stories'), [7]);
    expect(StoryReadLog.count).toHaveBeenCalledWith({ where: { child_profile_id: 7 } });
    expect(res.body.data).toEqual({
      storyCount: 5,
      favoriteStoryCount: 2,
      readStoryCount: 4,
      vocabularyCount: 12,
      quizStats: { totalAttempts: 3, averageScore: 83.3, lastAttemptAt: '2026-10-26T09:00:00.000Z' },
    });
  });

  test('퀴즈를 한 번도 안 풀었으면 0과 null로 채운다', async () => {
    mockCounts();

    const res = await auth(request(app).get('/api/dashboard/7'));

    expect(res.status).toBe(200);
    expect(res.body.data.quizStats).toEqual({ totalAttempts: 0, averageScore: 0, lastAttemptAt: null });
  });
});
