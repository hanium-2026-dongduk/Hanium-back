const { QuizSet, QuizQuestion, QuizOption, VocabularyEntry, sequelize } = require('../models');
const pool = require('../config/db');
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const QUESTION_COUNT = 5;
const OPTION_COUNT = 4;
const MIN_VOCAB_ENTRIES = 4; // 보기 4개(정답+오답3)를 만들려면 뜻이 다른 단어가 최소 4개 필요

const SOURCE_STORY = 'story';
const SOURCE_VOCABULARY = 'vocabulary';

function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function getStoryFullText(childProfileId, storyId) {
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
  if (!data || !Array.isArray(data.questions) || data.questions.length === 0) {
    throw new Error('문항이 없습니다.');
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

async function callGeminiWithRetry(prompt, maxRetries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: { temperature: 0.3 },
      });

      const text = stripCodeFence(response.text);
      const parsed = JSON.parse(text);
      return validateQuizData(parsed);
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
      }
    }
  }
  throw lastError;
}

/**
 * 단어장 기반 퀴즈는 Gemini를 호출하지 않고 서버에서 직접 문제를 구성한다 — 이미
 * 정답(뜻)을 알고 있는 데이터라 AI 생성이 불필요하고, 더 빠르고 실패 위험도 없다.
 * 오답 3개는 같은 자녀가 저장한 다른 단어의 뜻 중에서 무작위로 뽑는다.
 */
function buildVocabularyQuizData(entries) {
  // 같은 뜻이 중복으로 저장돼 있으면 오답이 정답과 똑같아 보일 수 있어 뜻 기준 중복 제거
  const uniqueByMeaning = [];
  const seenMeanings = new Set();
  for (const e of entries) {
    if (!seenMeanings.has(e.korean_meaning)) {
      seenMeanings.add(e.korean_meaning);
      uniqueByMeaning.push(e);
    }
  }

  if (uniqueByMeaning.length < MIN_VOCAB_ENTRIES) {
    const error = new Error(
      `퀴즈를 만들려면 뜻이 서로 다른 단어가 최소 ${MIN_VOCAB_ENTRIES}개 필요합니다 (현재 ${uniqueByMeaning.length}개).`
    );
    error.statusCode = 400;
    throw error;
  }

  const questionCount = Math.min(QUESTION_COUNT, uniqueByMeaning.length);
  const questionEntries = shuffle(uniqueByMeaning).slice(0, questionCount);

  const questions = questionEntries.map((entry) => {
    const distractorPool = shuffle(
      uniqueByMeaning.filter((e) => e.vocabulary_entry_id !== entry.vocabulary_entry_id)
    );
    const distractors = distractorPool.slice(0, OPTION_COUNT - 1).map((d) => d.korean_meaning);
    const options = shuffle([
      { text: entry.korean_meaning, isCorrect: true },
      ...distractors.map((text) => ({ text, isCorrect: false })),
    ]);
    return {
      questionText: `"${entry.english_word}"의 뜻으로 알맞은 것을 고르세요.`,
      options,
    };
  });

  return { questions };
}

/**
 * 생성된 quizData(questions/options)를 실제 QuizSet/QuizQuestion/QuizOption으로 저장한다.
 * story 기반/vocabulary 기반 둘 다 여기로 합쳐서 처리한다.
 */
async function saveQuizData({ childProfileId, storyId, sourceType, quizData, existingQuizSet }) {
  return sequelize.transaction(async (t) => {
    let quizSet = existingQuizSet;
    if (!quizSet) {
      quizSet = await QuizSet.create(
        {
          story_id: storyId || null,
          child_profile_id: childProfileId,
          source_type: sourceType,
          status: 'pending',
        },
        { transaction: t }
      );
    }

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

/**
 * 동화 기반 퀴즈 자동 생성. 이미 quiz_set이 있으면 재사용(status 재시도)한다.
 */
async function generateFromStory(childProfileId, storyId) {
  const storyText = await getStoryFullText(childProfileId, storyId);

  const [quizSet] = await QuizSet.findOrCreate({
    where: { story_id: storyId },
    defaults: { source_type: SOURCE_STORY, child_profile_id: childProfileId, status: 'pending' },
  });

  let quizData;
  try {
    quizData = await callGeminiWithRetry(buildPrompt(storyText));
  } catch (err) {
    quizSet.status = 'failed';
    await quizSet.save();
    const error = new Error('퀴즈 생성에 실패했습니다. 다시 시도해주세요.', { cause: err });
    error.statusCode = 502;
    throw error;
  }

  return saveQuizData({
    childProfileId,
    storyId,
    sourceType: SOURCE_STORY,
    quizData,
    existingQuizSet: quizSet,
  });
}

/**
 * 단어장 기반 퀴즈 생성. storyId를 주면 그 동화에서 저장한 단어로만 좁히고,
 * 안 주면 그 자녀가 지금까지 저장한 모든 단어 중에서 낸다. story 기반과 달리
 * story_id로 1:1 재사용할 자연스러운 키가 없어 매 요청마다 새 QuizSet을 만든다
 * (매번 "새 복습 세트"라는 의미).
 */
async function generateFromVocabulary(childProfileId, { storyId } = {}) {
  const where = { child_profile_id: childProfileId };
  if (storyId) where.story_id = storyId;

  const entries = await VocabularyEntry.findAll({ where });
  const quizData = buildVocabularyQuizData(entries); // 단어 부족하면 여기서 400 던짐

  return saveQuizData({
    childProfileId,
    storyId: storyId || null,
    sourceType: SOURCE_VOCABULARY,
    quizData,
  });
}

module.exports = { generateFromStory, generateFromVocabulary, SOURCE_STORY, SOURCE_VOCABULARY };