/**
 * 실제 MySQL을 대상으로 하는 인증 플로우 스모크 테스트.
 *
 * Jest의 `npm test`와는 별개로 동작한다 (그쪽은 항상 목(mock) 기반이라 실제 DB 없이도
 * 빠르고 안정적으로 돌아가야 하므로 유지한다). 이 스크립트는 실제 MySQL 서버와
 * 네트워크 스택을 통해 회원가입 → 이메일 인증 → 로그인 → refresh(rotation) →
 * 동시 refresh 요청까지 한 번에 검증한다.
 *
 * 사용법:
 *   DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=hanium_smoke DB_USER=root DB_PASSWORD= \
 *     node tests/smoke/auth.smoke.js
 *
 * 주의:
 *   - DB_NAME으로 지정한 데이터베이스에 대해 sequelize.sync({ force: true })를 실행해
 *     기존 테이블을 모두 삭제하고 새로 만든다. 절대 개발/운영 DB를 가리키게 하면 안 되고,
 *     스모크 테스트 전용 빈 데이터베이스를 사용해야 한다.
 *   - 이메일 발송은 실제로 나가지 않도록 nodemailer를 스텁으로 대체한다(아래 참고).
 */

'use strict';

// ---- nodemailer를 실제 네트워크 호출 없이 즉시 성공 처리하는 스텁으로 교체 ----
// src/utils/mailer.js가 require('nodemailer')를 호출하기 전에 모듈 캐시를 선점한다.
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
  const { sequelize, EmailVerification, RefreshToken } = require('../../src/models');
  const app = require('../../src/app');

  console.log(`DB(${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME})에 연결 확인 중...`);
  await sequelize.authenticate();
  console.log('연결 성공. 스키마를 초기화합니다 (force sync)...');
  await sequelize.sync({ force: true });

  const email = `smoke_${Date.now()}@example.com`;
  const password = 'abcd1234!';
  let accessToken;
  let refreshToken;

  await step('POST /api/auth/email/send → 200', async () => {
    const res = await request(app).post('/api/auth/email/send').send({ email });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  await step('재발송 쿨다운(60초) 내 재요청 → 429', async () => {
    const res = await request(app).post('/api/auth/email/send').send({ email });
    assert.strictEqual(res.status, 429, JSON.stringify(res.body));
  });

  const getLatestCode = async () => {
    const record = await EmailVerification.findOne({
      where: { email, is_verified: false },
      order: [['created_at', 'DESC']],
    });
    assert.ok(record, '발송된 인증 레코드를 찾지 못했습니다.');
    return record.code;
  };

  await step('동시에 여러 오답을 보내도 시도 횟수가 유실되지 않고 정확히 잠긴다 (row lock)', async () => {
    // attempts 증가가 트랜잭션+행 잠금 없이 이루어지면, 동시 요청들이 모두 같은
    // attempts 값을 읽어 증가분이 서로 덮어써질 수 있다(마지막 쓰기만 반영).
    // 실제 MySQL 대상으로, 진짜 동시 HTTP 요청을 보내 이 회귀를 검증한다.
    const raceEmail = `smoke_race_${Date.now()}@example.com`;
    const sendRes = await request(app).post('/api/auth/email/send').send({ email: raceEmail });
    assert.strictEqual(sendRes.status, 200, JSON.stringify(sendRes.body));

    const CONCURRENT_GUESSES = 8; // MAX_VERIFICATION_ATTEMPTS(5)보다 크게 잡아 잠김까지 확인
    const responses = await Promise.all(
      Array.from({ length: CONCURRENT_GUESSES }, () =>
        request(app).post('/api/auth/email/verify').send({ email: raceEmail, code: '000000' })
      )
    );

    const statusCounts = responses.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});
    assert.strictEqual(
      statusCounts[400],
      5,
      `400(오답)이 정확히 5번 나와야 합니다 (실제: ${JSON.stringify(statusCounts)})`
    );
    assert.strictEqual(
      statusCounts[429],
      CONCURRENT_GUESSES - 5,
      `나머지는 429(잠금)여야 합니다 (실제: ${JSON.stringify(statusCounts)})`
    );

    const record = await EmailVerification.findOne({ where: { email: raceEmail } });
    assert.strictEqual(
      record.attempts,
      5,
      `동시 요청 이후 attempts가 정확히 5여야 합니다(유실 없음) (실제: ${record.attempts})`
    );
  });

  await step('오답 5회 → 400, 6번째 시도 → 429 (무차별 대입 잠금)', async () => {
    const wrongCode = '000000';
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).post('/api/auth/email/verify').send({ email, code: wrongCode });
      assert.strictEqual(res.status, 400, `attempt ${i + 1}: ${JSON.stringify(res.body)}`);
    }
    const locked = await request(app)
      .post('/api/auth/email/verify')
      .send({ email, code: wrongCode });
    assert.strictEqual(locked.status, 429, JSON.stringify(locked.body));

    const correctCode = await getLatestCode();
    const stillLocked = await request(app)
      .post('/api/auth/email/verify')
      .send({ email, code: correctCode });
    assert.strictEqual(stillLocked.status, 429, '잠긴 상태에서는 정답이어도 통과하면 안 됩니다.');
  });

  await step('새 인증번호 재요청 후 정상 인증 → 200', async () => {
    // 쿨다운(60초)을 우회하기 위해 이전 레코드를 직접 정리한다(테스트 목적).
    await EmailVerification.destroy({ where: { email } });
    const sendRes = await request(app).post('/api/auth/email/send').send({ email });
    assert.strictEqual(sendRes.status, 200, JSON.stringify(sendRes.body));

    const code = await getLatestCode();
    const verifyRes = await request(app).post('/api/auth/email/verify').send({ email, code });
    assert.strictEqual(verifyRes.status, 200, JSON.stringify(verifyRes.body));
  });

  await step('회원가입 → 201', async () => {
    const res = await request(app).post('/api/auth/signup').send({ email, password });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.user.email, email);
  });

  await step('가입 완료 후 같은 이메일로 재가입 시도 → 409 (이미 가입됨, 인증 레코드는 이미 소멸)', async () => {
    const res = await request(app).post('/api/auth/signup').send({ email, password });
    assert.strictEqual(res.status, 409, JSON.stringify(res.body));

    const stale = await EmailVerification.findOne({ where: { email } });
    assert.strictEqual(stale, null, '가입에 사용된 인증 레코드가 소멸되지 않고 남아있습니다.');
  });

  await step('로그인 → 200, accessToken/refreshToken 발급', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
    assert.ok(accessToken && refreshToken);
  });

  await step('발급된 accessToken으로 보호된 라우트(GET /api/children) 통과', async () => {
    const res = await request(app).get('/api/children').set('Authorization', `Bearer ${accessToken}`);
    assert.notStrictEqual(res.status, 401, JSON.stringify(res.body));
  });

  let rotatedRefreshToken;
  await step('POST /api/auth/refresh → 200, refreshToken이 회전(변경)된다', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    rotatedRefreshToken = res.body.data.refreshToken;
    assert.ok(rotatedRefreshToken);
    assert.notStrictEqual(rotatedRefreshToken, refreshToken);
  });

  await step('회전으로 폐기된 이전 refreshToken 재사용 → 401', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
    assert.strictEqual(res.status, 401, JSON.stringify(res.body));
  });

  await step('동일한 refresh token으로 동시에 두 번 요청 → 정확히 하나만 성공 (DB row lock)', async () => {
    const [r1, r2] = await Promise.all([
      request(app).post('/api/auth/refresh').send({ refreshToken: rotatedRefreshToken }),
      request(app).post('/api/auth/refresh').send({ refreshToken: rotatedRefreshToken }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    assert.deepStrictEqual(
      statuses,
      [200, 401],
      `statuses=${statuses} bodies=${JSON.stringify([r1.body, r2.body])}`
    );

    // 이 시점에서 DB에 살아있는 refresh token은 이 사용자의 세션 하나뿐이므로,
    // 동시 요청 이후에도 정확히 1행만 남아야 한다(회전 성공 1회 + 폐기 1회).
    const total = await RefreshToken.count();
    assert.strictEqual(
      total,
      1,
      `동시 요청 이후 refresh_tokens 테이블에 정확히 1행만 남아야 합니다 (실제: ${total})`
    );
  });

  await sequelize.close();

  console.log(`\n스모크 테스트 결과: ${passCount} passed, ${failCount} failed`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('스모크 테스트 실행 중 예외 발생:', err);
  process.exit(1);
});
