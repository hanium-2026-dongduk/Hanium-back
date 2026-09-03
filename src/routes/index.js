const express = require('express');
const healthRouter = require('./health.route');
const authRouter = require('./auth.route');
const childRouter = require('./child.route');
const guardianRouter = require('./guardian.route');
const usageRouter = require('./usage.route');
const attendanceRouter = require('./attendance.route');
const missionRouter = require('./mission.route');
const rewardRouter = require('./reward.route');

const router = express.Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/children', childRouter);
router.use('/guardian', guardianRouter);
router.use('/usage', usageRouter);
router.use('/attendance', attendanceRouter);
router.use('/missions', missionRouter);
router.use('/rewards', rewardRouter);

module.exports = router;
