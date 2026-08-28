/**
 * Week 3(개발자 A) 범위 — 출석 / 데일리 미션 / 리워드(포인트·레벨·streak) — 를 실제 MySQL +
 * 실제 HTTP 요청(supertest)으로 검증하는 스모크 테스트.
 *
 * tests/smoke/week2.smoke.js와 동일한 방식(실 DB, 목이 아닌 서비스 전체)을 따르되 Week1·2
 * 범위는 계정 준비에만 사용하고 검증하지 않는다.
 *
 * Jest 테스트가 전부 목 기반이라 확인할 수 없는 것들 — UNIQUE 제약이 실제로 중복 지급을
 * 막는지, 동시 요청에서 행이 하나만 생기는지, 멱등키가 정말로 재지급을 차단하는지 — 이
 * 스크립트의 존재 이유가 그것이다.
 *
 * 사용법:
 *   DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=hanium_smoke DB_USER=root DB_PASSWORD= \
 *     node tests/smoke/week3.smoke.js
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
  const {
    sequelize,
    EmailVerification,
    AttendanceLog,
    DailyMission,
    RewardWallet,
    RewardTransaction,
  } = require('../../src/models');
  const app = require('../../src/app');
  const rewardService = require('../../src/services/reward.service');
  const missionService = require('../../src/services/mission.service');
  const { getSeoulDateString, addDays } = require('../../src/utils/dateUtils');
  const { MISSION_CATALOG } = require('../../src/config/missionCatalog');

  console.log(`DB(${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME})에 연결 확인 중...`);
  await sequelize.authenticate();
  console.log('연결 성공. 스키마를 초기화합니다 (force sync)...');
  await sequelize.sync({ force: true });

  // 참고: reward_wallets의 CHECK(points >= 0), reward_transactions의 CHECK(points > 0)는
  // db/migrations/0010·0011에만 있고 sequelize.sync()로는 생성되지 않는다. 여기서 검증하는
  // 것은 UNIQUE 제약과 서비스 로직(트랜잭션 + 행 잠금 + 멱등키)이며, CHECK 제약 자체는
  // migration.smoke.js가 실제 마이그레이션을 적용해 확인할 몫이다.

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
      userId: loginRes.body.data.user.user_id,
      accessToken: loginRes.body.data.accessToken,
    };
  };

  const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

  const createChild = async (user, name) => {
    const res = await request(app)
      .post('/api/children')
      .set(authHeader(user.accessToken))
      .send({ child_name: name });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    return res.body.data.profile.child_profile_id;
  };

  const userA = await signupAndLogin('week3A');
  const userB = await signupAndLogin('week3B');

  const TODAY = getSeoulDateString();

  // =========================================================================
  // 1. 출석 체크
  // =========================================================================
  console.log('\n[1] 출석 체크');

  const childAttendance = await createChild(userA, '출석테스트');

  await step('그날 첫 출석은 201이고 포인트가 지급된다', async () => {
    const res = await request(app)
      .post('/api/attendance/check')
      .set(authHeader(userA.accessToken))
      .send({ child_profile_id: childAttendance });

    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.alreadyChecked, false);
    assert.strictEqual(res.body.data.attendanceDate, TODAY);
    assert.strictEqual(res.body.data.streakDays, 1);
    assert.ok(res.body.data.pointsEarned > 0, '첫 출석에는 포인트가 지급되어야 합니다.');
  });

  await step('같은 날 재요청은 200이고 포인트가 추가되지 않는다', async () => {
    const before = await RewardWallet.findOne({ where: { child_profile_id: childAttendance } });

    const res = await request(app)
      .post('/api/attendance/check')
      .set(authHeader(userA.accessToken))
      .send({ child_profile_id: childAttendance });

    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.alreadyChecked, true);
    assert.strictEqual(res.body.data.pointsEarned, 0);

    const after = await RewardWallet.findOne({ where: { child_profile_id: childAttendance } });
    assert.strictEqual(after.points, before.points, '재요청으로 포인트가 변하면 안 됩니다.');
  });

  await step('출석 로그는 하루에 정확히 1행만 존재한다', async () => {
    const rows = await AttendanceLog.findAll({ where: { child_profile_id: childAttendance } });
    assert.strictEqual(rows.length, 1, `출석 로그가 ${rows.length}행입니다.`);
  });

  await step('출석 포인트는 mission_reward 단일 경로로만 지급된다 (이중 지급 없음)', async () => {
    const rows = await RewardTransaction.findAll({ where: { child_profile_id: childAttendance } });
    const reasons = rows.map((r) => r.reason);
    assert.strictEqual(rows.length, 1, `원장이 ${rows.length}건입니다: ${JSON.stringify(reasons)}`);
    assert.strictEqual(reasons[0], 'mission_reward');
  });

  await step('동시 출석 요청 5건이 들어와도 로그와 원장은 각각 1건만 생긴다', async () => {
    const childConcurrent = await createChild(userA, '동시출석');

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post('/api/attendance/check')
          .set(authHeader(userA.accessToken))
          .send({ child_profile_id: childConcurrent })
      )
    );
    responses.forEach((r) => assert.ok([200, 201].includes(r.status), JSON.stringify(r.body)));

    const logs = await AttendanceLog.findAll({ where: { child_profile_id: childConcurrent } });
    assert.strictEqual(logs.length, 1, `동시 요청 후 출석 로그가 ${logs.length}행입니다.`);

    const ledger = await RewardTransaction.findAll({ where: { child_profile_id: childConcurrent } });
    assert.strictEqual(ledger.length, 1, `동시 요청 후 원장이 ${ledger.length}건입니다.`);

    const created = responses.filter((r) => r.status === 201);
    assert.strictEqual(created.length, 1, `201 응답이 ${created.length}건입니다 (정확히 1건이어야 함).`);
  });

  await step('연속 출석 마일스톤(3일)에 도달하면 보너스가 함께 지급된다', async () => {
    const childStreak = await createChild(userA, 'streak테스트');

    // 어제까지 2일 연속인 상태를 만든다(출석 로그는 오늘 것이 없어야 checkIn이 진행된다).
    await RewardWallet.create({
      child_profile_id: childStreak,
      points: 0,
      level: 1,
      streak_days: 2,
      last_activity_date: addDays(TODAY, -1),
    });

    const res = await request(app)
      .post('/api/attendance/check')
      .set(authHeader(userA.accessToken))
      .send({ child_profile_id: childStreak });

    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.streakDays, 3, '어제 출석했으므로 3일차여야 합니다.');

    const bonus = await RewardTransaction.findOne({
      where: { child_profile_id: childStreak, reason: 'streak_bonus' },
    });
    assert.ok(bonus, 'streak_bonus 원장이 있어야 합니다.');
    assert.strictEqual(bonus.idempotency_key, `streak:${childStreak}:${TODAY}`);
  });

  await step('연속이 끊기면 streak가 1로 리셋된다', async () => {
    const childBroken = await createChild(userA, 'streak끊김');

    await RewardWallet.create({
      child_profile_id: childBroken,
      points: 0,
      level: 1,
      streak_days: 9,
      last_activity_date: addDays(TODAY, -5),
    });

    const res = await request(app)
      .post('/api/attendance/check')
      .set(authHeader(userA.accessToken))
      .send({ child_profile_id: childBroken });

    assert.strictEqual(res.body.data.streakDays, 1);
  });

  // =========================================================================
  // 2. 데일리 미션
  // =========================================================================
  console.log('\n[2] 데일리 미션');

  const childMission = await createChild(userA, '미션테스트');

  await step('미션 카탈로그를 조회할 수 있다', async () => {
    const res = await request(app).get('/api/missions').set(authHeader(userA.accessToken));

    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.missions.length, MISSION_CATALOG.length);
  });

  await step('진행 상황 조회가 오늘자 미션 4종을 지연 생성한다', async () => {
    const before = await DailyMission.count({ where: { child_profile_id: childMission } });
    assert.strictEqual(before, 0, '조회 전에는 미션 행이 없어야 합니다.');

    const res = await request(app)
      .get(`/api/missions/progress/${childMission}`)
      .set(authHeader(userA.accessToken));

    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.missionDate, TODAY);
    assert.strictEqual(res.body.data.missions.length, MISSION_CATALOG.length);

    const after = await DailyMission.count({ where: { child_profile_id: childMission } });
    assert.strictEqual(after, MISSION_CATALOG.length);
  });

  await step('재조회해도 미션 행이 늘어나지 않는다', async () => {
    await request(app)
      .get(`/api/missions/progress/${childMission}`)
      .set(authHeader(userA.accessToken));

    const count = await DailyMission.count({ where: { child_profile_id: childMission } });
    assert.strictEqual(count, MISSION_CATALOG.length, `미션 행이 ${count}개로 늘었습니다.`);
  });

  await step('동시 조회 5건이 들어와도 미션 행은 4개를 넘지 않는다', async () => {
    const childRace = await createChild(userA, '미션동시');

    await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .get(`/api/missions/progress/${childRace}`)
          .set(authHeader(userA.accessToken))
      )
    );

    const count = await DailyMission.count({ where: { child_profile_id: childRace } });
    assert.strictEqual(count, MISSION_CATALOG.length, `동시 조회 후 미션 행이 ${count}개입니다.`);
  });

  await step('목표 미달 진행도는 pending을 유지하고 포인트를 지급하지 않는다', async () => {
    // word_clicked는 target_count가 5라 1회 호출로는 완료되지 않는다.
    const result = await missionService.recordProgress({
      childProfileId: childMission,
      eventType: 'word_clicked',
    });

    assert.strictEqual(result.updated, true);
    assert.strictEqual(result.mission.status, 'pending');
    assert.strictEqual(result.reward, null);
  });

  await step('목표 도달 시 rewarded로 전이하고 포인트가 지급된다', async () => {
    const before = await rewardService.getOrCreateWallet(childMission);
    const beforePoints = before.points;

    const result = await missionService.recordProgress({
      childProfileId: childMission,
      eventType: 'story_read',
    });

    assert.strictEqual(result.mission.status, 'rewarded');
    assert.ok(result.reward, '보상 결과가 있어야 합니다.');

    const after = await rewardService.getOrCreateWallet(childMission);
    assert.strictEqual(after.points, beforePoints + result.mission.reward_points);
  });

  await step('완료된 미션을 다시 밀어도 포인트가 재지급되지 않는다', async () => {
    const before = await rewardService.getOrCreateWallet(childMission);

    const result = await missionService.recordProgress({
      childProfileId: childMission,
      eventType: 'story_read',
    });

    assert.strictEqual(result.updated, false);

    const after = await rewardService.getOrCreateWallet(childMission);
    assert.strictEqual(after.points, before.points, '재지급이 발생했습니다.');
  });

  await step('같은 미션에 대한 원장은 1건만 존재한다', async () => {
    const missions = await DailyMission.findAll({
      where: { child_profile_id: childMission, mission_type: 'story_read' },
    });
    assert.strictEqual(missions.length, 1);

    const ledger = await RewardTransaction.findAll({
      where: {
        child_profile_id: childMission,
        idempotency_key: `mission:${missions[0].daily_mission_id}`,
      },
    });
    assert.strictEqual(ledger.length, 1, `같은 미션 원장이 ${ledger.length}건입니다.`);
  });

  // =========================================================================
  // 3. 포인트 지급 멱등성 / 레벨
  // =========================================================================
  console.log('\n[3] 포인트 지급 멱등성 / 레벨');

  const childReward = await createChild(userA, '리워드테스트');

  await step('같은 멱등키로 두 번 지급하면 두 번째는 alreadyProcessed로 차단된다', async () => {
    const first = await rewardService.addPoints({
      childProfileId: childReward,
      points: 50,
      reason: 'story_read',
      idempotencyKey: 'smoke:dup-1',
    });
    const second = await rewardService.addPoints({
      childProfileId: childReward,
      points: 50,
      reason: 'story_read',
      idempotencyKey: 'smoke:dup-1',
    });

    assert.strictEqual(first.alreadyProcessed, false);
    assert.strictEqual(second.alreadyProcessed, true);
    assert.strictEqual(second.pointsAdded, 0);

    const wallet = await rewardService.getOrCreateWallet(childReward);
    assert.strictEqual(wallet.points, 50, `잔액이 ${wallet.points}입니다 (50이어야 함).`);
  });

  await step('같은 멱등키로 동시에 5건이 들어와도 원장은 1건만 생긴다', async () => {
    const childRace = await createChild(userA, '지급동시');

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        rewardService.addPoints({
          childProfileId: childRace,
          points: 30,
          reason: 'quiz_answered',
          idempotencyKey: 'smoke:race-1',
        })
      )
    );

    const rejected = results.filter((r) => r.status === 'rejected');
    assert.strictEqual(rejected.length, 0, `실패한 요청이 있습니다: ${rejected[0]?.reason?.message}`);

    const ledger = await RewardTransaction.findAll({ where: { child_profile_id: childRace } });
    assert.strictEqual(ledger.length, 1, `동시 지급 후 원장이 ${ledger.length}건입니다.`);

    const wallet = await rewardService.getOrCreateWallet(childRace);
    assert.strictEqual(wallet.points, 30, `잔액이 ${wallet.points}입니다 (30이어야 함).`);
  });

  await step('포인트 누적에 따라 레벨이 자동으로 올라간다', async () => {
    await rewardService.addPoints({
      childProfileId: childReward,
      points: 300,
      reason: 'mission_reward',
      idempotencyKey: 'smoke:levelup-1',
    });

    const res = await request(app)
      .get(`/api/rewards/${childReward}`)
      .set(authHeader(userA.accessToken));

    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.points, 350);
    assert.ok(res.body.data.level >= 3, `레벨이 ${res.body.data.level}입니다 (350점이면 3 이상).`);
    assert.ok(res.body.data.levelProgress.nextLevelAt > 350);
  });

  await step('summary는 보유 포인트만 반환한다', async () => {
    const res = await request(app)
      .get(`/api/rewards/${childReward}/summary`)
      .set(authHeader(userA.accessToken));

    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.deepStrictEqual(Object.keys(res.body.data), ['points']);
  });

  // =========================================================================
  // 4. 이력 조회
  // =========================================================================
  console.log('\n[4] 이력 조회');

  await step('이력이 최신순으로 반환된다', async () => {
    const res = await request(app)
      .get(`/api/rewards/${childReward}/history`)
      .set(authHeader(userA.accessToken));

    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.pagination.totalCount, 2);
    assert.strictEqual(res.body.data.items[0].reason, 'mission_reward'); // 나중에 지급된 것
    assert.strictEqual(res.body.data.items[0].balanceAfter, 350);
  });

  await step('page/limit이 실제로 적용된다 (Express 5 query 새니타이저 회귀 방지)', async () => {
    // Express 5의 req.query는 읽기 전용이라 express-validator의 .toInt()가 값을 되돌려 쓰지
    // 못한다. 컨트롤러가 직접 숫자로 변환하지 않으면 서비스가 문자열을 무시하고 늘 1페이지를
    // 반환하므로, 2페이지 요청이 실제로 다른 결과를 주는지 확인한다.
    const page1 = await request(app)
      .get(`/api/rewards/${childReward}/history?page=1&limit=1`)
      .set(authHeader(userA.accessToken));
    const page2 = await request(app)
      .get(`/api/rewards/${childReward}/history?page=2&limit=1`)
      .set(authHeader(userA.accessToken));

    assert.strictEqual(page1.body.data.items.length, 1);
    assert.strictEqual(page2.body.data.items.length, 1);
    assert.strictEqual(page1.body.data.pagination.page, 1);
    assert.strictEqual(page2.body.data.pagination.page, 2);
    assert.notStrictEqual(
      page1.body.data.items[0].reason,
      page2.body.data.items[0].reason,
      '2페이지가 1페이지와 같은 항목을 반환했습니다 (page 파라미터가 무시됨).'
    );
  });

  await step('reason 필터가 적용된다', async () => {
    const res = await request(app)
      .get(`/api/rewards/${childReward}/history?reason=story_read`)
      .set(authHeader(userA.accessToken));

    assert.strictEqual(res.body.data.pagination.totalCount, 1);
    assert.strictEqual(res.body.data.items[0].reason, 'story_read');
  });

  await step('알 수 없는 reason은 400', async () => {
    const res = await request(app)
      .get(`/api/rewards/${childReward}/history?reason=hacking`)
      .set(authHeader(userA.accessToken));

    assert.strictEqual(res.status, 400);
  });

  // =========================================================================
  // 5. 월간 출석 현황
  // =========================================================================
  console.log('\n[5] 월간 출석 현황');

  await step('월간 출석 현황과 출석률을 조회할 수 있다', async () => {
    const res = await request(app)
      .get(`/api/attendance/${childAttendance}`)
      .set(authHeader(userA.accessToken));

    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.month, TODAY.slice(0, 7));
    assert.deepStrictEqual(res.body.data.attendedDates, [TODAY]);
    assert.strictEqual(res.body.data.attendedCount, 1);
    // 진행 중인 이번 달의 분모는 오늘까지 경과한 일수다.
    assert.strictEqual(res.body.data.denominator, Number(TODAY.slice(8, 10)));
  });

  await step('출석 기록이 없는 달은 0%를 반환한다', async () => {
    const res = await request(app)
      .get(`/api/attendance/${childAttendance}?month=2020-01`)
      .set(authHeader(userA.accessToken));

    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.attendedCount, 0);
    assert.strictEqual(res.body.data.attendanceRate, 0);
    assert.strictEqual(res.body.data.denominator, 31);
  });

  await step('month 형식이 잘못되면 400', async () => {
    const res = await request(app)
      .get(`/api/attendance/${childAttendance}?month=2026-13`)
      .set(authHeader(userA.accessToken));

    assert.strictEqual(res.status, 400);
  });

  // =========================================================================
  // 6. 소유권 격리
  // =========================================================================
  console.log('\n[6] 소유권 격리');

  await step('다른 유저는 남의 자녀에 출석 체크를 할 수 없다 (404)', async () => {
    const res = await request(app)
      .post('/api/attendance/check')
      .set(authHeader(userB.accessToken))
      .send({ child_profile_id: childAttendance });

    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
  });

  await step('다른 유저는 남의 자녀 미션/리워드를 조회할 수 없다 (404)', async () => {
    const endpoints = [
      `/api/missions/progress/${childMission}`,
      `/api/rewards/${childReward}`,
      `/api/rewards/${childReward}/summary`,
      `/api/rewards/${childReward}/history`,
      `/api/attendance/${childAttendance}`,
    ];

    for (const endpoint of endpoints) {
      const res = await request(app).get(endpoint).set(authHeader(userB.accessToken));
      assert.strictEqual(res.status, 404, `${endpoint} → ${res.status}`);
    }
  });

  await step('인증 없이는 전부 401', async () => {
    const res = await request(app).get(`/api/rewards/${childReward}`);
    assert.strictEqual(res.status, 401);
  });

  // =========================================================================
  // 7. 자녀 프로필 삭제 시 CASCADE
  // =========================================================================
  console.log('\n[7] CASCADE');

  await step('자녀 프로필을 삭제하면 출석/미션/지갑/원장이 함께 삭제된다', async () => {
    const childCascade = await createChild(userA, 'CASCADE테스트');

    await request(app)
      .post('/api/attendance/check')
      .set(authHeader(userA.accessToken))
      .send({ child_profile_id: childCascade });

    const before = await DailyMission.count({ where: { child_profile_id: childCascade } });
    assert.ok(before > 0, '삭제 전에는 미션 행이 있어야 합니다.');

    const del = await request(app)
      .delete(`/api/children/${childCascade}`)
      .set(authHeader(userA.accessToken));
    assert.strictEqual(del.status, 200, JSON.stringify(del.body));

    const counts = await Promise.all([
      AttendanceLog.count({ where: { child_profile_id: childCascade } }),
      DailyMission.count({ where: { child_profile_id: childCascade } }),
      RewardWallet.count({ where: { child_profile_id: childCascade } }),
      RewardTransaction.count({ where: { child_profile_id: childCascade } }),
    ]);

    assert.deepStrictEqual(counts, [0, 0, 0, 0], `잔여 행: ${JSON.stringify(counts)}`);
  });

  await sequelize.close();

  console.log(`\nWeek3 스모크 테스트 결과: ${passCount} passed, ${failCount} failed`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Week3 스모크 테스트 실행 중 예외 발생:', err);
  process.exit(1);
});
