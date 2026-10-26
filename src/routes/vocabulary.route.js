const express = require('express');
const { authenticate } = require('../middlewares/auth');
const { wordLookupLimiter } = require('../middlewares/rateLimit');
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
 * /vocabulary/lookup:
 *   get:
 *     tags: [단어장]
 *     summary: 영어 단어의 한국어 뜻 조회
 *     description: |
 *       동화 본문에서 단어를 눌렀을 때 뜻을 보여주기 위한 API. 저장은 하지 않는다.
 *       앞뒤 문장부호는 서버가 떼어내므로 누른 토큰을 그대로 보내도 된다 (`apple,` → `apple`).
 *       응답 필드명이 단어 저장 API와 같아, 저장할 때는 응답을 그대로 넘기면 된다.
 *     parameters:
 *       - in: query
 *         name: word
 *         required: true
 *         schema: { type: string, maxLength: 50 }
 *         description: 영문자·아포스트로피·하이픈·공백만 허용
 *         example: apple
 *     responses:
 *       200:
 *         description: 조회 성공
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: 단어 뜻을 조회했습니다.
 *               data: { english_word: apple, korean_meaning: 사과 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { description: 뜻을 찾을 수 없는 단어 }
 *       429: { description: 요청이 너무 잦음 }
 *       502: { description: 뜻 생성(AI) 호출 실패 — 잠시 후 재시도 }
 */
router.get('/lookup', authenticate, wordLookupLimiter, c.lookupValidation, c.lookup);

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
