const { body, param, query, validationResult } = require('express-validator');
const vocabularyService = require('../services/vocabulary.service');
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
];

const deleteValidation = [
  param('id').isInt({ min: 1 }).toInt(),
  query('child_profile_id').isInt({ min: 1 }).toInt(),
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

const list = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return response.error(res, 400, '입력값을 확인해주세요.', errors.array());

    const { child_profile_id, page, limit } = req.query;
    const result = await vocabularyService.listEntries(req.user.user_id, child_profile_id, { page, limit });

    return response.success(res, 200, '단어장을 조회했습니다.', result);
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

module.exports = { saveValidation, save, listValidation, list, deleteValidation, remove };