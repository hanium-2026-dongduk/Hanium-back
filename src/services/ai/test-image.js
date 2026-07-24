const fs = require('fs');
const path = require('path');
const { generateImage } = require('./image.service');

async function runTest() {
  console.log('🖼️ 무료 이미지 생성 API 테스트 시작...');
  try {
    const prompt = 'a cute rabbit in forest';
    const resultUri = await generateImage(prompt);

    // Base64 데이터를 바이너리 이미지 파일로 변환
    const base64Data = resultUri.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // 파일 저장
    const outputPath = path.join(__dirname, 'test-output.jpg');
    fs.writeFileSync(outputPath, buffer);

    console.log('\n--- [결과 확인] ---');
    console.log(`✅ 이미지 크기: ${(buffer.length / 1024).toFixed(1)} KB`);
    console.log(`📁 이미지 저장 위치: ${outputPath}`);
    console.log('-------------------\n');
  } catch (error) {
    console.error('❌ 테스트 실패:', error.message);
  }
}

runTest();