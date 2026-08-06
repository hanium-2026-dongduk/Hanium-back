const { body, param, validationResult } = require('express-validator');
const childService = require('../services/child.service');
const response = require('../utils/response');

/**
 * :id 파라미터 검증 (양의 정수)
 */
const idParamValidation = [
  param('id').isInt({ min: 1 }).withMessage('id는 양의 정수여야 합니다.').toInt(),
];

/**
 * 자녀 프로필 생성 유효성 검사
 */
const createValidation = [
  body('child_name')
    .trim()
    .notEmpty()
    .withMessage('자녀 이름을 입력해주세요.')
    .isLength({ max: 100 })
    .withMessage('이름은 100자 이하로 입력해주세요.'),
  body('age')
    .optional()
    .isInt({ min: 1, max: 15 })
    .withMessage('나이는 1~15 사이 정수여야 합니다.'),
  body('learning_level')
    .optional()
    .isIn(['beginner', 'intermediate', 'advanced'])
    .withMessage('학습 레벨은 beginner/intermediate/advanced 중 하나여야 합니다.'),
  body('vocabulary_level')
    .optional()
    .trim()
    .isLength({ min: 1, max: 30 })
    .withMessage('어휘 레벨은 1~30자로 입력해주세요.'),
  body('profile_image_url')
    .optional()
    .trim()
    .isURL()
    .withMessage('프로필 이미지 URL 형식이 올바르지 않습니다.')
    .isLength({ max: 500 })
    .withMessage('프로필 이미지 URL은 500자 이하여야 합니다.'),
];

/**
 * 자녀 프로필 수정 유효성 검사
 * (허용 필드 외에는 서비스 레벨에서 무시되며, 반영할 필드가 없으면 서비스가 400을 던진다)
 */
const updateValidation = [
  body('child_name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('이름은 1~100자로 입력해주세요.'),
  body('age')
    .optional()
    .isInt({ min: 1, max: 15 })
    .withMessage('나이는 1~15 사이 정수여야 합니다.'),
  body('learning_level')
    .optional()
    .isIn(['beginner', 'intermediate', 'advanced'])
    .withMessage('학습 레벨은 beginner/intermediate/advanced 중 하나여야 합니다.'),
  body('vocabulary_level')
    .optional()
    .trim()
    .isLength({ min: 1, max: 30 })
    .withMessage('어휘 레벨은 1~30자로 입력해주세요.'),
  body('profile_image_url')
    .optional()
    .trim()
    .isURL()
    .withMessage('프로필 이미지 URL 형식이 올바르지 않습니다.')
    .isLength({ max: 500 })
    .withMessage('프로필 이미지 URL은 500자 이하여야 합니다.'),
];

/**
 * POST /api/children
 * 자녀 프로필 생성
 */
const create = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const { child_name, age, learning_level, vocabulary_level, profile_image_url } = req.body;
    const profile = await childService.create(req.user.user_id, {
      child_name,
      age,
      learning_level,
      vocabulary_level,
      profile_image_url,
    });

    return response.success(res, 201, '자녀 프로필이 생성되었습니다.', { profile });
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

/**
 * GET /api/children
 * 자녀 프로필 목록 조회
 */
const getAll = async (req, res, next) => {
  try {
    const profiles = await childService.getAll(req.user.user_id);
    return response.success(res, 200, '자녀 프로필 목록을 조회했습니다.', { profiles });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/children/:id
 * 자녀 프로필 단건 조회
 */
const getById = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const profile = await childService.getById(req.user.user_id, req.params.id);
    return response.success(res, 200, '자녀 프로필을 조회했습니다.', { profile });
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

/**
 * PUT /api/children/:id
 * 자녀 프로필 수정
 */
const update = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const { child_name, age, learning_level, vocabulary_level, profile_image_url } = req.body;
    const profile = await childService.update(req.user.user_id, req.params.id, {
      child_name,
      age,
      learning_level,
      vocabulary_level,
      profile_image_url,
    });

    return response.success(res, 200, '자녀 프로필이 수정되었습니다.', { profile });
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

/**
 * DELETE /api/children/:id
 * 자녀 프로필 삭제
 */
const remove = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const result = await childService.remove(req.user.user_id, req.params.id);
    return response.success(res, 200, result.message);
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

/**
 * PATCH /api/children/:id/activate
 * 활성 프로필 전환
 */
const activate = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
    }

    const profile = await childService.activate(req.user.user_id, req.params.id);
    return response.success(res, 200, '활성 프로필이 전환되었습니다.', { profile });
  } catch (err) {
    if (err.statusCode) return response.error(res, err.statusCode, err.message);
    next(err);
  }
};

module.exports = {
  idParamValidation,
  createValidation,
  create,
  updateValidation,
  getAll,
  getById,
  update,
  remove,
  activate,
};
