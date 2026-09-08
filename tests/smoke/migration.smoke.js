/**
 * db/migrations/*.sql이 "이미 운영 중인(Week1까지의) 구버전 스키마"에 실제로 안전하게
 * 적용되는지 검증하는 스모크 테스트. Jest 유닛 테스트는 전부 mock 기반이라 SQL 파일
 * 자체가 문법적으로 올바른지, 기존 데이터가 있는 DB에도 적용 가능한지는 검증하지 못한다.
 *
 * 절차:
 *   1. 구버전(마이그레이션 0002 이전) 스키마를 raw SQL로 직접 만든다.
 *   2. 버그 재현: 한 유저에게 활성 프로필이 2개인 상태를 미리 만들어 둔다(0003이
 *      이걸 정리하지 못하면 UNIQUE 인덱스 생성 자체가 실패해야 정상).
 *   3. db/migrations/run.js로 0002~0007을 적용한다.
 *   4. information_schema로 기대한 컬럼/인덱스/제약이 생겼는지 확인한다.
 *   5. 활성 프로필 정리가 실제로 됐는지, FK가 실제로 CASCADE 동작하는지 데이터로 검증한다.
 *   6. 마이그레이션을 한 번 더 실행해 idempotent함을 확인한다.
 *
 * 사용법:
 *   DB_HOST=127.0.0.1 DB_PORT=33062 DB_USER=root DB_PASSWORD= node tests/smoke/migration.smoke.js
 *   (DB_NAME은 이 스크립트가 'hanium_migration_check'로 고정한다 — 기존 DB_NAME과 무관)
 */

'use strict';

const REQUIRED_ENV = ['DB_HOST', 'DB_PORT', 'DB_USER'];
for (const key of REQUIRED_ENV) {
  if (process.env[key] === undefined) {
    console.error(`${key} 환경변수가 필요합니다.`);
    process.exit(1);
  }
}

const CHECK_DB_NAME = 'hanium_migration_check';
process.env.DB_NAME = CHECK_DB_NAME;

const assert = require('assert');
const mysql = require('mysql2/promise');

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

const BASELINE_SQL = `
CREATE TABLE users (
  user_id BIGINT NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'parent',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE email_verifications (
  verification_id BIGINT NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  code VARCHAR(6) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (verification_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE refresh_tokens (
  token_id BIGINT NOT NULL AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  token VARCHAR(500) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (token_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE child_profiles (
  child_profile_id BIGINT NOT NULL AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  child_name VARCHAR(100) NOT NULL,
  age INT NULL,
  learning_level VARCHAR(30) NOT NULL DEFAULT 'beginner',
  vocabulary_level VARCHAR(30) NULL,
  profile_image_url VARCHAR(500) NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (child_profile_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE guardian_settings (
  setting_id BIGINT NOT NULL AUTO_INCREMENT,
  user_id BIGINT NOT NULL UNIQUE,
  parent_pin_hash VARCHAR(255) NULL,
  daily_usage_limit_minutes INT NULL,
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (setting_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function main() {
  const adminConn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  console.log(`구버전 스키마 재현용 DB(${CHECK_DB_NAME})를 초기화합니다...`);
  await adminConn.query(`DROP DATABASE IF EXISTS \`${CHECK_DB_NAME}\`;`);
  await adminConn.query(`CREATE DATABASE \`${CHECK_DB_NAME}\`;`);
  await adminConn.query(`USE \`${CHECK_DB_NAME}\`;`);
  await adminConn.query(BASELINE_SQL);

  // 버그 재현: user_id=1에게 활성 프로필이 2개인 상태를 미리 만든다.
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  await adminConn.query(
    `INSERT INTO users (email, password_hash, created_at, updated_at) VALUES ('dup@example.com', 'x', ?, ?);`,
    [now, now]
  );
  await adminConn.query(
    `INSERT INTO child_profiles (user_id, child_name, is_active, created_at, updated_at) VALUES
      (1, '첫째', 1, ?, ?),
      (1, '둘째', 1, DATE_ADD(?, INTERVAL 1 MINUTE), DATE_ADD(?, INTERVAL 1 MINUTE));`,
    [now, now, now, now]
  );

  await adminConn.end();

  // db/migrations/run.js는 src/config/env.js(process.env 기준)를 사용하므로,
  // require 이전에 DB_NAME을 이 스크립트 전용 스키마로 고정해둔다(파일 상단에서 이미 처리).
  const { run } = require('../../db/migrations/run');

  await step('마이그레이션 0002~0007이 구버전 스키마에 오류 없이 적용된다', async () => {
    await run();
  });

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: CHECK_DB_NAME,
  });

  const columnExists = async (table, column) => {
    const [rows] = await conn.query(
      `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [CHECK_DB_NAME, table, column]
    );
    return rows.length > 0;
  };

  const indexExists = async (table, indexName) => {
    const [rows] = await conn.query(
      `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
      [CHECK_DB_NAME, table, indexName]
    );
    return rows.length > 0;
  };

  const fkExists = async (table, column, referencedTable) => {
    const [rows] = await conn.query(
      `SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? AND REFERENCED_TABLE_NAME = ?`,
      [CHECK_DB_NAME, table, column, referencedTable]
    );
    return rows.length > 0;
  };

  await step('email_verifications.purpose 컬럼이 생성됐다', async () => {
    assert.ok(await columnExists('email_verifications', 'purpose'));
  });

  await step('child_profiles.active_owner_id 생성 컬럼 + UNIQUE 인덱스가 생성됐다', async () => {
    assert.ok(await columnExists('child_profiles', 'active_owner_id'));
    assert.ok(await indexExists('child_profiles', 'uq_child_profiles_active_owner'));
  });

  await step('마이그레이션이 기존 중복 활성 프로필을 정리해 유저당 활성 프로필이 1개로 줄었다', async () => {
    const [rows] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM child_profiles WHERE user_id = 1 AND is_active = 1`
    );
    assert.strictEqual(rows[0].cnt, 1);
  });

  await step('guardian_settings.pin_failed_attempts / pin_locked_until 컬럼이 생성됐다', async () => {
    assert.ok(await columnExists('guardian_settings', 'pin_failed_attempts'));
    assert.ok(await columnExists('guardian_settings', 'pin_locked_until'));
  });

  await step(
    'guardian_settings.pin_version / reauth_failed_attempts / reauth_locked_until 컬럼이 생성됐다',
    async () => {
      assert.ok(await columnExists('guardian_settings', 'pin_version'));
      assert.ok(await columnExists('guardian_settings', 'reauth_failed_attempts'));
      assert.ok(await columnExists('guardian_settings', 'reauth_locked_until'));
    }
  );

  await step('usage_daily_summaries 테이블이 생성됐다', async () => {
    const [rows] = await conn.query(
      `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usage_daily_summaries'`,
      [CHECK_DB_NAME]
    );
    assert.strictEqual(rows.length, 1);
    assert.ok(await indexExists('usage_daily_summaries', 'uq_usage_daily_summaries_child_date'));
  });

  await step('child_profiles/guardian_settings/refresh_tokens에 users로의 FK가 생성됐다', async () => {
    assert.ok(await fkExists('child_profiles', 'user_id', 'users'));
    assert.ok(await fkExists('guardian_settings', 'user_id', 'users'));
    assert.ok(await fkExists('refresh_tokens', 'user_id', 'users'));
  });

  await step(
    'child_profiles→users FK는 RESTRICT다 (생성 컬럼 의존성 때문에 CASCADE 불가) — 자녀가 있으면 유저 삭제가 막힌다',
    async () => {
      await assert.rejects(
        () => conn.query(`DELETE FROM users WHERE user_id = 1;`),
        /foreign key constraint/i,
        '자녀 프로필이 남아있는데 유저 삭제가 성공하면 안 됩니다.'
      );
    }
  );

  await step('child_profiles 삭제 시 연결된 usage_daily_summaries도 CASCADE 삭제된다', async () => {
    const [[remainingProfile]] = await conn.query(
      `SELECT child_profile_id FROM child_profiles WHERE user_id = 1 LIMIT 1;`
    );
    await conn.query(
      `INSERT INTO usage_daily_summaries (child_profile_id, usage_date, accumulated_seconds, created_at, updated_at)
       VALUES (?, CURDATE(), 10, ?, ?);`,
      [remainingProfile.child_profile_id, now, now]
    );

    await conn.query(`DELETE FROM child_profiles WHERE child_profile_id = ?;`, [remainingProfile.child_profile_id]);

    const [[{ cnt: usageCnt }]] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM usage_daily_summaries WHERE child_profile_id = ?;`,
      [remainingProfile.child_profile_id]
    );
    assert.strictEqual(usageCnt, 0, 'child_profiles 삭제 시 usage_daily_summaries도 CASCADE 삭제되어야 합니다.');
  });

  await step(
    'guardian_settings/refresh_tokens→users FK는 CASCADE다 — 자녀 프로필을 모두 정리한 뒤 유저를 삭제하면 함께 삭제된다',
    async () => {
      await conn.query(`DELETE FROM child_profiles WHERE user_id = 1;`); // 남은 자녀 프로필 정리
      await conn.query(
        `INSERT INTO refresh_tokens (user_id, token, expires_at, created_at) VALUES (1, 'tok', ?, ?);`,
        [now, now]
      );
      await conn.query(
        `INSERT INTO guardian_settings (user_id, push_enabled, created_at, updated_at) VALUES (1, 1, ?, ?);`,
        [now, now]
      );

      await conn.query(`DELETE FROM users WHERE user_id = 1;`);

      const [[{ cnt: settingCnt }]] = await conn.query(
        `SELECT COUNT(*) AS cnt FROM guardian_settings WHERE user_id = 1;`
      );
      const [[{ cnt: tokenCnt }]] = await conn.query(`SELECT COUNT(*) AS cnt FROM refresh_tokens WHERE user_id = 1;`);

      assert.strictEqual(settingCnt, 0, 'users 삭제 시 guardian_settings도 CASCADE 삭제되어야 합니다.');
      assert.strictEqual(tokenCnt, 0, 'users 삭제 시 refresh_tokens도 CASCADE 삭제되어야 합니다.');
    }
  );

  await step('마이그레이션을 다시 실행해도 오류 없이 통과한다 (idempotent)', async () => {
    await run();
  });

  // ── sequelize.sync()로 만든 스키마에도 적용되는지 ──────────────────────────
  //
  // 위 BASELINE_SQL은 child_profiles.user_id에 FK를 걸지 않아 이 경로를 타지 않는다.
  // 그런데 실제 로컬 세팅은 `sync()` → `migrate` 순서로 하고, sync()가 만드는 FK는
  // (onUpdate를 명시하지 않으면) ON UPDATE CASCADE다. InnoDB는 STORED 생성 컬럼이
  // 의존하는 컬럼에 그런 FK를 허용하지 않아 0003이 ERROR 1215로 실패했었다.
  const SYNC_DB_NAME = 'hanium_migration_sync_check';

  await step('sync()가 만든 ON UPDATE CASCADE FK 위에서도 마이그레이션이 적용된다', async () => {
    const admin = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      multipleStatements: true,
    });
    await admin.query(`DROP DATABASE IF EXISTS \`${SYNC_DB_NAME}\``);
    await admin.query(`CREATE DATABASE \`${SYNC_DB_NAME}\``);
    await admin.end();

    const syncConn = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: SYNC_DB_NAME,
      multipleStatements: true,
    });
    // sync()가 만드는 것과 같은 모양: user_id에 ON UPDATE CASCADE FK가 걸린 상태.
    await syncConn.query(BASELINE_SQL);
    await syncConn.query(
      'ALTER TABLE child_profiles ADD CONSTRAINT child_profiles_ibfk_1 ' +
        'FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE'
    );

    process.env.DB_NAME = SYNC_DB_NAME;
    try {
      // env.js와 run.js는 모듈 로드 시점의 DB_NAME을 캐시한다. 캐시를 비워야 위에서 바꾼
      // DB_NAME이 반영된다 — 안 그러면 조용히 앞의 DB에 다시 적용되고 통과해 버린다.
      delete require.cache[require.resolve('../../src/config/env')];
      delete require.cache[require.resolve('../../db/migrations/run')];
      const { run: runOnSyncDb } = require('../../db/migrations/run');

      // 여기서 던지면 0003이 다시 깨진 것이다.
      await runOnSyncDb();

      const [cols] = await syncConn.query(
        "SELECT EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? " +
          "AND TABLE_NAME = 'child_profiles' AND COLUMN_NAME = 'active_owner_id'",
        [SYNC_DB_NAME]
      );
      assert.strictEqual(cols.length, 1, 'active_owner_id 생성 컬럼이 만들어지지 않았습니다.');

      // 0003이 떼어낸 FK를 0006이 호환되는 규칙으로 다시 걸어줘야 한다.
      const [fks] = await syncConn.query(
        'SELECT UPDATE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS ' +
          "WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = 'child_profiles'",
        [SYNC_DB_NAME]
      );
      assert.strictEqual(fks.length, 1, `child_profiles의 FK가 ${fks.length}개입니다 (1개여야 함).`);
      assert.ok(
        ['RESTRICT', 'NO ACTION'].includes(fks[0].UPDATE_RULE),
        `FK의 UPDATE_RULE이 ${fks[0].UPDATE_RULE}입니다 (RESTRICT여야 함).`
      );
    } finally {
      process.env.DB_NAME = CHECK_DB_NAME;
      delete require.cache[require.resolve('../../src/config/env')];
      delete require.cache[require.resolve('../../db/migrations/run')];
      await syncConn.query(`DROP DATABASE IF EXISTS \`${SYNC_DB_NAME}\``).catch(() => {});
      await syncConn.end();
    }
  });

  await conn.end();

  console.log(`\n마이그레이션 스모크 테스트 결과: ${passCount} passed, ${failCount} failed`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('마이그레이션 스모크 테스트 실행 중 예외 발생:', err);
  process.exit(1);
});
