async function retryWithBackoff(fn, { retries = 4, baseDelay = 1000, maxDelay = 10000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = error?.status || error?.error?.code;
      const causeCode = error?.cause?.code || error?.code;

      const isRetryable =
        status === 503 ||
        status === 429 ||
        causeCode === 'UND_ERR_HEADERS_TIMEOUT' ||
        causeCode === 'UND_ERR_CONNECT_TIMEOUT' ||
        causeCode === 'UND_ERR_SOCKET' ||
        causeCode === 'ECONNRESET' ||
        error?.message?.includes('fetch failed') ||
        error?.message?.includes('UNAVAILABLE');

      if (!isRetryable || attempt === retries) {
        throw error;
      }
      const delay = Math.min(baseDelay * 2 ** attempt, maxDelay) + Math.random() * 500;
      console.warn(`  ⚠️ ${status || causeCode || 'network'} 에러, ${Math.round(delay)}ms 후 재시도 (${attempt + 1}/${retries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

module.exports = { retryWithBackoff };