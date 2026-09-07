const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { generateStoryPipeline } = require('../services/storyGenerator');
const { saveStoryWithTransaction } = require('../services/story.service');
const characterRouter = require('./character.router');
const storySettingRouter = require('./storySetting.router');
const { authenticate } = require('../middlewares/auth');
const childService = require('../services/child.service');
const storyLibraryController = require('../controllers/storyLibrary.controller');
const response = require('../utils/response');
const missionService = require('../services/mission.service');

// 1. 동화 생성 및 트랜잭션 저장 API (POST /api/stories)
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { characterId, backgroundId, background, mainEventId, mainEvent, childAge, childProfileId } = req.body;

    if (!childProfileId) {
      return response.error(res, 400, 'childProfileId가 필요합니다.');
    }
    // 소유권 검증 — 미소유/미존재 시 404 (child.service.js의 getById가 던짐)
    await childService.getById(req.user.user_id, childProfileId);

    if (!characterId || (!backgroundId && !background) || (!mainEventId && !mainEvent)) {
      return response.error(res, 400, 'characterId와 배경/사건 정보(선택 또는 직접입력)가 필요합니다.');
    }

    const character = characterRouter.characters?.find(c => c.id === Number(characterId));
    if (!character) {
      return response.error(res, 404, '캐릭터를 찾을 수 없습니다.');
    }

    const resolvedBackground = background || storySettingRouter.presets?.backgrounds.find(b => b.id === backgroundId)?.name;
    const resolvedMainEvent = mainEvent || storySettingRouter.presets?.mainEvents.find(m => m.id === mainEventId)?.name;

    if (!resolvedBackground || !resolvedMainEvent) {
      return response.error(res, 400, '유효하지 않은 배경 또는 이벤트입니다.');
    }

    const setting = { background: resolvedBackground, mainEvent: resolvedMainEvent };

    const aiStory = await generateStoryPipeline({
      childAge: childAge || 6,
      character,
      setting
    });

    const savedStory = await saveStoryWithTransaction({
      childProfileId,
      characterId: Number(characterId),
      childAge: childAge || 6,
      background: resolvedBackground,
      mainEvent: resolvedMainEvent,
      aiStory
    });

    return response.success(res, 201, '동화가 생성되었습니다.', {
      character: character.name,
      setting,
      ...savedStory
    });

  } catch (error) {
    if (error.statusCode) return response.error(res, error.statusCode, error.message);
    next(error);
  }
});

// 2. 내 책장 조회 (GET /api/stories) — 정렬/즐겨찾기필터/페이지네이션
router.get('/', authenticate, storyLibraryController.listValidation, storyLibraryController.list);

// 3. 공개 동화 탐색 (GET /api/stories/explore) — /:id보다 반드시 앞에 위치
router.get('/explore', storyLibraryController.exploreValidation, storyLibraryController.explore);

// 4. 동화 상세 조회 API (GET /api/stories/:id)
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const childProfileId = req.query.child_profile_id;

    if (!childProfileId) {
      return response.error(res, 400, 'child_profile_id 쿼리 파라미터가 필요합니다.');
    }
    await childService.getById(req.user.user_id, childProfileId);

    const [storyRows] = await pool.execute(
      `SELECT s.story_id, s.title, sp.page_number, sp.content, spi.image_url, spt.audio_url
       FROM stories s
       JOIN story_pages sp ON s.story_id = sp.story_id
       LEFT JOIN story_page_illustrations spi ON sp.story_page_id = spi.story_page_id
       LEFT JOIN story_page_tts spt ON sp.story_page_id = spt.story_page_id
       WHERE s.story_id = ? AND s.child_profile_id = ?
       ORDER BY sp.page_number ASC`,
      [id, childProfileId]
    );

    if (storyRows.length === 0) {
      return response.error(res, 404, '동화를 찾을 수 없습니다.');
    }

    // 미션 연동 (Week3 A 설계문서 6절 계약): 조회 성공 시 story_read 이벤트 기록.
    // 읽기 API 자체를 막으면 안 되므로 best-effort로 처리 — 실패해도 조회 응답에는
    // 영향을 주지 않는다.
    missionService
      .recordProgress({
        childProfileId,
        eventType: 'story_read',
        eventId: `story_read:${id}:${childProfileId}`,
      })
      .catch((err) => console.error('[mission] story_read 기록 실패:', err.message));

    return response.success(res, 200, '동화 상세를 조회했습니다.', {
      storyId: storyRows[0].story_id,
      title: storyRows[0].title,
      pages: storyRows.map((row) => ({
        pageNumber: row.page_number,
        content: row.content,
        imageUrl: row.image_url,
        audioUrl: row.audio_url,
      })),
    });
  } catch (error) {
    if (error.statusCode) return response.error(res, error.statusCode, error.message);
    next(error);
  }
});

// 5. 공개/비공개 설정 (PUT /api/stories/:storyId/public)
router.put('/:storyId/public', authenticate, storyLibraryController.togglePublicValidation, storyLibraryController.togglePublic);

// 6. 동화 삭제 (DELETE /api/stories/:storyId)
router.delete('/:storyId', authenticate, storyLibraryController.deleteValidation, storyLibraryController.remove);

module.exports = router;