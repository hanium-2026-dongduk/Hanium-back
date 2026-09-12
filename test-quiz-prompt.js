require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const prompt = `다음 동화를 읽고 5개의 객관식 퀴즈를 만들어줘.
각 문제는 인물, 사건, 결말 중 하나를 다뤄야 하고, 보기는 정확히 4개, 정답은 1개만 있어야 해.
아래 JSON 형식으로만 응답해. 다른 텍스트나 마크다운 코드펜스는 절대 포함하지 마.

{
  "questions": [
    {
      "questionText": "질문",
      "options": [
        { "text": "보기1", "isCorrect": false },
        { "text": "보기2", "isCorrect": true },
        { "text": "보기3", "isCorrect": false },
        { "text": "보기4", "isCorrect": false }
      ]
    }
  ]
}

동화 본문:
A brave rabbit named Toto found a magic carrot in the forest. He shared it with his friends, and they all became best friends forever.`;

ai.models.generateContent({
  model: 'gemini-3.1-flash-lite',
  contents: prompt,
  config: { temperature: 0.3 },
})
  .then((r) => {
    console.log('--- RAW RESPONSE ---');
    console.log(r.text);
    console.log('--- PARSE TEST ---');
    const cleaned = r.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    console.log('문항 수:', parsed.questions.length);
    parsed.questions.forEach((q, i) => {
      const correctCount = q.options.filter((o) => o.isCorrect === true).length;
      console.log(`Q${i + 1}: 보기 ${q.options.length}개, 정답 ${correctCount}개`);
    });
  })
  .catch((e) => console.error('ERROR:', e.message));