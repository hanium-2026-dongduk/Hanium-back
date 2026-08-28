const { GoogleGenAI } = require('@google/genai');
const { callWithRetry } = require('../../utils/geminiRetry');

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error('❌ [Gemini Error] GEMINI_API_KEY가 .env 파일에 설정되지 않았습니다.');
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * 프롬프트를 받아 Gemini를 통해 스토리 텍스트 생성.
 * 503/네트워크 등 일시적 실패는 callWithRetry가 최대 3회 재시도(500ms/1s/2s)한다.
 * @param {string} prompt - 스토리 주제 또는 지시사항
 * @returns {Promise<string>} 생성된 텍스트
 */
async function generateStoryText(prompt) {
  try {
    return await callWithRetry(async () => {
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          temperature: 0.7,
        },
      });

      return response.text;
    });
  } catch (error) {
    console.error('[Gemini API Error]:', error);
    throw new Error('스토리 텍스트 생성 실패');
  }
}

module.exports = { generateStoryText };