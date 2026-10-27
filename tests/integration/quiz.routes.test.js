jest.mock('../../src/services/child.service', () => ({ getById: jest.fn() }));
jest.mock('../../src/services/quizGeneration.service', () => ({
  generateFromStory: jest.fn(),
  generateFromVocabulary: jest.fn(),
}));
jest.mock('../../src/services/quizAttempt.service', () => ({
  submitAttempt: jest.fn(),
  listAttempts: jest.fn(),
  getAttemptDetail: jest.fn(),
}));
jest.mock('../../src/services/quizQuery.service', () => ({
  getQuiz: jest.fn(),
  getQuizByStory: jest.fn(),
}));

const request = require('supertest');
const childService = require('../../src/services/child.service');
const quizGenerationService = require('../../src/services/quizGeneration.service');
const quizAttemptService = require('../../src/services/quizAttempt.service');
const quizQueryService = require('../../src/services/quizQuery.service');
const { generateAccessToken } = require('../../src/utils/jwt');
const app = require('../../src/app');

const token = generateAccessToken({ user_id: 1, email: 'a@b.com', role: 'parent' });
const auth = (req) => req.set('Authorization', `Bearer ${token}`);
const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

beforeEach(() => {
  jest.clearAllMocks();
  childService.getById.mockResolvedValue({ child_profile_id: 7 });
});

describe('/api/quizzes', () => {
  describe('POST /generate', () => {
    test('인증 없이 호출하면 401', async () => {
      const res = await request(app).post('/api/quizzes/generate').send({ child_profile_id: 7, story_id: 3 });

      expect(res.status).toBe(401);
      expect(quizGenerationService.generateFromStory).not.toHaveBeenCalled();
    });

    test('source_type 없이 부르면 동화 기반으로 생성하고 201', async () => {
      quizGenerationService.generateFromStory.mockResolvedValue({ quizSetId: 11, status: 'ready', questionCount: 5 });

      const res = await auth(request(app).post('/api/quizzes/generate')).send({ child_profile_id: 7, story_id: 3 });

      expect(res.status).toBe(201);
      expect(childService.getById).toHaveBeenCalledWith(1, 7);
      expect(quizGenerationService.generateFromStory).toHaveBeenCalledWith(7, 3);
      expect(res.body.data).toEqual({ quizSetId: 11, status: 'ready', questionCount: 5 });
    });

    test('vocabulary는 story_id 없이도 생성한다', async () => {
      quizGenerationService.generateFromVocabulary.mockResolvedValue({ quizSetId: 12, status: 'ready', questionCount: 4 });

      const res = await auth(request(app).post('/api/quizzes/generate')).send({
        child_profile_id: 7,
        source_type: 'vocabulary',
      });

      expect(res.status).toBe(201);
      expect(quizGenerationService.generateFromVocabulary).toHaveBeenCalledWith(7, { storyId: undefined });
      expect(quizGenerationService.generateFromStory).not.toHaveBeenCalled();
    });

    test.each([
      ['child_profile_id가 없음', { story_id: 3 }],
      ['source_type이 잘못됨', { child_profile_id: 7, story_id: 3, source_type: 'movie' }],
      ['story 기반인데 story_id가 없음', { child_profile_id: 7 }],
    ])('%s이면 400', async (_name, body) => {
      const res = await auth(request(app).post('/api/quizzes/generate')).send(body);

      expect(res.status).toBe(400);
      expect(quizGenerationService.generateFromStory).not.toHaveBeenCalled();
    });

    test('내 자녀가 아니면 생성하지 않는다', async () => {
      childService.getById.mockRejectedValue(httpError(404, '자녀 프로필을 찾을 수 없습니다.'));

      const res = await auth(request(app).post('/api/quizzes/generate')).send({ child_profile_id: 99, story_id: 3 });

      expect(res.status).toBe(404);
      expect(quizGenerationService.generateFromStory).not.toHaveBeenCalled();
    });

    test('Gemini 실패(502)를 공통 봉투로 전달한다', async () => {
      quizGenerationService.generateFromStory.mockRejectedValue(
        httpError(502, '퀴즈 생성에 실패했습니다. 다시 시도해주세요.')
      );

      const res = await auth(request(app).post('/api/quizzes/generate')).send({ child_profile_id: 7, story_id: 3 });

      expect(res.status).toBe(502);
      expect(res.body).toMatchObject({ success: false, message: '퀴즈 생성에 실패했습니다. 다시 시도해주세요.' });
    });
  });

  describe('GET /:quizSetId', () => {
    test('child_profile_id를 숫자로 넘겨 조회한다', async () => {
      quizQueryService.getQuiz.mockResolvedValue({ quizSetId: 11, status: 'ready', questions: [] });

      const res = await auth(request(app).get('/api/quizzes/11?child_profile_id=7'));

      expect(res.status).toBe(200);
      expect(quizQueryService.getQuiz).toHaveBeenCalledWith(1, 7, 11);
    });

    test('child_profile_id가 없으면 400', async () => {
      const res = await auth(request(app).get('/api/quizzes/11'));

      expect(res.status).toBe(400);
      expect(quizQueryService.getQuiz).not.toHaveBeenCalled();
    });
  });

  describe('GET /by-story/:storyId', () => {
    test('/:quizSetId보다 먼저 매칭돼 동화 기준으로 조회한다', async () => {
      quizQueryService.getQuizByStory.mockResolvedValue({ quizSetId: 11 });

      const res = await auth(request(app).get('/api/quizzes/by-story/3?child_profile_id=7'));

      expect(res.status).toBe(200);
      expect(quizQueryService.getQuizByStory).toHaveBeenCalledWith(1, 7, 3);
      expect(quizQueryService.getQuiz).not.toHaveBeenCalled();
    });
  });

  describe('POST /:quizSetId/submit', () => {
    test('답안을 채점해 201', async () => {
      quizAttemptService.submitAttempt.mockResolvedValue({ attemptId: 5, score: 4 });
      const answers = [{ questionId: 1, selectedOptionId: 2 }];

      const res = await auth(request(app).post('/api/quizzes/11/submit')).send({ child_profile_id: 7, answers });

      expect(res.status).toBe(201);
      expect(quizAttemptService.submitAttempt).toHaveBeenCalledWith({
        userId: 1,
        childProfileId: 7,
        quizSetId: 11,
        answers,
      });
    });

    test.each([
      ['answers가 빈 배열', { child_profile_id: 7, answers: [] }],
      ['selectedOptionId가 없음', { child_profile_id: 7, answers: [{ questionId: 1 }] }],
    ])('%s이면 400', async (_name, body) => {
      const res = await auth(request(app).post('/api/quizzes/11/submit')).send(body);

      expect(res.status).toBe(400);
      expect(quizAttemptService.submitAttempt).not.toHaveBeenCalled();
    });
  });

  describe('GET /attempts', () => {
    test('/:quizSetId로 잡히지 않고 풀이 기록을 조회한다', async () => {
      quizAttemptService.listAttempts.mockResolvedValue({ items: [], pagination: {} });

      const res = await auth(request(app).get('/api/quizzes/attempts?child_profile_id=7&page=2&limit=10'));

      expect(res.status).toBe(200);
      expect(quizAttemptService.listAttempts).toHaveBeenCalledWith(1, 7, { page: 2, limit: 10 });
      expect(quizQueryService.getQuiz).not.toHaveBeenCalled();
    });

    test('limit이 100을 넘으면 400', async () => {
      const res = await auth(request(app).get('/api/quizzes/attempts?child_profile_id=7&limit=101'));

      expect(res.status).toBe(400);
    });
  });

  describe('GET /attempts/:attemptId/detail', () => {
    test('남의 풀이면 서비스의 404를 전달한다', async () => {
      quizAttemptService.getAttemptDetail.mockRejectedValue(httpError(404, '풀이 기록을 찾을 수 없습니다.'));

      const res = await auth(request(app).get('/api/quizzes/attempts/5/detail'));

      expect(res.status).toBe(404);
      expect(quizAttemptService.getAttemptDetail).toHaveBeenCalledWith(1, 5);
    });
  });
});
