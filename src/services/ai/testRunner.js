require('dotenv').config();
const fs = require('fs');

// 실제 파일명(.service.js)에 맞게 수정
const { generateStoryText } = require('./gemini.service');
const { generateStoryImage } = require('./image.service');
const { generateAudio } = require('./tts.service');

async function runTest() {
  console.log('🚀 AI 모듈 통합 테스트 시작...\n');

  try {
    // 1. 텍스트 생성 테스트
    console.log('1. Gemini 텍스트 생성 중...');
    const textPrompt = 'Write a 2-sentence story about a little brave rabbit named Toto in English.';
    const storyText = await generateStoryText(textPrompt);
    console.log('생성된 텍스트:\n', storyText, '\n');

    // 2. 이미지 생성 테스트
    console.log('2. Imagen 이미지 생성 중...');
    const imagePrompt = 'A cute little rabbit wearing a small blue backpack in a green forest';
    const imageBuffer = await generateStoryImage(imagePrompt);
    fs.writeFileSync('./test-output.jpg', imageBuffer);
    console.log('📸 test-output.jpg 저장 완료!\n');

    // 3. TTS 음성 생성 테스트
    console.log('3. Google TTS 음성 생성 중...');
    const audioBuffer = await generateAudio(storyText);
    fs.writeFileSync('./test-output.wav', audioBuffer);
    console.log('🔊 test-output.mp3 저장 완료!\n');

    console.log('✅ 모든 AI 연동 모듈 테스트 성공!');
  } catch (err) {
    console.error('❌ 테스트 중 에러 발생:', err.message);
  }
}

runTest();