jest.mock('../../src/models', () => ({
  QuizAttempt: { create: jest.fn(), findAndCountAll: jest.fn(), findByPk: jest.fn() },
  QuizQuestion: { findAll: jest.fn() },
  QuizOption: {},
}));
jest.mock('../../src/services/child.service', () => ({
  getById: jest.fn(),
}));
jest.mock('../../src/services/reward.service', () => ({
  addPoints: jest.fn(),
}));
jest.mock('../../src/services/mission.service', () => ({
  recordProgress: jest.fn(),
}));
jest.mock('../../src/utils/dbRetry', () => ({
  withTransaction: (t, fn) => fn(t || {}),
}));

const { QuizAttempt, QuizQuestion } = require('../../src/models');
const childService = require('../../src/services/child.service');
const rewardService = require('../../src/services/reward.service');
const missionService = require('../../src/services/mission.service');
const quizAttemptService = require('../../src/services/quizAttempt.service');

describe('quizAttempt.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    childService.getById.mockResolvedValue({ child_profile_id: 1 });
  });

  describe('submitAttempt', () => {
    const mockQuestions = [
      {
        quiz_question_id: 1,
        QuizOptions: [
          { quiz_option_id: 10, is_correct: true },
          { quiz_option_id: 11, is_correct: false },
        ],
      },
      {
        quiz_question_id: 2,
        QuizOptions: [
          { quiz_option_id: 20, is_correct: false },
          { quiz_option_id: 21, is_correct: true },
        ],
      },
    ];

    it('정답 개수에 비례해 포인트를 지급하고 채점 결과를 반환한다', async () => {
      QuizQuestion.findAll.mockResolvedValue(mockQuestions);
      QuizAttempt.create.mockResolvedValue({ quiz_attempt_id: 100 });
      rewardService.addPoints.mockResolvedValue({ pointsAdded: 5, leveledUp: false });
      missionService.recordProgress.mockResolvedValue({});

      const result = await quizAttemptService.submitAttempt({
        userId: 1,
        childProfileId: 1,
        quizSetId: 5,
        answers: [
          { questionId: 1, selectedOptionId: 10 },
          { questionId: 2, selectedOptionId: 20 },
        ],
      });

      expect(result.correctCount).toBe(1);
      expect(result.totalQuestions).toBe(2);
      expect(result.score).toBe(50);
      expect(rewardService.addPoints).toHaveBeenCalledWith(
        expect.objectContaining({
          childProfileId: 1,
          points: 5,
          reason: 'quiz_answered',
          idempotencyKey: 'quiz_attempt:100',
        })
      );
      expect(missionService.recordProgress).toHaveBeenCalledWith(
        expect.objectContaining({ childProfileId: 1, eventType: 'quiz_answered' })
      );
    });

    it('전부 오답이면 포인트를 지급하지 않는다', async () => {
      QuizQuestion.findAll.mockResolvedValue(mockQuestions);
      QuizAttempt.create.mockResolvedValue({ quiz_attempt_id: 101 });
      missionService.recordProgress.mockResolvedValue({});

      const result = await quizAttemptService.submitAttempt({
        userId: 1,
        childProfileId: 1,
        quizSetId: 5,
        answers: [
          { questionId: 1, selectedOptionId: 11 },
          { questionId: 2, selectedOptionId: 20 },
        ],
      });

      expect(result.correctCount).toBe(0);
      expect(rewardService.addPoints).not.toHaveBeenCalled();
    });

    it('퀴즈가 존재하지 않으면 404를 던진다', async () => {
      QuizQuestion.findAll.mockResolvedValue([]);

      await expect(
        quizAttemptService.submitAttempt({ userId: 1, childProfileId: 1, quizSetId: 999, answers: [] })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('클라이언트가 selectedOptionId를 보내지 않은 문항은 오답 처리된다', async () => {
      QuizQuestion.findAll.mockResolvedValue(mockQuestions);
      QuizAttempt.create.mockResolvedValue({ quiz_attempt_id: 102 });
      missionService.recordProgress.mockResolvedValue({});

      const result = await quizAttemptService.submitAttempt({
        userId: 1,
        childProfileId: 1,
        quizSetId: 5,
        answers: [{ questionId: 1, selectedOptionId: 10 }],
      });

      expect(result.correctCount).toBe(1);
      expect(result.answers[1].isCorrect).toBe(false);
      expect(result.answers[1].selectedOptionId).toBeNull();
    });
  });

  describe('getAttemptDetail', () => {
    it('존재하지 않는 attemptId면 404를 던진다', async () => {
      QuizAttempt.findByPk.mockResolvedValue(null);

      await expect(quizAttemptService.getAttemptDetail(1, 999)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('다른 유저의 attempt면 child 소유권 검증에서 걸린다', async () => {
      QuizAttempt.findByPk.mockResolvedValue({ child_profile_id: 2 });
      childService.getById.mockRejectedValue(Object.assign(new Error('not found'), { statusCode: 404 }));

      await expect(quizAttemptService.getAttemptDetail(1, 1)).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});