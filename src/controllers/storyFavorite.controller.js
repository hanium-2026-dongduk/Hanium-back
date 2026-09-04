const { body, param, validationResult } = require('express-validator');
const storyFavoriteService = require('../services/storyFavorite.service');
const response = require('../utils/response');

const addValidation = [
  body('child_profile_id').isInt({ min: 1 }).withMessage('child_profile_id는 양의 정수여야 합니다.').toInt(),
  body('story_id').isInt({ min: 1 }).withMessage('story_id는 양의 정수여야 합니다.').toInt(),
];

const removeValidation = [
  param('storyId').isInt({ min: 1 }).withMessage('storyId는 양의 정수여야 합니다.').toInt(),
  body('child_profile_id').isInt({ min: 1 }).withMessage('child_profile_id는 양의 정수여야 합니다.').toInt(),
];

/**
 * POST /api/favorites
 */
const add = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const { child_profile_id, story_id } = req.body;
    const result = await storyFavoriteService.addFavorite(req.user.user_id, child_profile_id, story_id);

    const statusCode = result.alreadyFavorited ? 200 : 201;
    return response.success(res, statusCode, '즐겨찾기가 등록되었습니다.', {
      alreadyFavorited: result.alreadyFavorited,
    });
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

/**
 * DELETE /api/favorites/:storyId
 */
const remove = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const { child_profile_id } = req.body;
    const result = await storyFavoriteService.removeFavorite(req.user.user_id, child_profile_id, req.params.storyId);

    return response.success(res, 200, '즐겨찾기가 해제되었습니다.', { removed: result.removed });
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

module.exports = { addValidation, add, removeValidation, remove };