const googleTTS = require('google-tts-api');
const axios = require('axios');

/**
 * google-tts-api를 활용한 완전 무료 TTS 음성 생성 함수
 * @param {string} text - 음성으로 변환할 동화 텍스트
 * @param {Object} options - 옵션 (lang: 언어, speed: 재생 속도)
 * @returns {Promise<string>} - audio/mp3 Base64 Data URL
 */
async function generateSpeech(text, options = {}) {
  try {
    const { lang = 'ko', speed = 1.0 } = options;

    // 1. 무료 Google Translate TTS MP3 URL 생성
    const audioUrl = googleTTS.getAudioUrl(text, {
      lang: lang,
      slow: speed < 1.0,
      host: 'https://translate.google.com',
      timeout: 10000,
    });

    // 2. MP3 오디오 데이터 다운로드
    const response = await axios.get(audioUrl, {
      responseType: 'arraybuffer',
    });

    // 3. Base64 Data URL 형태로 변환
    const base64Audio = Buffer.from(response.data).toString('base64');
    return `data:audio/mp3;base64,${base64Audio}`;
  } catch (error) {
    console.error('TTS API Error:', error.message);
    throw new Error('무료 TTS 음성 생성 실패');
  }
}

module.exports = {
  generateSpeech,
};