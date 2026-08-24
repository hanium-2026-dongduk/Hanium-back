/**
 * Week 2(개발자 A) 범위 — 자녀 프로필 / AU03(ID·PW 찾기) / 보호자 PIN·재인증 / 사용 시간
 * heartbeat — 를 실제 MySQL + 실제 HTTP 요청(supertest)으로 검증하는 스모크 테스트.
 *
 * tests/smoke/auth.smoke.js와 동일한 방식(실 DB, 목이 아닌 서비스 전체)을 따르되 Week1
 * 범위(회원가입/로그인/refresh)는 건드리지 않고 Week2 범위만 다룬다.
 *
 * 사용법:
 *   DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=hanium_smoke DB_USER=root DB_PASSWORD= \
 *     node tests/smoke/week2.smoke.js
 *
 * 주의: DB_NAME으로 지정한 데이터베이스에 대해 sequelize.sync({ force: true })를 실행해
 * 기존 테이블을 모두 삭제하고 새로 만든다. 스모크 테스트 전용 빈 데이터베이스를 사용해야 한다.
 */

'use strict';

const nodemailerPath = require.resolve('nodemailer');
require.cache[nodemailerPath] = {
  id: nodemailerPath,
  filename: nodemailerPath,
  loaded: true,
  exports: {
    createTransport: () => ({
      sendMail: async (opts) => {
        console.log(`  [stub-mailer] to=${opts.to} subject="${opts.subject}"`);
        return { accepted: [opts.to] };
      },
    }),
  },
};

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'smoke-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'smoke-refresh-secret';

if (!process.env.DB_NAME) {
  console.error('DB_NAME 환경변수가 필요합니다 (스모크 테스트 전용 빈 DB를 지정하세요).');
  process.exit(1);
}

const assert = require('assert');
const request = require('supertest');

let passCount = 0;
let failCount = 0;

async function step(name, fn) {
  try {
    await fn();
    passCount += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failCount += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function main() {
  const { sequelize, EmailVerification, GuardianSetting, ChildProfile, UsageDailySummary } = require('../../src/models');
  const app = require('../../src/app');

  console.log(`DB(${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME})에 연결 확인 중...`);
  await sequelize.authenticate();
  console.log('연결 성공. 스키마를 초기화합니다 (force sync)...');
  await sequelize.sync({ force: true });

  // 참고: child_profiles의 "유저당 활성 프로필 1개" DB 제약(생성 컬럼 + UNIQUE 인덱스,
  // db/migrations/0003)은 여기서는 적용하지 않는다 — sequelize.sync()는 모델 연관관계로부터
  // FK를 먼저 만드는데, user_id에 FK가 이미 걸린 뒤에는 그 컬럼에 의존하는 STORED 생성
  // 컬럼을 추가할 수 없다(MySQL 제약). 실제 배포는 db/migrations/*.sql을 순서대로 적용하므로
  // (생성 컬럼이 FK보다 먼저 생김, 0003 → 0006) 문제가 없고, 그 정확한 순서/제약 자체는
  // tests/smoke/migration.smoke.js가 이미 검증한다. 이 스모크 테스트에서는 그 DB 제약과
  // 별개로 서비스 레벨(트랜잭션 + 행 잠금)만으로도 활성 프로필이 유저당 1개로 유지되는지를
  // 확인한다.

  const signupAndLogin = async (emailPrefix) => {
    const email = `${emailPrefix}_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
    const password = 'abcd1234!';

    await request(app).post('/api/auth/email/send').send({ email });
    const verification = await EmailVerification.findOne({
      where: { email, purpose: 'signup', is_verified: false },
      order: [['created_at', 'DESC']],
    });
    await request(app).post('/api/auth/email/verify').send({ email, code: verification.code });
    await request(app).post('/api/auth/signup').send({ email, password });
    const loginRes = await request(app).post('/api/auth/login').send({ email, password });

    return {
      email,
      password,
      userId: loginRes.body.data.user.user_id,
      accessToken: loginRes.body.data.accessToken,
      refreshToken: loginRes.body.data.refreshToken,
    };
  };

  const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

  // ---- 사용자 두 명 준비 (소유권/격리 테스트용) ----
  const userA = await signupAndLogin('userA');
  const userB = await signupAndLogin('userB');

  // =========================================================================
  // 1. 자녀 프로필
  // =========================================================================

  let profileA1;
  let profileA2;

  await step('최초 자녀 프로필 생성 시 자동으로 활성화된다', async () => {
    const res = await request(app)
      .post('/api/children')
      .set(authHeader(userA.accessToken))
      .send({ child_name: '첫째' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.profile.is_active, true);
    profileA1 = res.body.data.profile;
  });

  await step('두 번째 자녀 프로필은 비활성 상태로 생성된다', async () => {
    const res = await request(app)
      .post('/api/children')
      .set(authHeader(userA.accessToken))
      .send({ child_name: '둘째' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.profile.is_active, false);
    profileA2 = res.body.data.profile;
  });

  await step('다른 유저는 남의 자녀 프로필을 조회/수정/삭제할 수 없다 (404)', async () => {
    const get = await request(app)
      .get(`/api/children/${profileA1.child_profile_id}`)
      .set(authHeader(userB.accessToken));
    assert.strictEqual(get.status, 404);

    const put = await request(app)
      .put(`/api/children/${profileA1.child_profile_id}`)
      .set(authHeader(userB.accessToken))
      .send({ child_name: '해킹시도' });
    assert.strictEqual(put.status, 404);

    const del = await request(app)
      .delete(`/api/children/${profileA1.child_profile_id}`)
      .set(authHeader(userB.accessToken));
    assert.strictEqual(del.status, 404);
  });

  await step(':id가 양의 정수가 아니면 400', async () => {
    const res = await request(app).get('/api/children/not-a-number').set(authHeader(userA.accessToken));
    assert.strictEqual(res.status, 400);
  });

  await step('빈 PUT 요청은 거부된다', async () => {
    const res = await request(app)
      .put(`/api/children/${profileA1.child_profile_id}`)
      .set(authHeader(userA.accessToken))
      .send({});
    assert.strictEqual(res.status, 400);
  });

  await step('활성 프로필 전환: 대상만 활성화되고 나머지는 비활성화된다', async () => {
    const res = await request(app)
      .patch(`/api/children/${profileA2.child_profile_id}/activate`)
      .set(authHeader(userA.accessToken));
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const rows = await ChildProfile.findAll({ where: { user_id: userA.userId } });
    const activeRows = rows.filter((r) => r.is_active);
    assert.strictEqual(activeRows.length, 1);
    assert.strictEqual(activeRows[0].child_profile_id, profileA2.child_profile_id);
  });

  await step('동시에 서로 다른 프로필을 활성화해도 정확히 하나만 활성 상태로 남는다 (트랜잭션 + 행 잠금)', async () => {
    const [r1, r2] = await Promise.all([
      request(app).patch(`/api/children/${profileA1.child_profile_id}/activate`).set(authHeader(userA.accessToken)),
      request(app).patch(`/api/children/${profileA2.child_profile_id}/activate`).set(authHeader(userA.accessToken)),
    ]);
    assert.strictEqual(r1.status, 200, JSON.stringify(r1.body));
    assert.strictEqual(r2.status, 200, JSON.stringify(r2.body));

    const rows = await ChildProfile.findAll({ where: { user_id: userA.userId } });
    const activeRows = rows.filter((r) => r.is_active);
    assert.strictEqual(
      activeRows.length,
      1,
      `동시 활성화 이후 활성 프로필이 정확히 1개여야 합니다 (실제: ${activeRows.length})`
    );
  });

  await step('활성 프로필을 삭제해도 다른 프로필이 자동으로 활성화되지 않는다', async () => {
    const rowsBefore = await ChildProfile.findAll({ where: { user_id: userA.userId } });
    const activeBefore = rowsBefore.find((r) => r.is_active);

    const res = await request(app)
      .delete(`/api/children/${activeBefore.child_profile_id}`)
      .set(authHeader(userA.accessToken));
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const rowsAfter = await ChildProfile.findAll({ where: { user_id: userA.userId } });
    const activeAfter = rowsAfter.filter((r) => r.is_active);
    assert.strictEqual(activeAfter.length, 0, '삭제 후 다른 프로필이 자동으로 활성화되면 안 됩니다.');
  });

  // 이후 usage 테스트를 위해 자녀 프로필 하나를 다시 활성화해둔다.
  const remaining = await ChildProfile.findAll({ where: { user_id: userA.userId } });
  await request(app)
    .patch(`/api/children/${remaining[0].child_profile_id}/activate`)
    .set(authHeader(userA.accessToken));
  const childA = remaining[0];

  // =========================================================================
  // 2. ID 찾기(제거됨) / 비밀번호 재설정 (AU03)
  // =========================================================================

  await step('POST /api/auth/find-email 라우트는 더 이상 존재하지 않는다', async () => {
    const res = await request(app).post('/api/auth/find-email').send({ child_name: '아무개' });
    assert.strictEqual(res.status, 404);
  });

  await step('회원가입 인증코드(purpose:signup)는 비밀번호 재설정에 사용할 수 없다', async () => {
    const email = `crosspurpose_${Date.now()}@example.com`;
    await request(app).post('/api/auth/email/send').send({ email });
    const rec = await EmailVerification.findOne({
      where: { email, purpose: 'signup' },
      order: [['created_at', 'DESC']],
    });

    const res = await request(app)
      .put('/api/auth/password/reset')
      .send({ email, code: rec.code, newPassword: 'whatever123!' });

    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await step('존재하지 않는 이메일로 재설정을 요청해도 동일한 응답을 주고 레코드를 만들지 않는다', async () => {
    const email = `nobody_${Date.now()}@example.com`;
    const res = await request(app).post('/api/auth/password/reset-request').send({ email });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const rec = await EmailVerification.findOne({ where: { email, purpose: 'password_reset' } });
    assert.strictEqual(rec, null, '존재하지 않는 이메일인데 인증 레코드가 생성되면 계정 열거에 악용될 수 있습니다.');
  });

  let resetCode;
  await step('가입된 이메일로 재설정 요청 시 purpose:password_reset 코드가 발급된다', async () => {
    const res = await request(app).post('/api/auth/password/reset-request').send({ email: userB.email });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const rec = await EmailVerification.findOne({
      where: { email: userB.email, purpose: 'password_reset', is_verified: false },
      order: [['created_at', 'DESC']],
    });
    assert.ok(rec);
    resetCode = rec.code;
  });

  await step('올바른 코드로 비밀번호를 재설정하면 새 비밀번호로 로그인할 수 있고 기존 비밀번호는 실패한다', async () => {
    const res = await request(app)
      .put('/api/auth/password/reset')
      .send({ email: userB.email, code: resetCode, newPassword: 'newpass123!' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: userB.email, password: userB.password });
    assert.strictEqual(oldLogin.status, 401);

    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: userB.email, password: 'newpass123!' });
    assert.strictEqual(newLogin.status, 200, JSON.stringify(newLogin.body));

    userB.password = 'newpass123!';
    userB.accessToken = newLogin.body.data.accessToken;
  });

  await step('재설정 성공 후 재설정 이전에 발급된 refresh token은 모두 폐기된다', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: userB.refreshToken });
    assert.strictEqual(res.status, 401, JSON.stringify(res.body));
  });

  await step('이미 소비된 재설정 코드는 재사용할 수 없다', async () => {
    const res = await request(app)
      .put('/api/auth/password/reset')
      .send({ email: userB.email, code: resetCode, newPassword: 'anotherpass1!' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  // =========================================================================
  // 3. 보호자 PIN + 재인증(reauth) + guardian token pin_version 무효화
  // =========================================================================

  let reauthToken;
  let guardianTokenBeforeChange;
  let reauthTokenForChange;
  let guardianToken;

  await step(
    '[권한 상승 차단] access token만으로는 최초 PIN 설정을 할 수 없다 (reauth 필요)',
    async () => {
      const res = await request(app)
        .put('/api/guardian/pin')
        .set(authHeader(userA.accessToken))
        .send({ pin: '1234' });
      assert.strictEqual(res.status, 401, JSON.stringify(res.body));
    }
  );

  await step(
    '[권한 상승 차단] access token만으로는 PIN 설정→검증→guardianToken 획득 흐름을 완성할 수 없다',
    async () => {
      // 최초 설정 자체가 위에서 이미 401로 막히므로, verify로 넘어갈 PIN이 애초에
      // 존재하지 않는다 — 자녀가 access token만으로 보호자 권한(guardianToken)을
      // 스스로 획득하는 전체 공격 체인이 첫 단계에서 끊어짐을 다시 한 번 확인한다.
      const setRes = await request(app)
        .put('/api/guardian/pin')
        .set(authHeader(userA.accessToken))
        .send({ pin: '1234' });
      assert.strictEqual(setRes.status, 401);

      const verifyRes = await request(app)
        .post('/api/guardian/pin/verify')
        .set(authHeader(userA.accessToken))
        .send({ pin: '1234' });
      assert.strictEqual(verifyRes.status, 400, JSON.stringify(verifyRes.body));
      assert.strictEqual(verifyRes.body.data, undefined, 'guardianToken이 어떤 경로로도 발급되면 안 됩니다.');
    }
  );

  await step('reauth: 틀린 비밀번호 반복 시 401이다가, 5번째 시도에서 잠긴다(429)', async () => {
    for (let i = 0; i < 4; i += 1) {
      const res = await request(app)
        .post('/api/guardian/reauth')
        .set(authHeader(userA.accessToken))
        .send({ password: 'wrong-password' });
      assert.strictEqual(res.status, 401, `attempt ${i + 1}: ${JSON.stringify(res.body)}`);
    }
    const fifth = await request(app)
      .post('/api/guardian/reauth')
      .set(authHeader(userA.accessToken))
      .send({ password: 'wrong-password' });
    assert.strictEqual(fifth.status, 429, JSON.stringify(fifth.body));
  });

  await step('reauth: 잠긴 상태에서는 올바른 비밀번호를 보내도 차단된다', async () => {
    const res = await request(app)
      .post('/api/guardian/reauth')
      .set(authHeader(userA.accessToken))
      .send({ password: userA.password });
    assert.strictEqual(res.status, 429, JSON.stringify(res.body));
  });

  // 실제로 10분을 기다리는 대신, 시간이 지나 잠금이 자연 해제된 것과 동일한 DB 상태를
  // 만든다(서비스 로직을 우회하는 것이 아니라 "시간 경과"만 시뮬레이션).
  await GuardianSetting.update(
    { reauth_failed_attempts: 0, reauth_locked_until: null },
    { where: { user_id: userA.userId } }
  );

  await step('reauth: 올바른 비밀번호면 reauthToken이 발급된다', async () => {
    const res = await request(app)
      .post('/api/guardian/reauth')
      .set(authHeader(userA.accessToken))
      .send({ password: userA.password });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    reauthToken = res.body.data.reauthToken;
    assert.ok(reauthToken);
  });

  await step('[권한 상승 차단] 유효한 reauthToken이 있으면 최초 PIN 설정에 성공한다', async () => {
    const res = await request(app)
      .put('/api/guardian/pin')
      .set(authHeader(userA.accessToken))
      .set('X-Reauth-Token', reauthToken)
      .send({ pin: '1234' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  await step('PIN hash는 어떤 보호자 API 응답에도 노출되지 않는다', async () => {
    const settingsRes = await request(app).get('/api/guardian/settings').set(authHeader(userA.accessToken));
    assert.ok(!JSON.stringify(settingsRes.body).match(/pin_hash/i));

    const setting = await GuardianSetting.findOne({ where: { user_id: userA.userId } });
    const verifyRes = await request(app)
      .post('/api/guardian/pin/verify')
      .set(authHeader(userA.accessToken))
      .send({ pin: '1234' });
    assert.ok(!JSON.stringify(verifyRes.body).includes(setting.parent_pin_hash));
  });

  await step('PIN 검증 성공 시 guardianToken이 발급된다', async () => {
    const res = await request(app)
      .post('/api/guardian/pin/verify')
      .set(authHeader(userA.accessToken))
      .send({ pin: '1234' });
    assert.strictEqual(res.status, 200);
    guardianTokenBeforeChange = res.body.data.guardianToken;
    assert.ok(guardianTokenBeforeChange);
  });

  await step('PIN 오답 5회 시 잠기고, 잠긴 동안은 정답이어도 거부된다', async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app)
        .post('/api/guardian/pin/verify')
        .set(authHeader(userA.accessToken))
        .send({ pin: '0000' });
      assert.ok([401, 429].includes(res.status), `attempt ${i + 1}: ${res.status}`);
    }
    const locked = await request(app)
      .post('/api/guardian/pin/verify')
      .set(authHeader(userA.accessToken))
      .send({ pin: '1234' });
    assert.strictEqual(locked.status, 429, JSON.stringify(locked.body));
  });

  await step('보호자 전용 설정 변경(PUT /guardian/settings)은 guardianToken 없이는 거부된다', async () => {
    const res = await request(app)
      .put('/api/guardian/settings')
      .set(authHeader(userA.accessToken))
      .send({ daily_usage_limit_minutes: 1 });
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
  });

  await step('PIN이 잠긴 상태에서 currentPin 필드(정답 포함)를 보내도 PIN 변경으로 잠금을 우회할 수 없다', async () => {
    const res = await request(app)
      .put('/api/guardian/pin')
      .set(authHeader(userA.accessToken))
      .send({ pin: '9999', currentPin: '1234' });
    assert.strictEqual(res.status, 401, JSON.stringify(res.body));

    const stillLocked = await request(app)
      .post('/api/guardian/pin/verify')
      .set(authHeader(userA.accessToken))
      .send({ pin: '9999' });
    assert.strictEqual(stillLocked.status, 429, 'PIN이 바뀌었다면 잠금과 무관하게 다른 응답이 왔을 것입니다.');
  });

  await step(
    'PIN이 잠긴 상태에서도 올바른 reauthToken으로는 PIN을 변경할 수 있다 (설계된 대체 경로, PIN 잠금 우회 아님)',
    async () => {
      const reauthRes = await request(app)
        .post('/api/guardian/reauth')
        .set(authHeader(userA.accessToken))
        .send({ password: userA.password });
      assert.strictEqual(reauthRes.status, 200, JSON.stringify(reauthRes.body));
      reauthTokenForChange = reauthRes.body.data.reauthToken;

      const res = await request(app)
        .put('/api/guardian/pin')
        .set(authHeader(userA.accessToken))
        .set('X-Reauth-Token', reauthTokenForChange)
        .send({ pin: '5678' });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));

      const setting = await GuardianSetting.findOne({ where: { user_id: userA.userId } });
      assert.strictEqual(setting.pin_failed_attempts, 0);
      assert.strictEqual(setting.pin_locked_until, null);
    }
  );

  await step('[pin_version 무효화] PIN 변경 전에 발급된 guardianToken은 변경 후 즉시 거부된다', async () => {
    const res = await request(app)
      .put('/api/guardian/settings')
      .set(authHeader(userA.accessToken))
      .set('X-Guardian-Token', guardianTokenBeforeChange)
      .send({ daily_usage_limit_minutes: 1 });
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
  });

  await step('유효한(변경 후 새로 발급된) guardianToken이 있으면 일일 사용 제한을 설정할 수 있다', async () => {
    const verifyRes = await request(app)
      .post('/api/guardian/pin/verify')
      .set(authHeader(userA.accessToken))
      .send({ pin: '5678' });
    assert.strictEqual(verifyRes.status, 200, JSON.stringify(verifyRes.body));
    guardianToken = verifyRes.body.data.guardianToken;

    const res = await request(app)
      .put('/api/guardian/settings')
      .set(authHeader(userA.accessToken))
      .set('X-Guardian-Token', guardianToken)
      .send({ daily_usage_limit_minutes: 1 }); // 1분 = 60초, heartbeat 테스트를 빠르게 하기 위함
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  await step('다른 사용자의 reauthToken/guardianToken은 사용할 수 없다', async () => {
    const userBReauthRes = await request(app)
      .post('/api/guardian/reauth')
      .set(authHeader(userB.accessToken))
      .send({ password: userB.password });
    assert.strictEqual(userBReauthRes.status, 200, JSON.stringify(userBReauthRes.body));
    const userBReauthToken = userBReauthRes.body.data.reauthToken;

    // userA가 userB의 reauthToken으로 자기 PIN을 바꾸려 하면 거부되어야 한다(user_id 불일치)
    const crossReauth = await request(app)
      .put('/api/guardian/pin')
      .set(authHeader(userA.accessToken))
      .set('X-Reauth-Token', userBReauthToken)
      .send({ pin: '4321' });
    assert.strictEqual(crossReauth.status, 401, JSON.stringify(crossReauth.body));

    // userB는 이 reauthToken으로 자신의 PIN을 최초 설정한다(다음 단계인 동시성 테스트 준비 겸)
    const userBSetPin = await request(app)
      .put('/api/guardian/pin')
      .set(authHeader(userB.accessToken))
      .set('X-Reauth-Token', userBReauthToken)
      .send({ pin: '1111' });
    assert.strictEqual(userBSetPin.status, 200, JSON.stringify(userBSetPin.body));

    const userBVerify = await request(app)
      .post('/api/guardian/pin/verify')
      .set(authHeader(userB.accessToken))
      .send({ pin: '1111' });
    assert.strictEqual(userBVerify.status, 200, JSON.stringify(userBVerify.body));
    const userBGuardianToken = userBVerify.body.data.guardianToken;

    // userA가 userB의 guardianToken으로 자기 설정을 바꾸려 하면 거부되어야 한다
    const crossGuardian = await request(app)
      .put('/api/guardian/settings')
      .set(authHeader(userA.accessToken))
      .set('X-Guardian-Token', userBGuardianToken)
      .send({ daily_usage_limit_minutes: 1 });
    assert.strictEqual(crossGuardian.status, 403, JSON.stringify(crossGuardian.body));
  });

  await step('동시에 여러 개의 PIN 오답 요청이 들어와도 실패 횟수가 유실되지 않는다 (실 DB row lock)', async () => {
    // userB는 바로 위 단계에서 이미 PIN('1111')을 설정해뒀다.
    const MAX_PIN_ATTEMPTS = 5; // guardian.service.js의 MAX_PIN_ATTEMPTS와 동일(내부 상수라 import 불가, 값만 동기화)
    const CONCURRENT_GUESSES = 8; // MAX_PIN_ATTEMPTS보다 크게 잡아 잠김까지 확인
    const responses = await Promise.all(
      Array.from({ length: CONCURRENT_GUESSES }, () =>
        request(app)
          .post('/api/guardian/pin/verify')
          .set(authHeader(userB.accessToken))
          .send({ pin: '0000' })
      )
    );

    const statusCounts = responses.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});
    // guardian.service.verifyPin은 실패 횟수를 증가시킨 "직후" 그 호출 안에서 임계치
    // 도달 여부를 판단하므로, 잠금을 유발한 바로 그 5번째 실패 호출 자체가 이미 429를
    // 반환한다. MAX_PIN_ATTEMPTS(5)회 중 처음 4번만 401(오답)이고, 5번째부터는(잠금을
    // 유발한 호출 포함) 전부 429다 — 실패 횟수 자체는 정확히 5에서 멈추고 유실 없이
    // 세어진다는 것이 이 테스트의 핵심이다.
    assert.strictEqual(
      statusCounts[401],
      MAX_PIN_ATTEMPTS - 1,
      `401(오답)이 정확히 ${MAX_PIN_ATTEMPTS - 1}번 나와야 합니다 (실제: ${JSON.stringify(statusCounts)})`
    );
    assert.strictEqual(
      statusCounts[429],
      CONCURRENT_GUESSES - (MAX_PIN_ATTEMPTS - 1),
      `나머지는 429(잠금)여야 합니다 (실제: ${JSON.stringify(statusCounts)})`
    );

    const setting = await GuardianSetting.findOne({ where: { user_id: userB.userId } });
    assert.strictEqual(
      setting.pin_failed_attempts,
      5,
      `동시 요청 이후 pin_failed_attempts가 정확히 5여야 합니다(유실 없음) (실제: ${setting.pin_failed_attempts})`
    );
  });

  // ---- 토큰 상호 오용: access/refresh/guardian/reauth 전부 ----

  await step('guardianToken을 Authorization: Bearer로 사용하면 일반 API 인증을 통과하지 못한다 (401)', async () => {
    const res = await request(app).get('/api/children').set('Authorization', `Bearer ${guardianToken}`);
    assert.strictEqual(res.status, 401, JSON.stringify(res.body));
  });

  await step('reauthToken을 Authorization: Bearer로 사용하면 401', async () => {
    const res = await request(app)
      .get('/api/children')
      .set('Authorization', `Bearer ${reauthTokenForChange}`);
    assert.strictEqual(res.status, 401, JSON.stringify(res.body));
  });

  await step('accessToken을 X-Guardian-Token으로 사용하면 보호자 전용 API가 거부한다 (403)', async () => {
    const res = await request(app)
      .put('/api/guardian/settings')
      .set(authHeader(userA.accessToken))
      .set('X-Guardian-Token', userA.accessToken)
      .send({ daily_usage_limit_minutes: 1 });
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
  });

  await step('reauthToken을 X-Guardian-Token으로 사용하면 403 (타입 불일치)', async () => {
    const res = await request(app)
      .put('/api/guardian/settings')
      .set(authHeader(userA.accessToken))
      .set('X-Guardian-Token', reauthTokenForChange)
      .send({ daily_usage_limit_minutes: 1 });
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
  });

  await step('accessToken을 X-Reauth-Token으로 사용하면(=재인증 없이 PIN 변경 시도) 401', async () => {
    const res = await request(app)
      .put('/api/guardian/pin')
      .set(authHeader(userA.accessToken))
      .set('X-Reauth-Token', userA.accessToken)
      .send({ pin: '2468' });
    assert.strictEqual(res.status, 401, JSON.stringify(res.body));
  });

  await step('guardianToken을 X-Reauth-Token으로 사용하면 401 (타입 불일치)', async () => {
    const res = await request(app)
      .put('/api/guardian/pin')
      .set(authHeader(userA.accessToken))
      .set('X-Reauth-Token', guardianToken)
      .send({ pin: '2468' });
    assert.strictEqual(res.status, 401, JSON.stringify(res.body));
  });

  await step('refreshToken은 X-Guardian-Token/X-Reauth-Token 어디에도 사용할 수 없다', async () => {
    const guardRes = await request(app)
      .put('/api/guardian/settings')
      .set(authHeader(userA.accessToken))
      .set('X-Guardian-Token', userA.refreshToken)
      .send({ daily_usage_limit_minutes: 1 });
    assert.strictEqual(guardRes.status, 403, JSON.stringify(guardRes.body));

    const reauthRes = await request(app)
      .put('/api/guardian/pin')
      .set(authHeader(userA.accessToken))
      .set('X-Reauth-Token', userA.refreshToken)
      .send({ pin: '2468' });
    assert.strictEqual(reauthRes.status, 401, JSON.stringify(reauthRes.body));
  });

  // =========================================================================
  // 4. 사용 시간 heartbeat
  // =========================================================================

  await step('클라이언트가 X-Usage-Minutes 헤더를 조작해도 서버 계산에 영향을 주지 않는다', async () => {
    const res = await request(app)
      .post('/api/usage/heartbeat')
      .set(authHeader(userA.accessToken))
      .set('X-Usage-Minutes', '99999') // 조작 시도
      .send({ child_profile_id: childA.child_profile_id });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    // 서버는 이 heartbeat가 "그날의 첫 heartbeat"이므로 0초를 적립해야 한다 —
    // 헤더 값(99999)이 반영됐다면 이 값과 크게 어긋난다.
    assert.strictEqual(res.body.data.accumulatedSeconds, 0, JSON.stringify(res.body));
  });

  await step('다른 유저의 자녀 프로필로는 heartbeat를 보낼 수 없다 (404)', async () => {
    const res = await request(app)
      .post('/api/usage/heartbeat')
      .set(authHeader(userB.accessToken))
      .send({ child_profile_id: childA.child_profile_id });
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
  });

  await step('한도 도달 전에는 정상적으로 누적되고 200을 반환한다', async () => {
    // 마지막 heartbeat를 30초 전으로 조작해, 다음 heartbeat 호출 시 약 30초가 적립되도록
    // 만든다(실제로 30초를 기다리지 않기 위함). 한도는 60초이므로 아직 미달이다.
    //
    // 정확히 30초가 아니라 "범위"로 검증하는 이유: backdate 시점과 서버가 실제로 요청을
    // 처리하는 시점 사이에는 실제 HTTP 왕복 + DB 조회/저장 시간이 끼어들어(부하 상황에서
    // 특히), 하드코딩한 값과 정확히 일치하지 않을 수 있다(예: 기대 30초, 실제 31초로
    // 이전 라운드에서 flaky 실패가 있었다). 클라이언트가 요청을 보내기 직전(beforeMs)과
    // 응답을 받은 직후(afterMs)를 직접 측정하면, 서버가 실제로 관측한 "지금"은 반드시
    // 그 구간 안에 있었다는 사실만으로 정확한(추측이 아닌) 상한/하한을 계산할 수 있다.
    const backdateSeconds = 30;
    const backdatedAt = new Date(Date.now() - backdateSeconds * 1000);
    await UsageDailySummary.update(
      { last_heartbeat_at: backdatedAt },
      { where: { child_profile_id: childA.child_profile_id } }
    );

    const beforeMs = Date.now();
    const res = await request(app)
      .post('/api/usage/heartbeat')
      .set(authHeader(userA.accessToken))
      .send({ child_profile_id: childA.child_profile_id });
    const afterMs = Date.now();

    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const minExpected = Math.floor((beforeMs - backdatedAt.getTime()) / 1000);
    const maxExpected = Math.ceil((afterMs - backdatedAt.getTime()) / 1000);
    const actual = res.body.data.accumulatedSeconds;
    assert.ok(
      actual >= minExpected && actual <= maxExpected,
      `누적 시간은 [${minExpected}, ${maxExpected}] 범위여야 하는데 실제로는 ${actual}였습니다.`
    );
  });

  await step('한도(60초)에 도달하면 이후 heartbeat는 403으로 차단된다', async () => {
    // 이전 단계에서 이미 30초 안팎이 누적된 상태다. 35초를 추가로 적립시켜 확실히
    // 60초를 넘긴다(정확한 합산값은 검증하지 않는다 — 초과 여부만 검증하면 충분하다).
    const backdateSeconds = 35;
    const backdatedAt = new Date(Date.now() - backdateSeconds * 1000);
    await UsageDailySummary.update(
      { last_heartbeat_at: backdatedAt },
      { where: { child_profile_id: childA.child_profile_id } }
    );

    const res = await request(app)
      .post('/api/usage/heartbeat')
      .set(authHeader(userA.accessToken))
      .send({ child_profile_id: childA.child_profile_id });
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
  });

  let accumulatedBeforeRollover;
  await step('GET /api/usage/:childId/today로 한도 도달 상태를 조회할 수 있다', async () => {
    const res = await request(app)
      .get(`/api/usage/${childA.child_profile_id}/today`)
      .set(authHeader(userA.accessToken));
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.limitReached, true);
    assert.ok(res.body.data.accumulatedSeconds >= 60, JSON.stringify(res.body));
    // 날짜 롤오버 테스트에서 "이전 날짜 기록이 훼손되지 않았는지"를 하드코딩된 값이
    // 아니라 지금 실제로 관측한 값과 비교하기 위해 저장해둔다.
    accumulatedBeforeRollover = res.body.data.accumulatedSeconds;
  });

  await step('다른 자녀 프로필의 사용량과 섞이지 않는다', async () => {
    const otherChildRes = await request(app)
      .post('/api/children')
      .set(authHeader(userA.accessToken))
      .send({ child_name: '셋째' });
    const otherChild = otherChildRes.body.data.profile;

    const res = await request(app)
      .post('/api/usage/heartbeat')
      .set(authHeader(userA.accessToken))
      .send({ child_profile_id: otherChild.child_profile_id });
    // 첫째(childA)는 이미 한도 초과 상태이지만, 새로 만든 자녀는 완전히 독립적인
    // 사용량을 가져야 하므로 정상적으로(200) 기록되어야 한다.
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.accumulatedSeconds, 0);
  });

  await step('날짜가 바뀌면(Asia/Seoul 기준) 일일 사용량이 초기화된다', async () => {
    // 어제자 요약행으로 바꿔치기해 "날짜가 바뀐" 상황을 재현한다.
    await UsageDailySummary.update(
      { usage_date: '2000-01-01' },
      { where: { child_profile_id: childA.child_profile_id } }
    );

    const res = await request(app)
      .post('/api/usage/heartbeat')
      .set(authHeader(userA.accessToken))
      .send({ child_profile_id: childA.child_profile_id });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.accumulatedSeconds, 0, '날짜가 바뀌면 오늘자 누적은 0부터 다시 시작해야 합니다.');

    const oldRow = await UsageDailySummary.findOne({
      where: { child_profile_id: childA.child_profile_id, usage_date: '2000-01-01' },
    });
    assert.ok(oldRow, '이전 날짜의 기록은 삭제되지 않고 그대로 남아있어야 합니다.');
    assert.strictEqual(
      oldRow.accumulated_seconds,
      accumulatedBeforeRollover,
      `이전 날짜 기록 값이 훼손되면 안 됩니다 (테스트 중 실측한 값: ${accumulatedBeforeRollover}, 실제: ${oldRow.accumulated_seconds})`
    );
  });

  await step('동시 heartbeat 요청이 몰려도 요약 행이 중복 생성되거나 요청이 깨지지 않는다', async () => {
    const freshChildRes = await request(app)
      .post('/api/children')
      .set(authHeader(userA.accessToken))
      .send({ child_name: '넷째' });
    const freshChild = freshChildRes.body.data.profile;

    const CONCURRENT = 5;
    const responses = await Promise.all(
      Array.from({ length: CONCURRENT }, () =>
        request(app)
          .post('/api/usage/heartbeat')
          .set(authHeader(userA.accessToken))
          .send({ child_profile_id: freshChild.child_profile_id })
      )
    );
    responses.forEach((r) => assert.ok([200, 403].includes(r.status), JSON.stringify(r.body)));

    const rows = await UsageDailySummary.findAll({ where: { child_profile_id: freshChild.child_profile_id } });
    assert.strictEqual(rows.length, 1, `동시 요청 이후에도 그날 요약 행은 정확히 1개여야 합니다 (실제: ${rows.length})`);
  });

  await sequelize.close();

  console.log(`\nWeek2 스모크 테스트 결과: ${passCount} passed, ${failCount} failed`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Week2 스모크 테스트 실행 중 예외 발생:', err);
  process.exit(1);
});
