const express = require('express');
const healthRouter = require('./health.route');
const characterRouter = require('./character.router');
const storySettingRouter = require('./storySetting.router');
const storyRouter = require('./story.router');
const authRouter = require('./auth.route');
const childRouter = require('./child.route');
const guardianRouter = require('./guardian.route');
const usageRouter = require('./usage.route');
const storyFavoriteRouter = require('./storyFavorite.route');
const vocabularyRouter = require('./vocabulary.route');
const quizRouter = require('./quiz.route');

const attendanceRouter = require('./attendance.route');
const missionRouter = require('./mission.route');
const rewardRouter = require('./reward.route');

const router = express.Router();

router.use('/health', healthRouter);
router.use('/characters', characterRouter);
router.use('/story-settings', storySettingRouter);
router.use('/stories', storyRouter);
router.use('/auth', authRouter);
router.use('/children', childRouter);
router.use('/guardian', guardianRouter);
router.use('/usage', usageRouter);
router.use('/favorites', storyFavoriteRouter);
router.use('/vocabulary', vocabularyRouter);
router.use('/quizzes', quizRouter);
router.use('/attendance', attendanceRouter);
router.use('/missions', missionRouter);
router.use('/rewards', rewardRouter);

module.exports = router;