// services/storyGenerator.js
require('dotenv').config();

// 1. 하위 ai 폴더의 개별 서비스 모듈 import
const { generateStoryText } = require('./ai/gemini.service');
const { generateStoryImage } = require('./ai/image.service');
const { generateAudio } = require('./ai/tts.service');

/**
 * 입력받은 데이터로 AI 동화를 생성하는 핵심 함수
 */
async function generateStoryPipeline(inputData) {
  const { childAge = 6, character, setting } = inputData;

  // 1. Gemini 프롬프트 구성 (요구사항 SG01, SG03 반영)
  const prompt = `
     You are a children's storybook author. Write a 3-page story in English that fits the conditions below.

    [Conditions]
    - Age level: ${childAge} years old
    - Main character name: ${character.name}
    - Main character personality/traits: ${character.personality} (${character.description || ''})
    - Story setting: ${setting.background}
    - Main event: ${setting.mainEvent}

    [Response format]
    Respond ONLY in the following JSON format (no other text, no markdown):
    {
      "title": "Story title in English",
      "pages": [
        {
          "pageNumber": 1,
          "content": "Page text content, written in English, simple vocabulary suitable for a ${childAge}-year-old",
          "imagePrompt": "English illustration prompt for gemini-2.5 (children's storybook style)"
        }
      ],
      "choices": ["Choice 1", "Choice 2"]
    }
  `;

  try {
    console.log('🚀 [1/3] Gemini 동화 텍스트 생성 중...');
    const rawText = await generateStoryText(prompt);
    
    // 마크다운 백틱 및 json 키워드 제거 후 파싱
    const cleanJson = rawText.replace(/```json|```/g, '').trim();
    const storyData = JSON.parse(cleanJson);

    console.log('🎨 [2/3] 페이지별 삽화 이미지 & 🔊 [3/3] TTS 오디오 순차 생성 중...');
    
    // 💡 [수정 포인트] Promise.all 대신 for...of 문으로 순차 생성하여 API 과부하(503) 방지
    const pagesWithMedia = [];
    for (const page of storyData.pages) {
      console.log(`  └ PAGE ${page.pageNumber}/${storyData.pages.length} 생성 중...`);
      
      const imageUrl = await generateStoryImage(page.imagePrompt);
      const audioUrl = await generateAudio(page.content);

      pagesWithMedia.push({
        pageNumber: page.pageNumber,
        content: page.content,
        imageUrl,
        audioUrl
      });

      // API 연타 방지를 위한 500ms 짧은 대기시간
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log('✅ AI 동화 전체 파이프라인 생성 완료!');

    // DB 연동 전 모의(Mock) 응답 반환
    return {
      title: storyData.title,
      character: character.name,
      setting,
      pages: pagesWithMedia,
      choices: storyData.choices
    };

  } catch (error) {
    console.error('❌ 동화 생성 파이프라인 에러:', error);
    throw error;
  }
}

module.exports = {
  generateStoryPipeline
};

// --- 간단 테스트 코드 (node services/storyGenerator.js 로 실행) ---
if (require.main === module) {
  const mockInput = {
    childAge: 5,
    character: {
      name: "아기곰 피코",
      personality: "용감하고 호기심이 많음",
      description: "노란색 멜빵바지를 입은 아기곰"
    },
    setting: {
      background: "신비로운 별빛 숲",
      mainEvent: "사라진 무지개 열매 찾기"
    }
  };

  generateStoryPipeline(mockInput)
    .then(result => console.log('결과 데이터:', JSON.stringify(result, null, 2)))
    .catch(err => console.error(err));
}