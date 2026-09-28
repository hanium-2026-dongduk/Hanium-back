const { body, param, query, validationResult } = require('express-validator');
const childService = require('../services/child.service');
const quizGenerationService = require('../services/quizGeneration.service');
const quizAttemptService = require('../services/quizAttempt.service');
const quizQueryService = require('../services/quizQuery.service');
const response = require('../utils/response');

const generateValidation = [
  body('child_profile_id').isInt({ min: 1 }).toInt(),
  body('source_type').optional().isIn(['story', 'vocabulary']).withMessage("source_type은 story 또는 vocabulary여야 합니다."),
  body('story_id').optional().isInt({ min: 1 }).toInt(),
];

const generate = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return response.error(res, 400, '입력값을 확인해주세요.', errors.array());

    const { child_profile_id, story_id } = req.body;
    const source_type = req.body.source_type || 'story';

    if (source_type === 'story' && !story_id) {
      return response.error(res, 400, "source_type이 'story'면 story_id가 필요합니다.");
    }

    await childService.getById(req.user.user_id, child_profile_id);

    const result =
      source_type === 'vocabulary'
        ? await quizGenerationService.generateFromVocabulary(child_profile_id, { storyId: story_id })
        : await quizGenerationService.generateFromStory(child_profile_id, story_id);

    return response.success(res, 201, '퀴즈가 생성되었습니다.', result);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

const detailValidation = [
  param('quizSetId').isInt({ min: 1 }).toInt(),
  query('child_profile_id').isInt({ min: 1 }).toInt(),
];

const detail = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return response.error(res, 400, '입력값을 확인해주세요.', errors.array());

    const result = await quizQueryService.getQuiz(
      req.user.user_id,
      Number(req.query.child_profile_id),
      req.params.quizSetId
    );
    return response.success(res, 200, '퀴즈를 조회했습니다.', result);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

const submitValidation = [
  param('quizSetId').isInt({ min: 1 }).toInt(),
  body('child_profile_id').isInt({ min: 1 }).toInt(),
  body('answers').isArray({ min: 1 }),
  body('answers.*.questionId').isInt({ min: 1 }).toInt(),
  body('answers.*.selectedOptionId').isInt({ min: 1 }).toInt(),
];

const submit = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return response.error(res, 400, '입력값을 확인해주세요.', errors.array());

    const { child_profile_id, answers } = req.body;
    const result = await quizAttemptService.submitAttempt({
      userId: req.user.user_id,
      childProfileId: child_profile_id,
      quizSetId: req.params.quizSetId,
      answers,
    });

    return response.success(res, 201, '퀴즈가 채점되었습니다.', result);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

const listAttemptsValidation = [
  query('child_profile_id').isInt({ min: 1 }).toInt(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

const listAttempts = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return response.error(res, 400, '입력값을 확인해주세요.', errors.array());

    const { child_profile_id, page, limit } = req.query;
    const result = await quizAttemptService.listAttempts(req.user.user_id, child_profile_id, {
      page: page === undefined ? undefined : Number(page),
      limit: limit === undefined ? undefined : Number(limit),
    });

    return response.success(res, 200, '퀴즈 풀이 기록을 조회했습니다.', result);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

const attemptDetailValidation = [param('attemptId').isInt({ min: 1 }).toInt()];

const attemptDetail = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return response.error(res, 400, '입력값을 확인해주세요.', errors.array());

    const result = await quizAttemptService.getAttemptDetail(req.user.user_id, req.params.attemptId);
    return response.success(res, 200, '풀이 상세를 조회했습니다.', result);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

const byStoryValidation = [
  param('storyId').isInt({ min: 1 }).toInt(),
  query('child_profile_id').isInt({ min: 1 }).toInt(),
];

const byStory = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return response.error(res, 400, '입력값을 확인해주세요.', errors.array());

    const result = await quizQueryService.getQuizByStory(
      req.user.user_id,
      Number(req.query.child_profile_id),
      req.params.storyId
    );
    return response.success(res, 200, '퀴즈를 조회했습니다.', result);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

module.exports = {
  generateValidation, generate,
  detailValidation, detail,
  submitValidation, submit,
  listAttemptsValidation, listAttempts,
  attemptDetailValidation, attemptDetail,
  byStoryValidation, byStory
};
