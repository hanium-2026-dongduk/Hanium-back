const { query, body, param, validationResult } = require('express-validator');
const childService = require('../services/child.service');
const storyLibraryService = require('../services/storyLibrary.service');
const response = require('../utils/response');

const listValidation = [
  query('child_profile_id').isInt({ min: 1 }).toInt(),
  query('sort').optional().isIn(['latest', 'oldest']),
  query('favorite').optional().isBoolean().toBoolean(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

const deleteValidation = [
  param('storyId').isInt({ min: 1 }).toInt(),
  query('child_profile_id').isInt({ min: 1 }).toInt(),
];

const togglePublicValidation = [
  param('storyId').isInt({ min: 1 }).toInt(),
  body('child_profile_id').isInt({ min: 1 }).toInt(),
  body('is_public').isBoolean().toBoolean(),
];

const exploreValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

const list = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return response.error(res, 400, '입력값을 확인해주세요.', errors.array());

    const { child_profile_id, sort, favorite, page, limit } = req.query;
    await childService.getById(req.user.user_id, child_profile_id);

    const result = await storyLibraryService.listStories(child_profile_id, {
      sort,
      favoriteOnly: favorite,
      page,
      limit,
    });

    return response.success(res, 200, '동화 목록을 조회했습니다.', result);
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
    await childService.getById(req.user.user_id, child_profile_id);

    const result = await storyLibraryService.deleteStory(child_profile_id, req.params.storyId);
    return response.success(res, 200, '동화가 삭제되었습니다.', result);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

const togglePublic = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return response.error(res, 400, '입력값을 확인해주세요.', errors.array());

    const { child_profile_id, is_public } = req.body;
    await childService.getById(req.user.user_id, child_profile_id);

    const result = await storyLibraryService.togglePublic(child_profile_id, req.params.storyId, is_public);
    return response.success(res, 200, '공개 설정이 변경되었습니다.', result);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

const explore = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return response.error(res, 400, '입력값을 확인해주세요.', errors.array());

    const { page, limit } = req.query;
    const result = await storyLibraryService.exploreStories({ page, limit });
    return response.success(res, 200, '공개 동화 목록을 조회했습니다.', result);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listValidation, list,
  deleteValidation, remove,
  togglePublicValidation, togglePublic,
  exploreValidation, explore,
};