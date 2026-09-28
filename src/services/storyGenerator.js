require('dotenv').config();

const { generateStoryText } = require('./ai/gemini.service');
const { generateStoryImage } = require('./ai/image.service');
const { generateAudio } = require('./ai/tts.service');

// back#40 6번: 프론트 그림체 칩 라벨(한글) → 이미지 생성 프롬프트에 붙일 영어 스타일 힌트.
// 프론트가 목록에 없는 값을 보내도(향후 칩 추가 등) 깨지지 않도록 매핑에 없으면
// 원문 그대로 style 힌트로 붙인다.
const IMAGE_STYLE_HINTS = {
  '아동풍': "children's picture book illustration style, warm and soft colors",
  '리얼풍': 'realistic illustration style, detailed and lifelike',
  '수채화풍': 'watercolor painting style, soft brush strokes',
  '3D 애니메이션': '3D animated movie style, Pixar-like rendering',
};

function resolveImageStyleHint(imageStyle) {
  if (!imageStyle) return null;
  return IMAGE_STYLE_HINTS[imageStyle] || `${imageStyle} style`;
}

/**
 * 입력받은 데이터로 AI 동화를 생성하는 핵심 함수
 * @param {object} inputData
 * @param {string} [inputData.keyword] - back#40 6번: 아이가 입력한 짧은 상세 이야기(최대 100자,
 *   실제로는 "키워드" 한 단어가 아니라 문장). 있으면 본문 생성 프롬프트에 반영한다.
 * @param {string} [inputData.imageStyle] - back#40 6번: 그림체 라벨(예: "수채화풍"). 있으면
 *   각 페이지 삽화 프롬프트에 스타일 힌트를 덧붙인다.
 */
async function generateStoryPipeline(inputData) {
  const { childAge = 6, character, setting, keyword, imageStyle } = inputData;

  // 1. Gemini 프롬프트 구성 (요구사항 SG01, SG03 반영)
  const prompt = `
     You are a children's storybook author. Write a 3-page story in English that fits the conditions below.

    [Conditions]
    - Age level: ${childAge} years old
    - Main character name: ${character.name}
    - Main character personality/traits: ${character.personality} (${character.description || ''})
    - Story setting: ${setting.background}
    - Main event: ${setting.mainEvent}${
      keyword
        ? `
    - Additional story detail requested by the child (weave this into the plot naturally): ${keyword}`
        : ''
    }

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

    const cleanJson = rawText.replace(/```json|```/g, '').trim();
    const storyData = JSON.parse(cleanJson);

    console.log('🎨 [2/3] 페이지별 삽화 이미지 & 🔊 [3/3] TTS 오디오 순차 생성 중...');

    const styleHint = resolveImageStyleHint(imageStyle);
    const pagesWithMedia = [];
    for (const page of storyData.pages) {
      console.log(`  └ PAGE ${page.pageNumber}/${storyData.pages.length} 생성 중...`);

      const imagePrompt = styleHint ? `${page.imagePrompt}, ${styleHint}` : page.imagePrompt;
      const imageUrl = await generateStoryImage(imagePrompt);
      const audioUrl = await generateAudio(page.content);

      pagesWithMedia.push({
        pageNumber: page.pageNumber,
        content: page.content,
        imageUrl,
        audioUrl,
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log('✅ AI 동화 전체 파이프라인 생성 완료!');

    return {
      title: storyData.title,
      character: character.name,
      setting,
      pages: pagesWithMedia,
      choices: storyData.choices,
    };
  } catch (error) {
    console.error('❌ 동화 생성 파이프라인 에러:', error);
    throw error;
  }
}

module.exports = {
  generateStoryPipeline,
};

if (require.main === module) {
  const mockInput = {
    childAge: 5,
    character: {
      name: '아기곰 피코',
      personality: '용감하고 호기심이 많음',
      description: '노란색 멜빵바지를 입은 아기곰',
    },
    setting: {
      background: '신비로운 별빛 숲',
      mainEvent: '사라진 무지개 열매 찾기',
    },
    keyword: '비행기 조종사가 된 아기곰이 구름 나라 아기 천사를 도와주는 이야기',
    imageStyle: '수채화풍',
  };

  generateStoryPipeline(mockInput)
    .then((result) => console.log('결과 데이터:', JSON.stringify(result, null, 2)))
    .catch((err) => console.error(err));
}