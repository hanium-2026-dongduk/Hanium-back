#!/usr/bin/env node
'use strict';

/**
 * db/migrations/*.sql을 파일명 순서대로 실제 DB에 적용하는 러너.
 *
 * 마이그레이션 파일들은 `mysql` CLI 전용 지시문인 `DELIMITER $$ ... $$ DELIMITER ;`로
 * 저장 프로시저 본문 안의 세미콜론을 감싸고 있다(CREATE PROCEDURE 안에서 개별 문장을
 * 구분하기 위해). 이 지시문은 SQL이 아니라 CLI 파서용이므로 서버로 그대로 보내면 에러가
 * 난다. 반면 MySQL 서버 자체(및 mysql2의 multipleStatements 모드)는 CREATE PROCEDURE
 * ... BEGIN ... END 안의 세미콜론을 문법적으로 올바르게 처리하므로, DELIMITER 줄만
 * 제거하고 `$$`를 원래 의도한 문장 종결자 `;`로 되돌려주면 그대로 실행할 수 있다.
 *
 * 사용법:
 *   npm run migrate
 *   (DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD는 .env 또는 환경변수로 지정 — src/config/env.js와 동일)
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../../src/config/env');

const MIGRATIONS_DIR = __dirname;

const toExecutableSql = (raw) => {
  return raw
    .split('\n')
    .filter((line) => !/^\s*DELIMITER\b/i.test(line))
    .join('\n')
    .replace(/\$\$/g, ';');
};

const listMigrationFiles = () => {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();
};

const run = async () => {
  const files = listMigrationFiles();

  if (files.length === 0) {
    console.log('적용할 마이그레이션 파일이 없습니다.');
    return;
  }

  if (!env.db.name) {
    throw new Error('DB_NAME 환경변수가 필요합니다.');
  }

  console.log(`DB(${env.db.host}:${env.db.port}/${env.db.name})에 연결 중...`);
  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.name,
    multipleStatements: true,
  });

  try {
    for (const file of files) {
      const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const sql = toExecutableSql(raw);
      process.stdout.write(`적용 중: ${file} ... `);
      await connection.query(sql);
      console.log('완료');
    }
    console.log(`\n총 ${files.length}개 마이그레이션 파일 적용 완료.`);
  } finally {
    await connection.end();
  }
};

if (require.main === module) {
  run().catch((err) => {
    console.error('\n마이그레이션 적용 중 오류 발생:', err.message);
    process.exit(1);
  });
}

module.exports = { run, toExecutableSql, listMigrationFiles, MIGRATIONS_DIR };
