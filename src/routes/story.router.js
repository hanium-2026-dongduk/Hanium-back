const express = require('express');
const router = express.Router();
const { generateStoryPipeline } = require('../services/storyGenerator');
const characterRouter = require('./character.router');
const storySettingRouter = require('./storySetting.router');

// 동화 생성 API (POST /api/stories)
router.post('/', async (req, res, next) => {
  try {
    const { characterId, backgroundId, background, mainEventId, mainEvent, childAge } = req.body;

    if (!characterId || (!backgroundId && !background) || (!mainEventId && !mainEvent)) {
      return res.status(400).json({
        success: false,
        message: "characterId와 배경/사건 정보(선택 또는 직접입력)가 필요합니다."
      });
    }

    const character = characterRouter.characters.find(c => c.id === Number(characterId));
    if (!character) {
      return res.status(404).json({ success: false, message: "캐릭터를 찾을 수 없습니다." });
    }

    const resolvedBackground = background || storySettingRouter.presets.backgrounds.find(b => b.id === backgroundId)?.name;
    const resolvedMainEvent = mainEvent || storySettingRouter.presets.mainEvents.find(m => m.id === mainEventId)?.name;

    if (!resolvedBackground || !resolvedMainEvent) {
      return res.status(400).json({ success: false, message: "유효하지 않은 배경 또는 이벤트입니다." });
    }

    const setting = { background: resolvedBackground, mainEvent: resolvedMainEvent };

    const story = await generateStoryPipeline({
      childAge: childAge || 6,
      character,
      setting
    });

    res.status(201).json({ success: true, data: story });
  } catch (error) {
    next(error);
  }
});

module.exports = router;