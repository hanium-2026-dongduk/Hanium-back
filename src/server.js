const app = require('./app');
const env = require('./config/env');
const sequelize = require('./config/database');

/** 종료 신호를 받은 뒤 강제로 끊기까지 기다리는 시간. PM2의 kill_timeout보다 짧아야 한다. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * 처리 중인 요청을 마치고 DB 연결을 닫은 뒤 종료한다.
 *
 * PM2 reload(무중단 재배포)는 옛 워커에 SIGINT를 보내고 새 워커를 띄운다. 이 처리가 없으면
 * 그 순간 처리 중이던 요청이 그대로 끊기고 DB 커넥션도 정리되지 않는다.
 *
 * @param {import('http').Server} server
 * @param {string} signal
 */
const shutdown = (server, signal) => {
  console.log(`${signal} 수신 — 새 요청을 받지 않고 진행 중인 요청을 마칩니다.`);

  // 아무리 기다려도 안 끝나는 요청이 있으면(느린 외부 호출 등) 강제로 종료한다.
  // 이 타이머가 프로세스를 붙잡지 않도록 unref한다.
  const forceExit = setTimeout(() => {
    console.error('시간 내에 정리되지 않아 강제 종료합니다.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close(async () => {
    try {
      await sequelize.close();
      console.log('DB 연결을 닫았습니다.');
    } catch (err) {
      console.error('DB 연결을 닫는 중 오류:', err.message);
    }
    process.exit(0);
  });
};

/**
 * DB 연결 실패 시 서버가 정상 서비스처럼 뜨는 것을 막기 위해
 * authenticate 실패 시 리스닝 없이 프로세스를 종료한다.
 */
const start = async () => {
  try {
    await sequelize.authenticate();
    console.log('DB connection established.');
  } catch (err) {
    console.error('Unable to connect to the DB:', err.message);
    process.exit(1);
    return;
  }

  const server = app.listen(env.port, () => {
    console.log(`Server running on port ${env.port}`);
    // PM2 wait_ready와 짝을 이룬다. 이 신호를 보내야 PM2가 "이 워커는 준비됐다"고 보고
    // 다음 워커를 재시작한다 — reload 중 모든 워커가 동시에 죽는 것을 막는다.
    if (process.send) process.send('ready');
  });

  // SIGINT: PM2 reload / Ctrl+C,  SIGTERM: PM2 stop / 컨테이너 종료
  ['SIGINT', 'SIGTERM'].forEach((signal) => {
    process.on(signal, () => shutdown(server, signal));
  });

  return server;
};

if (require.main === module) {
  start();
}

module.exports = { start };
