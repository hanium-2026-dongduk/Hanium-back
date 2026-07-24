const fs = require('fs');
const path = require('path');
const { generateSpeech } = require('./tts.service');
//console.log('불러온 모듈 내용:', generateSpeech);

async function runTest() {
  console.log('🔊 무료 TTS 음성 생성 테스트 시작...');
  try {
    // 영문 동화 예시 텍스트
    const sampleText = 'Once upon a time, a cute little rabbit lived in a magical forest.';
    
    // 영어 발음(en) 설정
    const audioDataUrl = await generateSpeech(sampleText, { lang: 'en' });

    // MP3 파일로 직접 저장해서 확인
    const base64Data = audioDataUrl.replace(/^data:audio\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const outputPath = path.join(__dirname, 'test-output.mp3');
    fs.writeFileSync(outputPath, buffer);

    console.log('\n--- [결과 확인] ---');
    console.log(`✅ 음성 크기: ${(buffer.length / 1024).toFixed(1)} KB`);
    console.log(`📁 MP3 파일 위치: ${outputPath}`);
    console.log('-------------------\n');
  } catch (error) {
    console.error('❌ 테스트 실패:', error.message);
  }
}

runTest();