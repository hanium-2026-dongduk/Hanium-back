const express = require('express');
const { authenticate } = require('../middlewares/auth');
const c = require('../controllers/vocabulary.controller');

const router = express.Router();

/**
 * @openapi
 * /vocabulary:
 *   post:
 *     tags: [단어장]
 *     summary: 단어 저장
 *     description: 저장 성공 시 word_clicked 데일리 미션도 1회 진행된다.
 *     responses:
 *       201: { description: 저장 완료 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/', authenticate, c.saveValidation, c.save);

/**
 * @openapi
 * /vocabulary:
 *   get:
 *     tags: [단어장]
 *     summary: 단어장 조회
 *     description: favorite_only=true이면 즐겨찾기 단어만 반환한다.
 *     responses:
 *       200: { description: 단어 목록 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/', authenticate, c.listValidation, c.list);

/**
 * @openapi
 * /vocabulary/{id}/favorite:
 *   patch:
 *     tags: [단어장]
 *     summary: 단어 즐겨찾기 설정 또는 해제
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: 변경 완료 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id/favorite', authenticate, c.favoriteValidation, c.setFavorite);

/**
 * @openapi
 * /vocabulary/{id}:
 *   delete:
 *     tags: [단어장]
 *     summary: 단어 삭제
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: 삭제 완료 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/:id', authenticate, c.deleteValidation, c.remove);

module.exports = router;
