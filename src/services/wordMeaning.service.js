const { generateText } = require('./ai/gemini.service');
const { callWithRetry } = require('../utils/geminiRetry');

// vocabulary_entries.korean_meaning 컬럼 길이. 조회 결과를 그대로 저장 API에 넘길 수 있어야 한다.
const MAX_MEANING_LENGTH = 255;

// 아이가 단어를 누르고 기다리는 화면이라 동화 생성(3회)보다 재시도를 줄여 대기 시간을 짧게 잡는다.
const MAX_RETRIES = 2;

/**
 * 단어 → 뜻 캐시. 같은 동화를 여러 아이가 읽으면 같은 단어가 반복 조회되므로,
 * 한 번 받은 뜻은 프로세스가 살아있는 동안 재사용해 Gemini 호출과 대기 시간을 줄인다.
 * 뜻이 없는 단어('')도 캐시한다 — 같은 오타로 매번 AI를 호출하지 않기 위해서다.
 * 프로세스 메모리에만 두므로 재시작하면 비워지고, PM2 워커끼리는 공유되지 않는다.
 */
const MAX_CACHE_SIZE = 2000;
const cache = new Map();

function remember(key, meaning) {
  // Map은 삽입 순서를 유지한다 — 가득 차면 가장 오래된 항목부터 버린다.
  if (cache.size >= MAX_CACHE_SIZE) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, meaning);
}

function buildPrompt(word) {
  return `영어 단어 "${word}"의 한국어 뜻을 어린이가 이해하기 쉽게 알려줘.
가장 흔히 쓰이는 뜻 1~2개만, 쉼표로 구분한 짧은 표현으로 써. 설명 문장이나 예문은 쓰지 마.
아래 JSON 형식으로만 응답해. 다른 텍스트나 마크다운 코드펜스는 절대 포함하지 마.

{ "meaning": "사과" }

영어 단어가 아니거나 뜻을 알 수 없으면 { "meaning": "" } 로 응답해.`;
}

function stripCodeFence(text) {
  return text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
}

function parseMeaning(text) {
  const parsed = JSON.parse(stripCodeFence(text));
  if (!parsed || typeof parsed.meaning !== 'string') {
    throw new Error('meaning 필드가 없습니다.');
  }
  return parsed.meaning.trim().slice(0, MAX_MEANING_LENGTH);
}

/**
 * 영어 단어의 한국어 뜻을 조회한다.
 * @param {string} word - 컨트롤러에서 검증·정리된 영어 단어
 * @returns {Promise<string>} 한국어 뜻
 */
async function lookupMeaning(word) {
  const key = word.toLowerCase();

  let meaning = cache.get(key);
  if (meaning === undefined) {
    try {
      // 파싱까지 재시도 범위에 넣는다 — 형식이 깨진 응답도 다시 받아본다.
      meaning = await callWithRetry(
        async () => parseMeaning(await generateText(buildPrompt(word))),
        MAX_RETRIES
      );
    } catch (err) {
      console.error('[Word Meaning Error]:', err);
      const error = new Error('단어 뜻을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
      error.statusCode = 502;
      throw error;
    }
    remember(key, meaning);
  }

  if (!meaning) {
    const error = new Error('단어 뜻을 찾을 수 없습니다.');
    error.statusCode = 404;
    throw error;
  }
  return meaning;
}

module.exports = { lookupMeaning };
