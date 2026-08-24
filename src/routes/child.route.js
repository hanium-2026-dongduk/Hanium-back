const express = require('express');
const router = express.Router();
const childController = require('../controllers/child.controller');
const { authenticate } = require('../middlewares/auth');

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

// POST /api/children - 자녀 프로필 생성
router.post('/', childController.createValidation, childController.create);

// GET /api/children - 자녀 프로필 목록 조회
router.get('/', childController.getAll);

// GET /api/children/:id - 자녀 프로필 단건 조회
router.get('/:id', childController.idParamValidation, childController.getById);

// PUT /api/children/:id - 자녀 프로필 수정
router.put(
  '/:id',
  childController.idParamValidation,
  childController.updateValidation,
  childController.update
);

// DELETE /api/children/:id - 자녀 프로필 삭제
router.delete('/:id', childController.idParamValidation, childController.remove);

// PATCH /api/children/:id/activate - 활성 프로필 전환
router.patch('/:id/activate', childController.idParamValidation, childController.activate);

module.exports = router;
