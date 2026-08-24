const express = require('express');
const healthRouter = require('./health.route');
const characterRouter = require('./character.router');
const storySettingRouter = require('./storySetting.router');
const storyRouter = require('./story.router');
const authRouter = require('./auth.route');
const childRouter = require('./child.route');
const guardianRouter = require('./guardian.route');
const usageRouter = require('./usage.route');


const router = express.Router();

router.use('/health', healthRouter);
router.use('/characters', characterRouter);
router.use('/story-settings', storySettingRouter);
router.use('/stories', storyRouter);
router.use('/auth', authRouter);
router.use('/children', childRouter);
router.use('/guardian', guardianRouter);
router.use('/usage', usageRouter);

module.exports = router;