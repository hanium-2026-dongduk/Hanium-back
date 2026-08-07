const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const { retryWithBackoff } = require('../../utils/retry');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const IMAGE_DIR = path.join(__dirname, '../../../public/images');
if (!fs.existsSync(IMAGE_DIR)) {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

/**
 * 프롬프트를 받아 Gemini 이미지 모델을 통해 삽화 이미지를 생성하고 파일로 저장
 * @param {string} imagePrompt
 * @returns {Promise<string>} 이미지 파일 경로 (예: /images/xxx.png)
 */
async function generateStoryImage(imagePrompt) {
  try {
    const response = await retryWithBackoff(() =>
      ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${imagePrompt}, children's book illustration style, bright soft colors, cute, vector art`,
              },
            ],
          },
        ],
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      })
    );

    const parts = response.candidates[0].content.parts;
    const imagePart = parts.find((p) => p.inlineData);

    if (!imagePart) {
      throw new Error('응답에 이미지 데이터가 없습니다');
    }

    const imageBuffer = Buffer.from(imagePart.inlineData.data, 'base64');

    const ext = imagePart.inlineData.mimeType?.includes('jpeg') ? 'jpg' : 'png';
    const fileName = `image_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filePath = path.join(IMAGE_DIR, fileName);
    fs.writeFileSync(filePath, imageBuffer);

    return `/images/${fileName}`;
  } catch (error) {
    console.error('[Gemini Image API Error]:', error);
    throw new Error('이미지 생성 실패');
  }
}

module.exports = { generateStoryImage };