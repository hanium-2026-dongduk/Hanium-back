/** #40 캐릭터 소유권과 페이지네이션을 마이그레이션된 MySQL에서 확인한다. */
'use strict';

if (process.env.DB_NAME !== 'hanium_migration_check') {
  throw new Error('DB_NAME=hanium_migration_check 스모크 전용 DB에서만 실행할 수 있습니다.');
}

const assert = require('assert');
const request = require('supertest');
const { generateAccessToken } = require('../../src/utils/jwt');
const { sequelize, User, ChildProfile, Character } = require('../../src/models');
const app = require('../../src/app');

const expectStatus = (result, status) => {
  assert.strictEqual(result.status, status, JSON.stringify(result.body));
  return result.body.data;
};

async function main() {
  await sequelize.authenticate();
  const created = { users: [], profiles: [], characters: [] };
  try {
    const suffix = Date.now();
    const owner = await User.create({ email: `story_owner_${suffix}@example.com`, password_hash: 'smoke-only' });
    const stranger = await User.create({ email: `story_other_${suffix}@example.com`, password_hash: 'smoke-only' });
    created.users.push(owner.user_id, stranger.user_id);
    const ownChild = await ChildProfile.create({ user_id: owner.user_id, child_name: '첫째' });
    const otherChild = await ChildProfile.create({ user_id: stranger.user_id, child_name: '둘째' });
    created.profiles.push(ownChild.child_profile_id, otherChild.child_profile_id);
    const auth = (user) => (req) => req.set('Authorization', `Bearer ${generateAccessToken({ user_id: user.user_id, email: user.email, role: 'parent' })}`);
    const ownerAuth = auth(owner);

    const preset = await Character.create({ name: '공용', type: 'PRESET' });
    const own = await Character.create({ name: '내 캐릭터', type: 'CUSTOM', child_profile_id: ownChild.child_profile_id });
    const other = await Character.create({ name: '다른 아이', type: 'CUSTOM', child_profile_id: otherChild.child_profile_id });
    const orphan = await Character.create({ name: '소유자 불명', type: 'CUSTOM' });
    created.characters.push(preset.character_id, own.character_id, other.character_id, orphan.character_id);

    expectStatus(await request(app).get(`/api/characters?child_profile_id=${ownChild.child_profile_id}`), 401);
    const visible = expectStatus(await ownerAuth(request(app).get(`/api/characters?child_profile_id=${ownChild.child_profile_id}`)), 200);
    const ids = new Set(visible.map((character) => character.character_id));
    assert.ok(ids.has(preset.character_id) && ids.has(own.character_id));
    assert.ok(!ids.has(other.character_id) && !ids.has(orphan.character_id));
    expectStatus(await ownerAuth(request(app).get(`/api/characters?child_profile_id=${otherChild.child_profile_id}`)), 404);

    const createdCharacter = expectStatus(await ownerAuth(request(app).post('/api/characters').send({
      child_profile_id: ownChild.child_profile_id, name: '신규', type: 'PRESET',
    })), 201);
    created.characters.push(createdCharacter.character_id);
    assert.strictEqual(createdCharacter.type, 'CUSTOM');
    assert.strictEqual(createdCharacter.child_profile_id, ownChild.child_profile_id);
    expectStatus(await ownerAuth(request(app).post('/api/characters').send({
      child_profile_id: otherChild.child_profile_id, name: '침범',
    })), 404);
    expectStatus(await ownerAuth(request(app).post('/api/stories').send({
      childProfileId: ownChild.child_profile_id,
      characterId: other.character_id,
      background: '숲', mainEvent: '탐험',
    })), 404);
    console.log('✓ 캐릭터 인증·자녀별 목록·생성·동화 사용 제한');

    expectStatus(await ownerAuth(request(app).get(`/api/stories?child_profile_id=${ownChild.child_profile_id}&page=2&limit=5&favorite=false`)), 200);
    expectStatus(await request(app).get('/api/stories/explore?page=2&limit=5'), 200);
    expectStatus(await ownerAuth(request(app).get(`/api/quizzes/attempts?child_profile_id=${ownChild.child_profile_id}&page=2&limit=5`)), 200);
    expectStatus(await ownerAuth(request(app).get(`/api/vocabulary?child_profile_id=${ownChild.child_profile_id}&page=2&limit=5`)), 200);
    console.log('✓ MySQL 목록 페이지네이션');
  } finally {
    await Character.destroy({ where: { character_id: created.characters } });
    await ChildProfile.destroy({ where: { child_profile_id: created.profiles } });
    await User.destroy({ where: { user_id: created.users } });
    await sequelize.close();
  }
}

main().catch((error) => {
  console.error('동화 연동 MySQL 스모크 실패:', error);
  process.exitCode = 1;
});
