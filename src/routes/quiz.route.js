const express = require('express');
const { authenticate } = require('../middlewares/auth');
const c = require('../controllers/quiz.controller');

const router = express.Router();
router.post('/generate', authenticate, c.generateValidation, c.generate);
module.exports = router;