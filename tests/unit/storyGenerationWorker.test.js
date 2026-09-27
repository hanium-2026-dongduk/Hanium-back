jest.mock('../../src/models', () => ({
  StoryGenerationJob: { findAll: jest.fn(), update: jest.fn() },
  Character: { findOne: jest.fn() },
}));
jest.mock('../../src/services/storyGenerator', () => ({ generateStoryPipeline: jest.fn() }));
jest.mock('../../src/services/story.service', () => ({ saveStoryWithTransaction: jest.fn() }));

const { StoryGenerationJob, Character } = require('../../src/models');
const { generateStoryPipeline } = require('../../src/services/storyGenerator');
const { saveStoryWithTransaction } = require('../../src/services/story.service');
const { processOneJob } = require('../../src/services/storyGenerationWorker');

const input = { childProfileId: 2, characterId: 3, childAge: 6, background: '숲', mainEvent: '탐험' };

beforeEach(() => {
  jest.clearAllMocks();
  StoryGenerationJob.findAll.mockResolvedValue([{ job_id: 7, input_json: input }]);
  StoryGenerationJob.update.mockResolvedValue([1]);
  Character.findOne.mockResolvedValue({ character_id: 3, name: '토리' });
  generateStoryPipeline.mockResolvedValue({ title: '모험', pages: [] });
  saveStoryWithTransaction.mockResolvedValue({ storyId: 9 });
});

test('선점한 작업의 동화를 저장하고 완료 처리를 트랜잭션 저장 함수에 위임한다', async () => {
  await expect(processOneJob()).resolves.toBe(true);
  expect(generateStoryPipeline).toHaveBeenCalledWith({
    childAge: 6,
    character: expect.objectContaining({ character_id: 3 }),
    setting: { background: '숲', mainEvent: '탐험' },
  });
  expect(saveStoryWithTransaction).toHaveBeenCalledWith(expect.objectContaining({
    ...input, jobId: 7, claimToken: expect.any(String),
  }));
  expect(StoryGenerationJob.update).toHaveBeenCalledTimes(1);
});

test('AI 생성 실패는 조회 가능한 실패 상태로 기록한다', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  generateStoryPipeline.mockRejectedValue(new Error('AI unavailable'));
  try {
    await expect(processOneJob()).resolves.toBe(true);
    expect(StoryGenerationJob.update).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ status: 'failed' }),
      expect.objectContaining({ where: expect.objectContaining({ job_id: 7, status: 'processing' }) })
    );
  } finally {
    log.mockRestore();
  }
});

test('임대권을 잃은 워커는 완료된 작업을 실패로 덮어쓰지 않는다', async () => {
  saveStoryWithTransaction.mockRejectedValue(Object.assign(new Error('stale'), { code: 'STALE_STORY_JOB' }));
  await expect(processOneJob()).resolves.toBe(true);
  expect(StoryGenerationJob.update).toHaveBeenCalledTimes(1);
});
