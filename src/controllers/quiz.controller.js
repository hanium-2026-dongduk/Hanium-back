const { body, validationResult } = require('express-validator');
const childService = require('../services/child.service');
const quizGenerationService = require('../services/quizGeneration.service');
const response = require('../utils/response');

const generateValidation = [
  body('child_profile_id').isInt({ min: 1 }).toInt(),
  body('story_id').isInt({ min: 1 }).toInt(),
];

const generate = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return response.error(res, 400, '입력값을 확인해주세요.', errors.array());

    const { child_profile_id, story_id } = req.body;
    await childService.getById(req.user.user_id, child_profile_id);

    const result = await quizGenerationService.generateFromStory(child_profile_id, story_id);
    return response.success(res, 201, '퀴즈가 생성되었습니다.', result);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

module.exports = { generateValidation, generate };