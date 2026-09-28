const { randomUUID } = require('crypto');
const { Op, literal } = require('sequelize');
const { StoryGenerationJob, Character } = require('../models');
const { generateStoryPipeline } = require('./storyGenerator');
const { saveStoryWithTransaction } = require('./story.service');

const POLL_MS = 2_000;
const LEASE_MS = 90_000;
const RENEW_MS = 20_000;

const available = (now) => ({
  [Op.or]: [
    { status: 'pending' },
    { status: 'processing', lease_until: { [Op.lt]: now } },
  ],
});

async function claimJob() {
  const now = new Date();
  const candidates = await StoryGenerationJob.findAll({
    where: available(now),
    order: [['created_at', 'ASC']],
    limit: 5,
  });
  for (const job of candidates) {
    const claimToken = randomUUID();
    const [updated] = await StoryGenerationJob.update({
      status: 'processing',
      claim_token: claimToken,
      lease_until: new Date(Date.now() + LEASE_MS),
      attempt_count: literal('attempt_count + 1'),
      error_message: null,
    }, { where: { job_id: job.job_id, ...available(now) } });
    if (updated === 1) return { job, claimToken };
  }
  return null;
}

async function processOneJob() {
  const claimed = await claimJob();
  if (!claimed) return false;
  const { job, claimToken } = claimed;
  const renew = setInterval(() => {
    StoryGenerationJob.update(
      { lease_until: new Date(Date.now() + LEASE_MS) },
      { where: { job_id: job.job_id, claim_token: claimToken, status: 'processing' } }
    ).catch((error) => console.error('[story-generation] 작업 임대 갱신 실패:', error));
  }, RENEW_MS);
  renew.unref();

  try {
    const input = typeof job.input_json === 'string' ? JSON.parse(job.input_json) : job.input_json;
    const character = await Character.findOne({
      where: {
        character_id: input.characterId,
        [Op.or]: [
          { type: 'PRESET', child_profile_id: null },
          { child_profile_id: input.childProfileId },
        ],
      },
    });
    if (!character) throw new Error('캐릭터를 찾을 수 없습니다.');

    const aiStory = await generateStoryPipeline({
      childAge: input.childAge,
      character,
      setting: { background: input.background, mainEvent: input.mainEvent },
    });
    await saveStoryWithTransaction({
      ...input,
      aiStory,
      jobId: job.job_id,
      claimToken,
    });
    console.log(`[story-generation] 작업 ${job.job_id} 완료`);
  } catch (error) {
    if (error.code !== 'STALE_STORY_JOB') {
      console.error(`[story-generation] 작업 ${job.job_id} 실패:`, error);
      await StoryGenerationJob.update({
        status: 'failed',
        error_message: '동화 생성에 실패했습니다. 새 요청 ID로 다시 시도해 주세요.',
        claim_token: null,
        lease_until: null,
      }, { where: { job_id: job.job_id, claim_token: claimToken, status: 'processing' } });
    }
  } finally {
    clearInterval(renew);
  }
  return true;
}

function startStoryGenerationWorker() {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await processOneJob();
    } catch (error) {
      console.error('[story-generation] 작업 조회 실패:', error);
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(tick, POLL_MS);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}

module.exports = { startStoryGenerationWorker, processOneJob };
