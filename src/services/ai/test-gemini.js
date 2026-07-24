const { generateText } = require('./gemini.service');

async function runTest() {
  console.log('🚀 Gemini API 테스트 시작...');
  try {
    const prompt = '어린이 동화 시작 부분에 어울리는 흥미진진한 한 문장을 써줘.';
    const result = await generateText(prompt);
    console.log('\n--- [Gemini 응답] ---');
    console.log(result);
    console.log('---------------------\n');
    console.log('✅ 성공적으로 텍스트를 가져왔습니다!');
  } catch (error) {
    console.error('❌ 테스트 실패:', error.message);
  }
}

runTest();