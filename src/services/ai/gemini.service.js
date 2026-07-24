const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

// GoogleGenAI 인스턴스 생성 (환경변수의 GEMINI_API_KEY를 자동 감지)
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

/**
 * 프롬프트를 받아 Gemini 모델로부터 텍스트 응답을 가져오는 함수
 * @param {string} prompt - AI에게 전달할 프롬프트
 * @returns {Promise<string>} - AI 응답 텍스트
 */
async function generateText(prompt) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
    });

    return response.text;
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw new Error('AI 텍스트 생성 실패');
  }
}

module.exports = {
  generateText,
};