jest.mock('../../src/services/child.service');
jest.mock('../../src/services/storyLibrary.service');
jest.mock('../../src/services/quizAttempt.service');
jest.mock('../../src/services/storyGenerator');
jest.mock('../../src/services/quizGeneration.service');

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { Op } = require('sequelize');
const { generateAccessToken } = require('../../src/utils/jwt');
const childService = require('../../src/services/child.service');
const storyLibraryService = require('../../src/services/storyLibrary.service');
const quizAttemptService = require('../../src/services/quizAttempt.service');
const { Character } = require('../../src/models');
const app = require('../../src/app');

const token = generateAccessToken({ user_id: 7, email: 'parent@example.com', role: 'parent' });
const auth = (req) => req.set('Authorization', `Bearer ${token}`);

beforeEach(() => {
  jest.spyOn(Character, 'findAll').mockResolvedValue([]);
  jest.spyOn(Character, 'findOne').mockResolvedValue(null);
  jest.spyOn(Character, 'create').mockImplementation(async (attrs) => attrs);
  childService.getById.mockResolvedValue({ child_profile_id: 11, user_id: 7 });
  storyLibraryService.listStories.mockResolvedValue({ items: [], pagination: {} });
  storyLibraryService.exploreStories.mockResolvedValue({ items: [], pagination: {} });
  quizAttemptService.listAttempts.mockResolvedValue({ items: [], pagination: {} });
});

afterEach(() => jest.restoreAllMocks());

test('생성된 이미지·음성 파일을 반환 URL에서 서빙한다', async () => {
  const fileName = `static-smoke-${process.pid}-${Date.now()}.txt`;
  const files = ['images', 'audio'].map((folder) => path.join(__dirname, '../../public', folder, fileName));
  try {
    for (const file of files) fs.writeFileSync(file, 'generated-media');
    for (const folder of ['images', 'audio']) {
      const result = await request(app).get(`/${folder}/${fileName}`);
      expect(result.status).toBe(200);
      expect(result.text).toBe('generated-media');
    }
  } finally {
    for (const file of files) fs.rmSync(file, { force: true });
  }
});

test('캐릭터 목록과 생성은 인증 및 자녀 소유권을 요구한다', async () => {
  expect((await request(app).get('/api/characters?child_profile_id=11')).status).toBe(401);
  expect((await auth(request(app).get('/api/characters'))).status).toBe(400);
  expect((await auth(request(app).post('/api/characters').send({ name: '토리' }))).status).toBe(400);

  childService.getById.mockRejectedValueOnce(Object.assign(new Error('자녀 프로필을 찾을 수 없습니다.'), { statusCode: 404 }));
  expect((await auth(request(app).get('/api/characters?child_profile_id=12'))).status).toBe(404);
  expect(Character.findAll).not.toHaveBeenCalled();
});

test('공용 프리셋과 선택한 자녀의 캐릭터만 조회하고 새 캐릭터는 항상 CUSTOM이다', async () => {
  const list = await auth(request(app).get('/api/characters?child_profile_id=11'));
  expect(list.status).toBe(200);
  expect(Character.findAll).toHaveBeenCalledWith({
    where: { [Op.or]: [{ type: 'PRESET', child_profile_id: null }, { child_profile_id: 11 }] },
  });

  const created = await auth(request(app).post('/api/characters').send({
    child_profile_id: 11, name: '토리', type: 'PRESET',
  }));
  expect(created.status).toBe(201);
  expect(Character.create).toHaveBeenCalledWith(expect.objectContaining({
    child_profile_id: 11, name: '토리', type: 'CUSTOM',
  }));
});

test('다른 자녀의 캐릭터는 동화 생성에 사용할 수 없다', async () => {
  const result = await auth(request(app).post('/api/stories').send({
    childProfileId: 11, characterId: 99, background: '숲', mainEvent: '탐험',
  }));
  expect(result.status).toBe(404);
  expect(Character.findOne).toHaveBeenCalledWith({
    where: {
      character_id: 99,
      [Op.or]: [{ type: 'PRESET', child_profile_id: null }, { child_profile_id: 11 }],
    },
  });
});

test('동화·퀴즈 목록 페이지 값은 숫자로, favorite=false는 거짓으로 전달한다', async () => {
  const stories = await auth(request(app).get('/api/stories?child_profile_id=11&page=2&limit=5&favorite=false'));
  expect(stories.status).toBe(200);
  expect(storyLibraryService.listStories).toHaveBeenCalledWith('11', {
    sort: undefined, favoriteOnly: false, page: 2, limit: 5,
  });

  const favorites = await auth(request(app).get('/api/stories?child_profile_id=11&favorite=true'));
  expect(favorites.status).toBe(200);
  expect(storyLibraryService.listStories).toHaveBeenLastCalledWith('11', {
    sort: undefined, favoriteOnly: true, page: undefined, limit: undefined,
  });

  const explore = await request(app).get('/api/stories/explore?page=2&limit=5');
  expect(explore.status).toBe(200);
  expect(storyLibraryService.exploreStories).toHaveBeenCalledWith({ page: 2, limit: 5 });

  const attempts = await auth(request(app).get('/api/quizzes/attempts?child_profile_id=11&page=2&limit=5'));
  expect(attempts.status).toBe(200);
  expect(quizAttemptService.listAttempts).toHaveBeenCalledWith(7, '11', { page: 2, limit: 5 });
});
