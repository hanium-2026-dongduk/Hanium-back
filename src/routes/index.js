const express = require('express');
const healthRouter = require('./health.route');
const authRouter = require('./auth.route');

const router = express.Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);

module.exports = router;
