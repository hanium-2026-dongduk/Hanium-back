jest.mock('../../src/services/ai/gemini.service', () => ({ generateText: jest.fn() }));
// 실제 재시도는 backoff로 대기한다 — 횟수만 지키고 대기는 없앤다.
jest.mock('../../src/utils/geminiRetry', () => ({
  callWithRetry: async (fn, maxRetries = 3) => {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  },
}));

const { generateText } = require('../../src/services/ai/gemini.service');
const service = require('../../src/services/wordMeaning.service');

// 캐시가 모듈 전역이라 테스트마다 다른 단어를 쓴다.
describe('wordMeaning.service', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  test('Gemini 응답에서 뜻을 꺼내 반환한다', async () => {
    generateText.mockResolvedValue('{ "meaning": "사과" }');

    await expect(service.lookupMeaning('apple')).resolves.toBe('사과');
    expect(generateText.mock.calls[0][0]).toContain('"apple"');
  });

  test('코드펜스로 감싼 응답도 처리한다', async () => {
    generateText.mockResolvedValue('```json\n{ "meaning": "용감한" }\n```');

    await expect(service.lookupMeaning('brave')).resolves.toBe('용감한');
  });

  test('같은 단어는 대소문자와 무관하게 캐시에서 반환한다', async () => {
    generateText.mockResolvedValue('{ "meaning": "숲" }');

    await service.lookupMeaning('Forest');
    await expect(service.lookupMeaning('forest')).resolves.toBe('숲');
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  test('뜻이 비어 있으면 404이고, 다시 조회해도 AI를 부르지 않는다', async () => {
    generateText.mockResolvedValue('{ "meaning": "" }');

    await expect(service.lookupMeaning('asdfgh')).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.lookupMeaning('asdfgh')).rejects.toMatchObject({ statusCode: 404 });
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  test('형식이 깨진 응답은 한 번 더 받아본다', async () => {
    generateText.mockResolvedValueOnce('뜻은 강입니다').mockResolvedValueOnce('{ "meaning": "강" }');

    await expect(service.lookupMeaning('river')).resolves.toBe('강');
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  test('Gemini 호출이 계속 실패하면 502이고, 실패는 캐시하지 않는다', async () => {
    generateText.mockRejectedValue(new Error('503'));

    await expect(service.lookupMeaning('mountain')).rejects.toMatchObject({ statusCode: 502 });

    generateText.mockReset();
    generateText.mockResolvedValue('{ "meaning": "산" }');
    await expect(service.lookupMeaning('mountain')).resolves.toBe('산');
  });

  test('뜻이 컬럼 길이(255자)를 넘으면 잘라낸다', async () => {
    generateText.mockResolvedValue(JSON.stringify({ meaning: '가'.repeat(300) }));

    const meaning = await service.lookupMeaning('long');
    expect(meaning).toHaveLength(255);
  });
});
