/** #40 비동기 생성·멱등성·상세 응답을 실제 MySQL에서 확인한다. AI 호출은 하지 않는다. */
'use strict';

if (process.env.DB_NAME !== 'hanium_migration_check') {
  throw new Error('DB_NAME=hanium_migration_check 스모크 전용 DB에서만 실행할 수 있습니다.');
}

const assert = require('assert');
const request = require('supertest');
const pool = require('../../src/config/db');
const { generateAccessToken } = require('../../src/utils/jwt');
const { sequelize, User, ChildProfile, Character, Story, StoryGenerationJob } = require('../../src/models');
const { saveStoryWithTransaction, getStoryDetail } = require('../../src/services/story.service');
const app = require('../../src/app');

const expectStatus = (result, status) => {
  assert.strictEqual(result.status, status, JSON.stringify(result.body));
  return result.body.data;
};

async function main() {
  await sequelize.authenticate();
  const created = { users: [], profiles: [], characters: [], jobs: [], stories: [] };
  try {
    const suffix = Date.now();
    const owner = await User.create({ email: `generation_owner_${suffix}@example.com`, password_hash: 'smoke-only' });
    const other = await User.create({ email: `generation_other_${suffix}@example.com`, password_hash: 'smoke-only' });
    created.users.push(owner.user_id, other.user_id);
    const child = await ChildProfile.create({ user_id: owner.user_id, child_name: '테스트 자녀' });
    created.profiles.push(child.child_profile_id);
    const character = await Character.create({ name: '토리', type: 'CUSTOM', child_profile_id: child.child_profile_id });
    created.characters.push(character.character_id);
    const auth = (user) => (req) => req.set('Authorization', `Bearer ${generateAccessToken({ user_id: user.user_id, email: user.email, role: 'parent' })}`);
    const ownerAuth = auth(owner);
    const input = {
      childProfileId: child.child_profile_id,
      characterId: character.character_id,
      childAge: 6,
      background: '숲',
      mainEvent: '탐험',
    };
    const requestId = `smoke-${suffix}`;
    const submit = (body) => ownerAuth(request(app).post('/api/stories').set('Idempotency-Key', requestId).send(body));

    const first = expectStatus(await submit(input), 202);
    created.jobs.push(first.jobId);
    assert.strictEqual(first.status, 'pending');
    assert.strictEqual(expectStatus(await submit(input), 202).jobId, first.jobId);
    expectStatus(await submit({ ...input, background: '바다' }), 409);
    assert.strictEqual(expectStatus(await ownerAuth(request(app).get(`/api/stories/generations/${first.jobId}`)), 200).status, 'pending');
    expectStatus(await auth(other)(request(app).get(`/api/stories/generations/${first.jobId}`)), 404);
    console.log('✓ 요청 ID 재사용·충돌·타 계정 작업 조회 차단');

    const claimToken = 'ci-story-generation-claim';
    await StoryGenerationJob.update({ status: 'processing', claim_token: claimToken, lease_until: new Date(Date.now() + 60_000) }, { where: { job_id: first.jobId } });
    const aiStory = {
      title: '숲속 모험',
      pages: [{ pageNumber: 1, content: 'Hello forest', imageUrl: '/images/cover.png', audioUrl: '/audio/page1.wav' }],
      choices: ['계속 걷기', '돌아가기'],
    };
    const saved = await saveStoryWithTransaction({ ...input, aiStory, jobId: first.jobId, claimToken });
    created.stories.push(saved.storyId);
    const completed = expectStatus(await ownerAuth(request(app).get(`/api/stories/generations/${first.jobId}`)), 200);
    assert.strictEqual(completed.status, 'completed');
    assert.strictEqual(completed.storyId, saved.storyId);

    const detail = await getStoryDetail(saved.storyId, child.child_profile_id);
    assert.strictEqual(detail.character, '토리');
    assert.deepStrictEqual(detail.setting, { background: '숲', mainEvent: '탐험' });
    assert.strictEqual(detail.coverImageUrl, '/images/cover.png');
    assert.deepStrictEqual(detail.choices, ['계속 걷기', '돌아가기']);

    await assert.rejects(
      () => saveStoryWithTransaction({ ...input, aiStory, jobId: first.jobId, claimToken }),
      (error) => error.code === 'STALE_STORY_JOB'
    );
    assert.strictEqual(await Story.count({ where: { child_profile_id: child.child_profile_id } }), 1);
    console.log('✓ 작업 완료·동화 저장 원자성·상세 응답·중복 저장 차단');
  } finally {
    try {
      await StoryGenerationJob.destroy({ where: { job_id: created.jobs } });
      await Story.destroy({ where: { story_id: created.stories } });
      await Character.destroy({ where: { character_id: created.characters } });
      await ChildProfile.destroy({ where: { child_profile_id: created.profiles } });
      await User.destroy({ where: { user_id: created.users } });
    } finally {
      await Promise.all([sequelize.close(), pool.end()]);
    }
  }
}

main().catch((error) => {
  console.error('동화 생성 MySQL 스모크 실패:', error);
  process.exitCode = 1;
});
