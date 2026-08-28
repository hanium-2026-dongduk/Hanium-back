const express = require('express');
const { authenticate } = require('../middlewares/auth');
const c = require('../controllers/quiz.controller');

const router = express.Router();

router.post('/generate', authenticate, c.generateValidation, c.generate);
router.post('/:quizSetId/submit', authenticate, c.submitValidation, c.submit);
router.get('/attempts', authenticate, c.listAttemptsValidation, c.listAttempts);
router.get('/attempts/:attemptId/detail', authenticate, c.attemptDetailValidation, c.attemptDetail);

module.exports = router;