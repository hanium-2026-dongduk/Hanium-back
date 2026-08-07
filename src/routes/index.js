const express = require('express');
const healthRouter = require('./health.route');
const characterRouter = require('./character.router');
const storySettingRouter = require('./storySetting.router');
const storyRouter = require('./story.router');

const router = express.Router();

router.use('/health', healthRouter);
router.use('/characters', characterRouter);
router.use('/story-settings', storySettingRouter);
router.use('/stories', storyRouter);

module.exports = router;