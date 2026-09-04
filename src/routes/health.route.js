const express = require('express');
const { getHealth } = require('../controllers/health.controller');

const router = express.Router();

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [기타]
 *     summary: 헬스체크
 *     description: 배포 스크립트와 모니터링이 쓴다. 인증이 필요 없다.
 *     security: []
 *     responses:
 *       200:
 *         description: 정상
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: ok }
 */
router.get('/', getHealth);

module.exports = router;
