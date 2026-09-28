const { createHash } = require('crypto');
const { StoryGenerationJob } = require('../models');

const publicJob = (job) => ({
  jobId: job.job_id,
  status: job.status,
  storyId: job.story_id || null,
  ...(job.status === 'failed' ? { errorMessage: job.error_message } : {}),
});

const statusError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

async function enqueueStory({ userId, requestId, input }) {
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_.:-]{1,100}$/.test(requestId)) {
    throw statusError(400, 'Idempotency-Key 헤더가 올바르지 않습니다.');
  }

  const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const [job] = await StoryGenerationJob.findOrCreate({
    where: { user_id: userId, request_id: requestId },
    defaults: {
      user_id: userId,
      child_profile_id: input.childProfileId,
      request_id: requestId,
      request_hash: requestHash,
      input_json: input,
      status: 'pending',
    },
  });
  if (job.request_hash !== requestHash) {
    throw statusError(409, '이미 다른 동화 생성 요청에 사용한 Idempotency-Key입니다.');
  }
  return publicJob(job);
}

async function getStoryGenerationJob(userId, jobId) {
  if (!/^\d+$/.test(String(jobId))) {
    throw statusError(400, '작업 ID가 올바르지 않습니다.');
  }
  const job = await StoryGenerationJob.findOne({ where: { job_id: jobId, user_id: userId } });
  if (!job) throw statusError(404, '동화 생성 작업을 찾을 수 없습니다.');
  return publicJob(job);
}

module.exports = { enqueueStory, getStoryGenerationJob };
