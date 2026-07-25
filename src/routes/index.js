const express = require('express');
const healthRouter = require('./health.route');
const authRouter = require('./auth.route');
const childRouter = require('./child.route');
const guardianRouter = require('./guardian.route');

const router = express.Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/children', childRouter);
router.use('/guardian', guardianRouter);

module.exports = router;
