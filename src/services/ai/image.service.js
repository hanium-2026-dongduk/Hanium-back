const axios = require('axios');

/**
 * Pollinations.ai를 이용한 무료 이미지 생성 함수
 * @param {string} prompt - 장면 묘사 프롬프트
 * @returns {Promise<string>} - Base64 Data URL
 */
async function generateImage(prompt) {
  try {
    // 특수문자 안전하게 인코딩 (영어 프롬프트)
    const cleanPrompt = prompt.replace(/[^a-zA-Z0-9\s]/g, '');
    const enhancedPrompt = encodeURIComponent(
      `children storybook illustration, digital art, vibrant colors, ${cleanPrompt}`
    );

    // Pollinations 기본 model 사용 (안정성 강화)
    const imageUrl = `https://image.pollinations.ai/prompt/${enhancedPrompt}?width=512&height=512&nologo=true`;

    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0', // 서버 블락 방지 헤더 추가
      },
      timeout: 15000, // 15초 타임아웃
    });

    // 받은 응답 데이터 타입 검증
    const buffer = Buffer.from(response.data);
    
    // 만약 이미지 대신 에러 텍스트가 왔는지 확인
    const headerString = buffer.toString('utf8', 0, 100);
    if (headerString.includes('<!DOCTYPE html>') || headerString.includes('{"error"')) {
      console.error('API 응답 내용:', headerString);
      throw new Error('API에서 이미지 대신 에러 페이지를 반환했습니다.');
    }

    const base64Image = buffer.toString('base64');
    return `data:image/jpeg;base64,${base64Image}`;
  } catch (error) {
    console.error('Pollinations API Error:', error.message);
    throw new Error('AI 이미지 생성 실패');
  }
}

module.exports = {
  generateImage,
};