const express = require('express');
const { authenticate } = require('../middlewares/auth');
const c = require('../controllers/dashboard.controller');

const router = express.Router();
router.get('/:childId', authenticate, c.summaryValidation, c.summary);

module.exports = router;