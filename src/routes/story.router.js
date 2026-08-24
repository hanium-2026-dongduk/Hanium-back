const express = require('express');
const router = express.Router();
const { generateStoryPipeline } = require('../services/storyGenerator');
const { saveStoryWithTransaction } = require('../services/story.service'); // 목요일 서비스
const characterRouter = require('./character.router');
const storySettingRouter = require('./storySetting.router');
const { authenticate } = require('../middlewares/auth');
const storyLibraryController = require('../controllers/storyLibrary.controller');

// 1. [수~목] 동화 생성 및 트랜잭션 저장 API (POST /api/stories)
router.post('/', async (req, res, next) => {
  try {
    const { characterId, backgroundId, background, mainEventId, mainEvent, childAge, childProfileId } = req.body;

    if (!characterId || (!backgroundId && !background) || (!mainEventId && !mainEvent)) {
      return res.status(400).json({
        success: false,
        message: "characterId와 배경/사건 정보(선택 또는 직접입력)가 필요합니다."
      });
    }

    const character = characterRouter.characters?.find(c => c.id === Number(characterId));
    if (!character) {
      return res.status(404).json({ success: false, message: "캐릭터를 찾을 수 없습니다." });
    }

    const resolvedBackground = background || storySettingRouter.presets?.backgrounds.find(b => b.id === backgroundId)?.name;
    const resolvedMainEvent = mainEvent || storySettingRouter.presets?.mainEvents.find(m => m.id === mainEventId)?.name;

    if (!resolvedBackground || !resolvedMainEvent) {
      return res.status(400).json({ success: false, message: "유효하지 않은 배경 또는 이벤트입니다." });
    }

    const setting = { background: resolvedBackground, mainEvent: resolvedMainEvent };

    const aiStory = await generateStoryPipeline({
      childAge: childAge || 6,
      character,
      setting
    });

    /*
    const savedStory = await saveStoryWithTransaction({
      childProfileId: childProfileId || 1,
      characterId: Number(characterId),
      childAge: childAge || 6,
      background: resolvedBackground,
      mainEvent: resolvedMainEvent,
      aiStory
    });
    return res.status(201).json({ success: true, data: savedStory });
    */

    res.status(201).json({
      success: true,
      message: "동화가 생성되었습니다.",
      data: {
        character: character.name,
        setting,
        ...aiStory
      }
    });

  } catch (error) {
    next(error);
  }
});

// 2. [Dev B] 내 책장 조회 (GET /api/stories) — 정렬/즐겨찾기필터/페이지네이션
router.get('/', authenticate, storyLibraryController.listValidation, storyLibraryController.list);

// 3. [금요일] 동화 상세 조회 API (GET /api/stories/:id)
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    /*
    const [storyRows] = await pool.execute(`
      SELECT s.story_id, s.title, sp.page_number, sp.content, spi.image_url, spt.audio_url
      FROM stories s
      JOIN story_pages sp ON s.story_id = sp.story_id
      LEFT JOIN story_page_illustrations spi ON sp.story_page_id = spi.story_page_id
      LEFT JOIN story_page_tts spt ON sp.story_page_id = spt.story_page_id
      WHERE s.story_id = ?
      ORDER BY sp.page_number ASC
    `, [id]);
    */

    res.status(200).json({
      success: true,
      data: {
        storyId: Number(id),
        title: "Toto's Adventure",
        pages: [
          {
            pageNumber: 1,
            content: "Once upon a time, there was a brave rabbit named Toto.",
            imageUrl: "/images/sample1.png",
            audioUrl: "/audio/sample1.wav"
          }
        ],
        choices: ["Go into the forest", "Return home"]
      }
    });
  } catch (error) {
    next(error);
  }
});

// 4. [Dev B] 동화 삭제 (DELETE /api/stories/:storyId)
router.delete('/:storyId', authenticate, storyLibraryController.deleteValidation, storyLibraryController.remove);

module.exports = router;