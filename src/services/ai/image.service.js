const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 프롬프트를 받아 Gemini 이미지 모델을 통해 삽화 이미지(Buffer) 생성
 * 503(과부하) 발생 시 지수 백오프로 재시도
 * @param {string} imagePrompt
 * @param {number} maxRetries
 * @returns {Promise<Buffer>}
 */
async function generateStoryImage(imagePrompt, maxRetries = 4) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${imagePrompt}, children's book illustration style, bright soft colors, cute, vector art`,
              },
            ],
          },
        ],
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      });

      const parts = response.candidates[0].content.parts;
      const imagePart = parts.find((p) => p.inlineData);

      if (!imagePart) {
        throw new Error('응답에 이미지 데이터가 없습니다');
      }

      return Buffer.from(imagePart.inlineData.data, 'base64');
    } catch (error) {
      const isOverloaded = error?.message?.includes('UNAVAILABLE') || error?.status === 503;
      const isLastAttempt = attempt === maxRetries;

      if (isOverloaded && !isLastAttempt) {
        const delay = 1000 * 2 ** attempt; // 1s, 2s, 4s, 8s...
        console.warn(`[Gemini Image API] 과부하, ${delay}ms 후 재시도 (${attempt + 1}/${maxRetries})`);
        await sleep(delay);
        continue;
      }

      console.error('[Gemini Image API Error]:', error);
      throw new Error('이미지 생성 실패');
    }
  }
}

module.exports = { generateStoryImage };