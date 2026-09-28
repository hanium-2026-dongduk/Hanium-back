const express = require('express');
const router = express.Router();
const { generateStoryPipeline } = require('../services/storyGenerator');
const { saveStoryWithTransaction, getStoryDetail } = require('../services/story.service');
const { enqueueStory, getStoryGenerationJob } = require('../services/storyGenerationJob.service');
const storySettingRouter = require('./storySetting.router');
const { authenticate } = require('../middlewares/auth');
const childService = require('../services/child.service');
const storyLibraryController = require('../controllers/storyLibrary.controller');
const response = require('../utils/response');
const missionService = require('../services/mission.service');
const badgeService = require('../services/badge.service');
const { Character, StoryReadLog } = require('../models');
const { Op } = require('sequelize');

const statusError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

async function resolveStoryInput(req) {
  const { characterId, backgroundId, background, mainEventId, mainEvent, childAge, childProfileId, imageStyle, keyword } = req.body;
  if (!Number.isSafeInteger(Number(childProfileId)) || Number(childProfileId) < 1) {
    throw statusError(400, 'childProfileId가 필요합니다.');
  }
  await childService.getById(req.user.user_id, childProfileId);
  if (!Number.isSafeInteger(Number(characterId)) || Number(characterId) < 1 ||
      (!backgroundId && !background) || (!mainEventId && !mainEvent)) {
    throw statusError(400, 'characterId와 배경/사건 정보(선택 또는 직접입력)가 필요합니다.');
  }

  const character = await Character.findOne({
    where: {
      character_id: characterId,
      [Op.or]: [
        { type: 'PRESET', child_profile_id: null },
        { child_profile_id: childProfileId },
      ],
    },
  });
  if (!character) throw statusError(404, '캐릭터를 찾을 수 없습니다.');

  const resolvedBackground = background || storySettingRouter.presets?.backgrounds.find((b) => b.id === backgroundId)?.name;
  const resolvedMainEvent = mainEvent || storySettingRouter.presets?.mainEvents.find((m) => m.id === mainEventId)?.name;
  if (typeof resolvedBackground !== 'string' || !resolvedBackground.trim() || resolvedBackground.length > 255 ||
      typeof resolvedMainEvent !== 'string' || !resolvedMainEvent.trim() || resolvedMainEvent.length > 255) {
    throw statusError(400, '유효하지 않은 배경 또는 이벤트입니다.');
  }
  const age = childAge === undefined ? 6 : Number(childAge);
  if (!Number.isInteger(age) || age < 1 || age > 18) {
    throw statusError(400, 'childAge는 1~18 사이의 정수여야 합니다.');
  }

  // back#40 6번: 그림체·키워드는 선택값. 있으면 형식만 검증하고, 저장은 안 하고
  // generateStoryPipeline 프롬프트에만 반영한다(스키마 변경 불필요).
  if (imageStyle !== undefined && (typeof imageStyle !== 'string' || imageStyle.length > 50)) {
    throw statusError(400, 'imageStyle은 50자 이하의 문자열이어야 합니다.');
  }
  if (keyword !== undefined && (typeof keyword !== 'string' || keyword.length > 500)) {
    throw statusError(400, 'keyword는 500자 이하의 문자열이어야 합니다.');
  }

  return {
    input: {
      childProfileId: Number(childProfileId),
      characterId: Number(characterId),
      childAge: age,
      background: resolvedBackground,
      mainEvent: resolvedMainEvent,
      ...(imageStyle ? { imageStyle } : {}),
      ...(keyword ? { keyword } : {}),
    },
    character,
  };
}

/**
 * @openapi
 * /stories:
 *   post:
 *     tags: [동화 생성]
 *     summary: 동화 생성 (Idempotency-Key가 있으면 비동기 접수)
 *     description: 같은 보호자와 키로 같은 입력을 재전송하면 기존 작업을 반환한다. 헤더를 생략하면 기존 동기 생성 응답을 반환한다.
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         schema: { type: string, pattern: '^[A-Za-z0-9_.:-]{1,100}$' }
 *         description: 비동기 생성에 사용할 요청별 고유 키. 같은 요청 재시도 시 같은 키를 사용한다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [childProfileId, characterId]
 *             properties:
 *               childProfileId: { type: integer, minimum: 1 }
 *               characterId: { type: integer, minimum: 1 }
 *               childAge: { type: integer, minimum: 1, maximum: 18, default: 6 }
 *               backgroundId: { type: string, description: 배경 프리셋 ID. background와 둘 중 하나 필요 }
 *               background: { type: string, maxLength: 255 }
 *               mainEventId: { type: string, description: 사건 프리셋 ID. mainEvent와 둘 중 하나 필요 }
 *               mainEvent: { type: string, maxLength: 255 }
 *               imageStyle: { type: string, maxLength: 50, description: '그림체 (예: 아동풍, 리얼풍, 수채화풍, 3D 애니메이션)' }
 *               keyword: { type: string, maxLength: 500, description: '아이가 입력한 짧은 상세 이야기' }
 *     responses:
 *       201: { description: 헤더 생략 시 동기 생성 결과를 data에 반환 }
 *       202: { description: 비동기 작업의 jobId·status·storyId를 data에 반환. Location 헤더에 조회 경로 포함 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
// 1. 동화 생성 및 트랜잭션 저장 API (POST /api/stories)
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { input, character } = await resolveStoryInput(req);
    if (req.headers['idempotency-key'] !== undefined) {
      const job = await enqueueStory({
        userId: req.user.user_id,
        requestId: req.headers['idempotency-key'],
        input,
      });
      res.set('Location', `/api/stories/generations/${job.jobId}`);
      return response.success(res, 202, '동화 생성 작업을 접수했습니다.', job);
    }

    const aiStory = await generateStoryPipeline({
      childAge: input.childAge,
      character,
      setting: { background: input.background, mainEvent: input.mainEvent },
      imageStyle: input.imageStyle,
      keyword: input.keyword,
    });

    const savedStory = await saveStoryWithTransaction({ ...input, aiStory });

    return response.success(res, 201, '동화가 생성되었습니다.', {
      character: character.name,
      setting: { background: input.background, mainEvent: input.mainEvent },
      ...savedStory,
    });

  } catch (error) {
    if (error.statusCode) return response.error(res, error.statusCode, error.message);
    next(error);
  }
});

/**
 * @openapi
 * /stories:
 *   get:
 *     tags: [동화 생성]
 *     summary: 내 자녀의 동화 책장 조회
 *     parameters:
 *       - in: query
 *         name: child_profile_id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - in: query
 *         name: favorite
 *         schema: { type: boolean }
 *     responses:
 *       200: { description: '동화 목록(storyId·title·isFavorite·coverImageUrl·createdAt)과 pagination을 data에 반환. coverImageUrl은 첫 페이지 삽화가 없으면 null' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
// 2. 내 책장 조회 (GET /api/stories) — 정렬/즐겨찾기필터/페이지네이션
router.get('/', authenticate, storyLibraryController.listValidation, storyLibraryController.list);

/**
 * @openapi
 * /stories/explore:
 *   get:
 *     tags: [동화 생성]
 *     summary: 공개 동화 탐색
 *     security: []
 *     responses:
 *       200: { description: 공개 동화 목록과 pagination을 data에 반환 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 */
// 3. 공개 동화 탐색 (GET /api/stories/explore) — /:id보다 반드시 앞에 위치
router.get('/explore', storyLibraryController.exploreValidation, storyLibraryController.explore);

/**
 * @openapi
 * /stories/generations/{jobId}:
 *   get:
 *     tags: [동화 생성]
 *     summary: 비동기 동화 생성 상태 조회
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: jobId·status(pending/processing/completed/failed)·storyId와 실패 시 errorMessage를 data에 반환 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
// 비동기 생성 작업은 보호자 계정별로만 조회할 수 있다.
router.get('/generations/:jobId', authenticate, async (req, res, next) => {
  try {
    const job = await getStoryGenerationJob(req.user.user_id, req.params.jobId);
    return response.success(res, 200, '동화 생성 작업을 조회했습니다.', job);
  } catch (error) {
    if (error.statusCode) return response.error(res, error.statusCode, error.message);
    return next(error);
  }
});

/**
 * @openapi
 * /stories/{id}:
 *   get:
 *     tags: [동화 생성]
 *     summary: 저장된 동화 상세 조회
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: child_profile_id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: storyId·title·character·setting·coverImageUrl·pages·choices를 data에 반환 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
// 4. 동화 상세 조회 API (GET /api/stories/:id)
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const childProfileId = req.query.child_profile_id;

    if (!childProfileId) {
      return response.error(res, 400, 'child_profile_id 쿼리 파라미터가 필요합니다.');
    }
    await childService.getById(req.user.user_id, childProfileId);

    const story = await getStoryDetail(id, childProfileId);

    // 미션 연동 (Week3 A 설계문서 6절 계약): 조회 성공 시 story_read 이벤트 기록.
    // 읽기 API 자체를 막으면 안 되므로 best-effort로 처리 — 실패해도 조회 응답에는
    // 영향을 주지 않는다.
    StoryReadLog.findOrCreate({
    where: { child_profile_id: childProfileId, story_id: id },
    defaults: { created_at: new Date() },
    })
  .then(async ([, created]) => {
    if (created) {
      // 이 자녀가 이 동화를 처음 읽은 경우에만 미션 진행도 반영
      try {
        await missionService.recordProgress({
          childProfileId,
          eventType: 'story_read',
          eventId: `story_read:${id}:${childProfileId}`,
        });
      } catch (err) {
        console.error('[mission] story_read 기록 실패:', err.message);
      }
      await badgeService.evaluateQuietly(childProfileId);
    }
  })
  .catch((err) => console.error('[activity] story_read 기록 실패:', err.message));

    return response.success(res, 200, '동화 상세를 조회했습니다.', story);
  } catch (error) {
    if (error.statusCode) return response.error(res, error.statusCode, error.message);
    next(error);
  }
});

/**
 * @openapi
 * /stories/{storyId}/public:
 *   put:
 *     tags: [동화 생성]
 *     summary: 내 자녀 동화의 공개 여부 설정
 *     parameters:
 *       - in: path
 *         name: storyId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: 변경된 공개 여부를 data에 반환 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
// 5. 공개/비공개 설정 (PUT /api/stories/:storyId/public)
router.put('/:storyId/public', authenticate, storyLibraryController.togglePublicValidation, storyLibraryController.togglePublic);

/**
 * @openapi
 * /stories/{storyId}:
 *   delete:
 *     tags: [동화 생성]
 *     summary: 내 자녀의 동화 삭제
 *     parameters:
 *       - in: path
 *         name: storyId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: 삭제 완료 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
// 6. 동화 삭제 (DELETE /api/stories/:storyId)
router.delete('/:storyId', authenticate, storyLibraryController.deleteValidation, storyLibraryController.remove);

module.exports = router;
