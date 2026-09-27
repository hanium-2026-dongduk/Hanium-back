const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { authenticate } = require('../middlewares/auth');
const childService = require('../services/child.service');
const { Character } = require('../models');
const response = require('../utils/response');

const router = express.Router();

const handleError = (error, res, next) => {
  if (error.statusCode) return response.error(res, error.statusCode, error.message);
  return next(error);
};

/**
 * @openapi
 * /characters:
 *   get:
 *     tags: [캐릭터]
 *     summary: 공용 프리셋과 내 자녀 캐릭터 목록
 *     parameters:
 *       - in: query
 *         name: child_profile_id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: 캐릭터 배열을 data에 반환 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   post:
 *     tags: [캐릭터]
 *     summary: 내 자녀의 CUSTOM 캐릭터 생성
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [child_profile_id, name]
 *             properties:
 *               child_profile_id: { type: integer, minimum: 1 }
 *               name: { type: string, maxLength: 255 }
 *               personality: { type: string, maxLength: 255 }
 *               description: { type: string, maxLength: 255 }
 *               imageUrl: { type: string, maxLength: 255 }
 *     responses:
 *       201: { description: 생성된 CUSTOM 캐릭터를 data에 반환 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
// 공용 프리셋과 선택한 자녀가 만든 캐릭터만 조회한다.
router.get('/', authenticate, query('child_profile_id').isInt({ min: 1 }), async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return response.error(res, 400, '입력값을 확인해주세요.', errors.array());

  try {
    const childProfileId = Number(req.query.child_profile_id);
    await childService.getById(req.user.user_id, childProfileId);
    const characters = await Character.findAll({
      where: {
        [Op.or]: [
          { type: 'PRESET', child_profile_id: null },
          { child_profile_id: childProfileId },
        ],
      },
    });
    return response.success(res, 200, '캐릭터 목록을 조회했습니다.', characters);
  } catch (error) {
    return handleError(error, res, next);
  }
});

// 클라이언트가 type=PRESET을 보내더라도 공용 캐릭터로 만들 수 없다.
router.post('/', authenticate, [
  body('child_profile_id').isInt({ min: 1 }),
  body('name').isString().trim().notEmpty().isLength({ max: 255 }),
  body('personality').optional().isString().isLength({ max: 255 }),
  body('description').optional().isString().isLength({ max: 255 }),
  body('imageUrl').optional({ values: 'null' }).isString().isLength({ max: 255 }),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return response.error(res, 400, '입력값을 확인해주세요.', errors.array());

  try {
    const childProfileId = Number(req.body.child_profile_id);
    await childService.getById(req.user.user_id, childProfileId);
    const character = await Character.create({
      child_profile_id: childProfileId,
      name: req.body.name,
      personality: req.body.personality || '밝음',
      description: req.body.description || '',
      image_url: req.body.imageUrl || null,
      type: 'CUSTOM',
    });
    return response.success(res, 201, '캐릭터가 생성되었습니다.', character);
  } catch (error) {
    return handleError(error, res, next);
  }
});

module.exports = router;
