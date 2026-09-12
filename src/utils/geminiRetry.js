/**
 * Gemini API 호출 공용 재시도 유틸. 503/429/네트워크 에러 등으로 인한 일시적 실패를
 * exponential backoff(500ms, 1s, 2s)로 재시도한다.
 *
 * quizGeneration.service.js(Week3 금)에서 만든 패턴을 공용화 — story 생성 파이프라인도
 * 동일한 재시도가 필요해 새로 만들지 않고 재사용한다.
 *
 * @param {() => Promise<T>} fn - Gemini 호출 + (선택) 파싱/검증까지 포함한 함수
 * @param {number} [maxRetries=3]
 * @returns {Promise<T>}
 * @template T
 */
async function callWithRetry(fn, maxRetries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1))); // 500ms, 1s, 2s
      }
    }
  }
  throw lastError;
}

module.exports = { callWithRetry };