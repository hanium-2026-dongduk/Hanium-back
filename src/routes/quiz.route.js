const express = require('express');
const { authenticate } = require('../middlewares/auth');
const c = require('../controllers/quiz.controller');

const router = express.Router();

/**
 * @openapi
 * /quizzes/generate:
 *   post:
 *     tags: [퀴즈]
 *     summary: 동화 기반 퀴즈 생성
 *     responses:
 *       201: { description: 생성 완료 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/generate', authenticate, c.generateValidation, c.generate);

/**
 * @openapi
 * /quizzes/{quizSetId}/submit:
 *   post:
 *     tags: [퀴즈]
 *     summary: 퀴즈 답안 제출 및 채점
 *     parameters:
 *       - in: path
 *         name: quizSetId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       201: { description: 채점 완료 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:quizSetId/submit', authenticate, c.submitValidation, c.submit);

/**
 * @openapi
 * /quizzes/attempts:
 *   get:
 *     tags: [퀴즈]
 *     summary: 자녀의 퀴즈 풀이 기록 목록
 *     responses:
 *       200: { description: 풀이 기록 목록 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/attempts', authenticate, c.listAttemptsValidation, c.listAttempts);

/**
 * @openapi
 * /quizzes/attempts/{attemptId}/detail:
 *   get:
 *     tags: [퀴즈]
 *     summary: 퀴즈 풀이 기록 상세
 *     parameters:
 *       - in: path
 *         name: attemptId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: 풀이 상세 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/attempts/:attemptId/detail', authenticate, c.attemptDetailValidation, c.attemptDetail);

/**
 * @openapi
 * /quizzes/{quizSetId}:
 *   get:
 *     tags: [퀴즈]
 *     summary: 생성된 퀴즈 문제와 보기 조회
 *     description: 제출 전 정답 여부는 노출하지 않는다.
 *     parameters:
 *       - in: path
 *         name: quizSetId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: child_profile_id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: 퀴즈 문제와 보기 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:quizSetId', authenticate, c.detailValidation, c.detail);

module.exports = router;
