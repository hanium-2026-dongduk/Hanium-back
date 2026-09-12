jest.mock('../../src/config/db', () => ({ execute: jest.fn() }));
jest.mock('../../src/services/child.service', () => ({ getById: jest.fn() }));

const pool = require('../../src/config/db');
const childService = require('../../src/services/child.service');
const quizQueryService = require('../../src/services/quizQuery.service');

describe('quizQuery.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    childService.getById.mockResolvedValue({ child_profile_id: 3 });
  });

  test('소유한 퀴즈의 문제와 보기를 순서대로 묶고 정답은 노출하지 않는다', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ quiz_set_id: 7, status: 'ready' }]])
      .mockResolvedValueOnce([[
        {
          quiz_question_id: 11,
          question_order: 1,
          question_text: '누가 주인공인가요?',
          quiz_option_id: 101,
          option_order: 1,
          option_text: '토끼',
        },
        {
          quiz_question_id: 11,
          question_order: 1,
          question_text: '누가 주인공인가요?',
          quiz_option_id: 102,
          option_order: 2,
          option_text: '거북이',
        },
      ]]);

    const result = await quizQueryService.getQuiz(1, 3, 7);

    expect(childService.getById).toHaveBeenCalledWith(1, 3);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].options).toEqual([
      { optionId: 101, optionOrder: 1, optionText: '토끼' },
      { optionId: 102, optionOrder: 2, optionText: '거북이' },
    ]);
    expect(JSON.stringify(result)).not.toContain('is_correct');
  });

  test('자녀 소유가 아닌 퀴즈는 404', async () => {
    pool.execute.mockResolvedValueOnce([[]]);

    await expect(quizQueryService.getQuiz(1, 3, 999)).rejects.toMatchObject({ statusCode: 404 });
    expect(pool.execute).toHaveBeenCalledTimes(1);
  });
});
