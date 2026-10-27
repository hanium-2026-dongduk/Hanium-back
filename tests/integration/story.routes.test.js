jest.mock('../../src/services/child.service', () => ({ getById: jest.fn() }));
jest.mock('../../src/services/storyGenerator', () => ({ generateStoryPipeline: jest.fn() }));
jest.mock('../../src/services/story.service', () => ({
  saveStoryWithTransaction: jest.fn(),
  getStoryDetail: jest.fn(),
}));
jest.mock('../../src/services/storyGenerationJob.service', () => ({
  enqueueStory: jest.fn(),
  getStoryGenerationJob: jest.fn(),
}));
jest.mock('../../src/services/storyLibrary.service', () => ({
  listStories: jest.fn(),
  exploreStories: jest.fn(),
  togglePublic: jest.fn(),
  deleteStory: jest.fn(),
}));
jest.mock('../../src/services/storyFavorite.service', () => ({
  addFavorite: jest.fn(),
  removeFavorite: jest.fn(),
}));
jest.mock('../../src/services/mission.service', () => ({ recordProgress: jest.fn() }));
jest.mock('../../src/services/badge.service', () => ({ evaluateQuietly: jest.fn() }));

const request = require('supertest');
const childService = require('../../src/services/child.service');
const { generateStoryPipeline } = require('../../src/services/storyGenerator');
const storyService = require('../../src/services/story.service');
const storyJobService = require('../../src/services/storyGenerationJob.service');
const storyLibraryService = require('../../src/services/storyLibrary.service');
const storyFavoriteService = require('../../src/services/storyFavorite.service');
const missionService = require('../../src/services/mission.service');
const badgeService = require('../../src/services/badge.service');
const { Character, StoryReadLog } = require('../../src/models');
const { generateAccessToken } = require('../../src/utils/jwt');
const app = require('../../src/app');

const token = generateAccessToken({ user_id: 1, email: 'a@b.com', role: 'parent' });
const auth = (req) => req.set('Authorization', `Bearer ${token}`);
const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
// 상세 조회의 읽기 기록은 응답 뒤에 이어서 처리되므로, 단언 전에 마이크로태스크를 비운다.
const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

const validBody = { childProfileId: 7, characterId: 3, background: '숲', mainEvent: '보물 찾기' };

beforeEach(() => {
  jest.clearAllMocks();
  childService.getById.mockResolvedValue({ child_profile_id: 7 });
  jest.spyOn(Character, 'findOne').mockResolvedValue({ character_id: 3, name: '토리' });
  jest.spyOn(StoryReadLog, 'findOrCreate').mockResolvedValue([{}, true]);
  generateStoryPipeline.mockResolvedValue({ title: '토리의 모험', pages: [] });
  storyService.saveStoryWithTransaction.mockResolvedValue({ storyId: 20, title: '토리의 모험', pages: [] });
});

afterEach(() => jest.restoreAllMocks());

describe('POST /api/stories', () => {
  test('인증 없이 호출하면 401', async () => {
    const res = await request(app).post('/api/stories').send(validBody);

    expect(res.status).toBe(401);
    expect(generateStoryPipeline).not.toHaveBeenCalled();
  });

  test('Idempotency-Key가 없으면 동기로 생성하고 201', async () => {
    const res = await auth(request(app).post('/api/stories')).send({ ...validBody, imageStyle: '수채화', keyword: '용기' });

    expect(res.status).toBe(201);
    expect(childService.getById).toHaveBeenCalledWith(1, 7);
    expect(generateStoryPipeline).toHaveBeenCalledWith({
      childAge: 6,
      character: { character_id: 3, name: '토리' },
      setting: { background: '숲', mainEvent: '보물 찾기' },
      imageStyle: '수채화',
      keyword: '용기',
    });
    expect(res.body.data).toMatchObject({ storyId: 20, character: '토리', setting: { background: '숲' } });
    expect(storyJobService.enqueueStory).not.toHaveBeenCalled();
  });

  test('프리셋 id로 배경·사건을 고르면 프리셋 이름으로 바꿔 생성한다', async () => {
    const res = await auth(request(app).post('/api/stories')).send({
      childProfileId: 7,
      characterId: 3,
      backgroundId: 'forest',
      mainEventId: 'friend',
    });

    expect(res.status).toBe(201);
    expect(generateStoryPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        setting: { background: '신비로운 별빛 숲', mainEvent: '길 잃은 아기 용 도와주기' },
      })
    );
  });

  test('Idempotency-Key가 있으면 작업만 접수하고 202 + Location', async () => {
    storyJobService.enqueueStory.mockResolvedValue({ jobId: 55, status: 'queued' });

    const res = await auth(request(app).post('/api/stories'))
      .set('Idempotency-Key', 'req-abc')
      .send(validBody);

    expect(res.status).toBe(202);
    expect(res.headers.location).toBe('/api/stories/generations/55');
    expect(storyJobService.enqueueStory).toHaveBeenCalledWith({
      userId: 1,
      requestId: 'req-abc',
      input: { childProfileId: 7, characterId: 3, childAge: 6, background: '숲', mainEvent: '보물 찾기' },
    });
    expect(generateStoryPipeline).not.toHaveBeenCalled();
  });

  test.each([
    ['childProfileId가 없음', { characterId: 3, background: '숲', mainEvent: '탐험' }],
    ['characterId가 없음', { childProfileId: 7, background: '숲', mainEvent: '탐험' }],
    ['배경이 없음', { childProfileId: 7, characterId: 3, mainEvent: '탐험' }],
    ['없는 프리셋 id', { childProfileId: 7, characterId: 3, backgroundId: 'moon', mainEvent: '탐험' }],
    ['배경이 255자 초과', { ...validBody, background: '가'.repeat(256) }],
    ['childAge가 범위 밖', { ...validBody, childAge: 30 }],
    ['imageStyle이 문자열이 아님', { ...validBody, imageStyle: 123 }],
    ['keyword가 500자 초과', { ...validBody, keyword: 'a'.repeat(501) }],
  ])('%s이면 400', async (_name, body) => {
    const res = await auth(request(app).post('/api/stories')).send(body);

    expect(res.status).toBe(400);
    expect(generateStoryPipeline).not.toHaveBeenCalled();
  });

  test('내 자녀가 아니면 캐릭터 조회 전에 막는다', async () => {
    childService.getById.mockRejectedValue(httpError(404, '자녀 프로필을 찾을 수 없습니다.'));

    const res = await auth(request(app).post('/api/stories')).send(validBody);

    expect(res.status).toBe(404);
    expect(Character.findOne).not.toHaveBeenCalled();
  });

  test('AI 생성이 실패하면 저장하지 않고 500(메시지는 감춤)', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    generateStoryPipeline.mockRejectedValue(new Error('이미지 생성 실패'));

    const res = await auth(request(app).post('/api/stories')).send(validBody);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(storyService.saveStoryWithTransaction).not.toHaveBeenCalled();
  });
});

describe('GET /api/stories/generations/:jobId', () => {
  test('내 계정의 작업을 조회한다', async () => {
    storyJobService.getStoryGenerationJob.mockResolvedValue({ jobId: 55, status: 'completed', storyId: 20 });

    const res = await auth(request(app).get('/api/stories/generations/55'));

    expect(res.status).toBe(200);
    expect(storyJobService.getStoryGenerationJob).toHaveBeenCalledWith(1, '55');
    expect(res.body.data.status).toBe('completed');
  });

  test('남의 작업이면 서비스의 404를 전달한다', async () => {
    storyJobService.getStoryGenerationJob.mockRejectedValue(httpError(404, '동화 생성 작업을 찾을 수 없습니다.'));

    const res = await auth(request(app).get('/api/stories/generations/56'));

    expect(res.status).toBe(404);
  });
});

describe('GET /api/stories/:id', () => {
  test.each([
    ['child_profile_id가 없음', '/api/stories/20'],
    ['child_profile_id가 숫자가 아님', '/api/stories/20?child_profile_id=abc'],
    ['동화 ID가 숫자가 아님', '/api/stories/abc?child_profile_id=7'],
  ])('%s이면 400', async (_name, url) => {
    const res = await auth(request(app).get(url));

    expect(res.status).toBe(400);
    expect(childService.getById).not.toHaveBeenCalled();
    expect(storyService.getStoryDetail).not.toHaveBeenCalled();
  });

  test('처음 읽으면 상세를 주고 story_read 미션·배지를 반영한다', async () => {
    storyService.getStoryDetail.mockResolvedValue({ storyId: 20, title: '토리의 모험', pages: [] });

    const res = await auth(request(app).get('/api/stories/20?child_profile_id=7'));
    await flushAsync();

    expect(res.status).toBe(200);
    expect(childService.getById).toHaveBeenCalledWith(1, 7);
    expect(storyService.getStoryDetail).toHaveBeenCalledWith(20, 7);
    expect(missionService.recordProgress).toHaveBeenCalledWith({
      childProfileId: 7,
      eventType: 'story_read',
      eventId: 'story_read:20:7',
    });
    expect(badgeService.evaluateQuietly).toHaveBeenCalledWith(7);
  });

  test('이미 읽은 동화면 미션을 다시 반영하지 않는다', async () => {
    storyService.getStoryDetail.mockResolvedValue({ storyId: 20 });
    StoryReadLog.findOrCreate.mockResolvedValue([{}, false]);

    const res = await auth(request(app).get('/api/stories/20?child_profile_id=7'));
    await flushAsync();

    expect(res.status).toBe(200);
    expect(missionService.recordProgress).not.toHaveBeenCalled();
  });

  test('읽기 기록이 실패해도 상세 조회는 200', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    storyService.getStoryDetail.mockResolvedValue({ storyId: 20 });
    StoryReadLog.findOrCreate.mockRejectedValue(new Error('DB 끊김'));

    const res = await auth(request(app).get('/api/stories/20?child_profile_id=7'));
    await flushAsync();

    expect(res.status).toBe(200);
    expect(missionService.recordProgress).not.toHaveBeenCalled();
  });

  test('동화가 없으면 서비스의 404를 전달하고 읽기 기록을 남기지 않는다', async () => {
    storyService.getStoryDetail.mockRejectedValue(httpError(404, '동화를 찾을 수 없습니다.'));

    const res = await auth(request(app).get('/api/stories/999?child_profile_id=7'));

    expect(res.status).toBe(404);
    expect(StoryReadLog.findOrCreate).not.toHaveBeenCalled();
  });
});

describe('GET /api/stories/explore', () => {
  test('로그인 없이 공개 동화를 조회하고 /:id로 잡히지 않는다', async () => {
    storyLibraryService.exploreStories.mockResolvedValue({ items: [], pagination: {} });

    const res = await request(app).get('/api/stories/explore');

    expect(res.status).toBe(200);
    expect(storyLibraryService.exploreStories).toHaveBeenCalledWith({ page: undefined, limit: undefined });
    expect(storyService.getStoryDetail).not.toHaveBeenCalled();
  });

  test('limit이 100을 넘으면 400', async () => {
    const res = await request(app).get('/api/stories/explore?limit=101');

    expect(res.status).toBe(400);
  });
});

describe('GET /api/stories', () => {
  test.each([
    ['child_profile_id가 없음', ''],
    ['sort가 잘못됨', '?child_profile_id=7&sort=random'],
    ['favorite이 불리언이 아님', '?child_profile_id=7&favorite=yes'],
  ])('%s이면 400', async (_name, qs) => {
    const res = await auth(request(app).get(`/api/stories${qs}`));

    expect(res.status).toBe(400);
    expect(storyLibraryService.listStories).not.toHaveBeenCalled();
  });
});

describe('PUT /api/stories/:storyId/public', () => {
  test('공개 여부를 불리언으로 넘겨 변경한다', async () => {
    storyLibraryService.togglePublic.mockResolvedValue({ storyId: 20, isPublic: true });

    const res = await auth(request(app).put('/api/stories/20/public')).send({ child_profile_id: 7, is_public: 'true' });

    expect(res.status).toBe(200);
    expect(childService.getById).toHaveBeenCalledWith(1, 7);
    expect(storyLibraryService.togglePublic).toHaveBeenCalledWith(7, 20, true);
  });

  test('is_public이 없으면 400', async () => {
    const res = await auth(request(app).put('/api/stories/20/public')).send({ child_profile_id: 7 });

    expect(res.status).toBe(400);
    expect(storyLibraryService.togglePublic).not.toHaveBeenCalled();
  });

  test('남의 동화면 서비스의 404를 전달한다', async () => {
    storyLibraryService.togglePublic.mockRejectedValue(httpError(404, '동화를 찾을 수 없습니다.'));

    const res = await auth(request(app).put('/api/stories/21/public')).send({ child_profile_id: 7, is_public: false });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/stories/:storyId', () => {
  test('내 자녀의 동화를 삭제한다', async () => {
    storyLibraryService.deleteStory.mockResolvedValue({ storyId: 20, deleted: true });

    const res = await auth(request(app).delete('/api/stories/20?child_profile_id=7'));

    expect(res.status).toBe(200);
    expect(storyLibraryService.deleteStory).toHaveBeenCalledWith(7, 20);
  });

  test('child_profile_id가 없으면 400', async () => {
    const res = await auth(request(app).delete('/api/stories/20'));

    expect(res.status).toBe(400);
    expect(storyLibraryService.deleteStory).not.toHaveBeenCalled();
  });

  test('내 자녀가 아니면 삭제하지 않는다', async () => {
    childService.getById.mockRejectedValue(httpError(404, '자녀 프로필을 찾을 수 없습니다.'));

    const res = await auth(request(app).delete('/api/stories/20?child_profile_id=99'));

    expect(res.status).toBe(404);
    expect(storyLibraryService.deleteStory).not.toHaveBeenCalled();
  });
});

describe('GET /api/story-settings/presets', () => {
  test('로그인 없이 배경·사건 프리셋을 준다', async () => {
    const res = await request(app).get('/api/story-settings/presets');

    expect(res.status).toBe(200);
    expect(res.body.data.backgrounds).toEqual(expect.arrayContaining([{ id: 'forest', name: '신비로운 별빛 숲' }]));
    expect(res.body.data.mainEvents).toHaveLength(3);
  });
});

describe('/api/favorites', () => {
  test('처음 등록하면 201, 이미 있으면 200', async () => {
    storyFavoriteService.addFavorite.mockResolvedValueOnce({ alreadyFavorited: false });
    const first = await auth(request(app).post('/api/favorites')).send({ child_profile_id: 7, story_id: 20 });
    expect(first.status).toBe(201);
    expect(storyFavoriteService.addFavorite).toHaveBeenCalledWith(1, 7, 20);

    storyFavoriteService.addFavorite.mockResolvedValueOnce({ alreadyFavorited: true });
    const again = await auth(request(app).post('/api/favorites')).send({ child_profile_id: 7, story_id: 20 });
    expect(again.status).toBe(200);
    expect(again.body.data.alreadyFavorited).toBe(true);
  });

  test('해제는 storyId를 숫자로 넘긴다', async () => {
    storyFavoriteService.removeFavorite.mockResolvedValue({ removed: true });

    const res = await auth(request(app).delete('/api/favorites/20')).send({ child_profile_id: 7 });

    expect(res.status).toBe(200);
    expect(storyFavoriteService.removeFavorite).toHaveBeenCalledWith(1, 7, 20);
  });

  test('story_id가 없으면 400', async () => {
    const res = await auth(request(app).post('/api/favorites')).send({ child_profile_id: 7 });

    expect(res.status).toBe(400);
    expect(storyFavoriteService.addFavorite).not.toHaveBeenCalled();
  });
});
