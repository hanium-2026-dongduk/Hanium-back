const mockGenerateContent = jest.fn();
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn(() => ({ models: { generateContent: mockGenerateContent } })),
}));
jest.mock('../../src/config/db', () => ({ execute: jest.fn() }));
jest.mock('../../src/models', () => ({
  QuizSet: { findOrCreate: jest.fn() },
  QuizQuestion: { findAll: jest.fn(), destroy: jest.fn(), create: jest.fn() },
  QuizOption: { destroy: jest.fn(), create: jest.fn() },
  VocabularyEntry: { findAll: jest.fn() },
  sequelize: { transaction: jest.fn((cb) => cb({})) },
}));

const pool = require('../../src/config/db');
const { QuizSet, QuizQuestion, QuizOption } = require('../../src/models');
const service = require('../../src/services/quizGeneration.service');

const options = (correctIndex, isCorrect = (i) => i === correctIndex) =>
  [0, 1, 2, 3].map((i) => ({ text: `보기${i + 1}`, isCorrect: isCorrect(i) }));
const quizJson = (questions) => JSON.stringify({ questions });
const oneQuestion = [{ questionText: '토토는 무엇을 찾았나요?', options: options(1) }];

let quizSet;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  pool.execute
    .mockResolvedValueOnce([[{ story_id: 3 }]])
    .mockResolvedValueOnce([[{ content: 'A brave rabbit named Toto found a magic carrot.' }]]);
  quizSet = { quiz_set_id: 11, status: 'pending', save: jest.fn() };
  QuizSet.findOrCreate.mockResolvedValue([quizSet, true]);
  QuizQuestion.findAll.mockResolvedValue([]);
  QuizQuestion.create.mockImplementation(async (attrs) => ({ quiz_question_id: attrs.question_order, ...attrs }));
});

describe('quizGeneration.service generateFromStory', () => {
  test('JSON 모드와 응답 스키마를 지정해 Gemini를 호출한다', async () => {
    mockGenerateContent.mockResolvedValue({ text: quizJson(oneQuestion) });

    await service.generateFromStory(7, 3);

    const { config } = mockGenerateContent.mock.calls[0][0];
    expect(config.responseMimeType).toBe('application/json');
    expect(config.responseJsonSchema.properties.questions.items.properties.options).toMatchObject({
      minItems: 4,
      maxItems: 4,
    });
  });

  test('앞뒤에 설명 문장이 붙어도 JSON만 잘라 저장한다', async () => {
    mockGenerateContent.mockResolvedValue({
      text: `퀴즈입니다!\n\`\`\`json\n${quizJson(oneQuestion)}\n\`\`\`\n도움이 되길 바라요.`,
    });

    const result = await service.generateFromStory(7, 3);

    expect(result).toEqual({ quizSetId: 11, status: 'ready', questionCount: 1 });
    expect(QuizOption.create).toHaveBeenCalledTimes(4);
    expect(quizSet.status).toBe('ready');
  });

  test('isCorrect가 "true" 문자열이어도 정답 1개로 인정한다', async () => {
    const stringBooleans = [
      { questionText: '질문', options: options(2).map((o) => ({ ...o, isCorrect: String(o.isCorrect) })) },
    ];
    mockGenerateContent.mockResolvedValue({ text: quizJson(stringBooleans) });

    await service.generateFromStory(7, 3);

    const saved = QuizOption.create.mock.calls.map(([attrs]) => attrs.is_correct);
    expect(saved).toEqual([false, false, true, false]);
  });

  test('형식이 틀린 응답은 재시도하고, 다음 시도가 맞으면 성공한다', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({ text: quizJson([{ questionText: '질문', options: options(-1) }]) }) // 정답 0개
      .mockResolvedValueOnce({ text: quizJson(oneQuestion) });

    const result = await service.generateFromStory(7, 3);

    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledWith(
      '[quizGeneration] Gemini 시도 1/3 실패:',
      expect.stringContaining('정답이 정확히 1개가 아닙니다')
    );
    expect(result.status).toBe('ready');
  });

  test('3번 모두 실패하면 quiz_set을 failed로 두고 502', async () => {
    mockGenerateContent.mockResolvedValue({ text: undefined });

    await expect(service.generateFromStory(7, 3)).rejects.toMatchObject({ statusCode: 502 });

    expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    expect(quizSet.status).toBe('failed');
    expect(quizSet.save).toHaveBeenCalled();
    expect(QuizQuestion.create).not.toHaveBeenCalled();
  });
});
