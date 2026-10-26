const { body, param, query, validationResult, matchedData } = require('express-validator');
const vocabularyService = require('../services/vocabulary.service');
const wordMeaningService = require('../services/wordMeaning.service');
const response = require('../utils/response');

const saveValidation = [
  body('child_profile_id').isInt({ min: 1 }).toInt(),
  body('story_id').optional().isInt({ min: 1 }).toInt(),
  body('english_word').trim().notEmpty().isLength({ max: 100 }),
  body('korean_meaning').trim().notEmpty().isLength({ max: 255 }),
  body('example_sentence').optional().trim(),
];

const listValidation = [
  query('child_profile_id').isInt({ min: 1 }).toInt(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('favorite_only').optional().isBoolean(),
];

const favoriteValidation = [
  param('id').isInt({ min: 1 }).toInt(),
  body('child_profile_id').isInt({ min: 1 }).toInt(),
  body('is_favorite').isBoolean().toBoolean(),
];

const deleteValidation = [
  param('id').isInt({ min: 1 }).toInt(),
  query('child_profile_id').isInt({ min: 1 }).toInt(),
];

/**
 * 프론트는 동화 본문에서 누른 토큰을 그대로 보낸다 — "apple," 처럼 문장부호가 붙어 오거나
 * 둥근 따옴표(don’t)가 섞여 온다. 앞뒤 문장부호를 떼고 따옴표를 통일한다.
 */
const normalizeWord = (value) =>
  String(value)
    .replace(/[‘’]/g, "'")
    .replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');

// 영문자·아포스트로피·하이픈·공백만 허용한다. 이 값이 프롬프트에 그대로 들어가므로
// 문장을 넣어 프롬프트를 조작하는 것을 여기서 막는다.
const lookupValidation = [
  query('word')
    .isString()
    .bail()
    .customSanitizer(normalizeWord)
    .notEmpty()
    .isLength({ max: 50 })
    .matches(/^[A-Za-z][A-Za-z' -]*$/),
];

const save = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return response.error(res, 400, '입력값을 확인해주세요.', errors.array());

    const { child_profile_id, story_id, english_word, korean_meaning, example_sentence } = req.body;
    const entry = await vocabularyService.saveEntry(req.user.user_id, {
      childProfileId: child_profile_id,
      storyId: story_id,
      englishWord: english_word,
      koreanMeaning: korean_meaning,
      exampleSentence: example_sentence,
    });

    return response.success(res, 201, '단어가 저장되었습니다.', { entry });
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

const lookup = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return response.error(res, 400, '입력값을 확인해주세요.', errors.array());

    // Express 5의 req.query는 읽을 때마다 다시 파싱돼 sanitizer 결과가 남지 않는다.
    // 정리된 값은 matchedData로 꺼낸다.
    const { word } = matchedData(req, { locations: ['query'] });
    const koreanMeaning = await wordMeaningService.lookupMeaning(word);

    // 저장 API(POST /vocabulary)의 필드명과 맞춘다 — 프론트가 그대로 넘겨 저장할 수 있다.
    return response.success(res, 200, '단어 뜻을 조회했습니다.', {
      english_word: word,
      korean_meaning: koreanMeaning,
    });
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

const list = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return response.error(res, 400, '입력값을 확인해주세요.', errors.array());

    const { child_profile_id, page, limit, favorite_only } = req.query;
    const result = await vocabularyService.listEntries(req.user.user_id, child_profile_id, {
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      favoriteOnly: favorite_only === 'true',
    });

    return response.success(res, 200, '단어장을 조회했습니다.', result);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

const setFavorite = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return response.error(res, 400, '입력값을 확인해주세요.', errors.array());

    const entry = await vocabularyService.setFavorite(
      req.user.user_id,
      req.body.child_profile_id,
      req.params.id,
      req.body.is_favorite
    );
    return response.success(res, 200, '단어 즐겨찾기가 변경되었습니다.', { entry });
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return response.error(res, 400, '입력값을 확인해주세요.', errors.array());

    const { child_profile_id } = req.query;
    const result = await vocabularyService.deleteEntry(req.user.user_id, child_profile_id, req.params.id);

    return response.success(res, 200, '단어가 삭제되었습니다.', result);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

module.exports = {
  lookupValidation,
  lookup,
  saveValidation,
  save,
  listValidation,
  list,
  favoriteValidation,
  setFavorite,
  deleteValidation,
  remove,
};
