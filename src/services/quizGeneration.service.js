const { QuizSet, QuizQuestion, QuizOption, sequelize } = require('../models');
const pool = require('../config/db');
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const QUESTION_COUNT = 5;
const OPTION_COUNT = 4;

async function getStoryFullText(childProfileId, storyId) {
  // story가 실제로 이 childProfileId 소유인지 먼저 확인
  const [storyRows] = await pool.execute(
    `SELECT story_id FROM stories WHERE story_id = ? AND child_profile_id = ?`,
    [storyId, childProfileId]
  );
  if (storyRows.length === 0) {
    const error = new Error('동화를 찾을 수 없습니다.');
    error.statusCode = 404;
    throw error;
  }

  const [pages] = await pool.execute(
    `SELECT content FROM story_pages WHERE story_id = ? ORDER BY page_number ASC`,
    [storyId]
  );
  if (pages.length === 0) {
    const error = new Error('동화를 찾을 수 없습니다.');
    error.statusCode = 404;
    throw error;
  }
  return pages.map((p) => p.content).join('\n');
}

function buildPrompt(storyText) {
  return `다음 동화를 읽고 ${QUESTION_COUNT}개의 객관식 퀴즈를 만들어줘.
각 문제는 인물, 사건, 결말 중 하나를 다뤄야 하고, 보기는 정확히 ${OPTION_COUNT}개, 정답은 1개만 있어야 해.
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
${storyText}`;
}

function stripCodeFence(text) {
  return text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
}

function validateQuizData(data) {
  if (!data || !Array.isArray(data.questions) || data.questions.length !== QUESTION_COUNT) {
    throw new Error(`문항 수가 ${QUESTION_COUNT}개가 아닙니다.`);
  }
  for (const q of data.questions) {
    if (!q.questionText || typeof q.questionText !== 'string' || !q.questionText.trim()) {
      throw new Error('빈 질문이 있습니다.');
    }
    if (!Array.isArray(q.options) || q.options.length !== OPTION_COUNT) {
      throw new Error(`보기 수가 ${OPTION_COUNT}개가 아닙니다.`);
    }
    const correctCount = q.options.filter((o) => o.isCorrect === true).length;
    if (correctCount !== 1) {
      throw new Error(`정답이 정확히 1개가 아닙니다 (현재 ${correctCount}개).`);
    }
    for (const o of q.options) {
      if (!o.text || typeof o.text !== 'string' || !o.text.trim()) {
        throw new Error('빈 보기가 있습니다.');
      }
    }
  }
  return data;
}

/**
 * gemini.service.js의 generateStoryText와 동일한 SDK(@google/genai) 패턴 재사용.
 * story 파이프라인이 503 등으로 인한 순차 처리(setTimeout 500ms)를 이미 쓰고 있어
 * 동일한 재시도 간격을 따른다.
 */
async function callGeminiWithRetry(prompt, maxRetries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: { temperature: 0.3 }, // 퀴즈는 정확성이 중요하므로 스토리(0.7)보다 낮게
      });

      const text = stripCodeFence(response.text);
      const parsed = JSON.parse(text);
      return validateQuizData(parsed);
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1))); // 500ms, 1s, 2s
      }
    }
  }
  throw lastError;
}

/**
 * 동화 기반 퀴즈 자동 생성. 이미 quiz_set이 있으면 재사용(status 재시도)한다.
 */
async function generateFromStory(childProfileId, storyId) {
  const storyText = await getStoryFullText(childProfileId, storyId);

  const [quizSet] = await QuizSet.findOrCreate({
    where: { story_id: storyId },
    defaults: { source_type: 'story', status: 'pending' },
  });

  let quizData;
  try {
    quizData = await callGeminiWithRetry(buildPrompt(storyText));
  } catch (err) {
    quizSet.status = 'failed';
    await quizSet.save();
    const error = new Error('퀴즈 생성에 실패했습니다. 다시 시도해주세요.');
    error.statusCode = 502;
    throw error;
  }

  return sequelize.transaction(async (t) => {
    const existingQuestions = await QuizQuestion.findAll({
      where: { quiz_set_id: quizSet.quiz_set_id },
      transaction: t,
    });
    for (const q of existingQuestions) {
      await QuizOption.destroy({ where: { quiz_question_id: q.quiz_question_id }, transaction: t });
    }
    await QuizQuestion.destroy({ where: { quiz_set_id: quizSet.quiz_set_id }, transaction: t });

    for (let i = 0; i < quizData.questions.length; i += 1) {
      const q = quizData.questions[i];
      const question = await QuizQuestion.create(
        {
          quiz_set_id: quizSet.quiz_set_id,
          question_order: i + 1,
          question_text: q.questionText,
          question_type: 'multiple_choice',
        },
        { transaction: t }
      );

      for (let j = 0; j < q.options.length; j += 1) {
        const o = q.options[j];
        await QuizOption.create(
          {
            quiz_question_id: question.quiz_question_id,
            option_order: j + 1,
            option_text: o.text,
            is_correct: !!o.isCorrect,
          },
          { transaction: t }
        );
      }
    }

    quizSet.status = 'ready';
    quizSet.generated_at = new Date();
    await quizSet.save({ transaction: t });

    return { quizSetId: quizSet.quiz_set_id, status: 'ready', questionCount: quizData.questions.length };
  });
}

module.exports = { generateFromStory };