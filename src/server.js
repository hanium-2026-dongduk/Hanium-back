const app = require('./app');
const env = require('./config/env');
const sequelize = require('./config/database');

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

  app.listen(env.port, () => {
    console.log(`Server running on port ${env.port}`);
  });
};

if (require.main === module) {
  start();
}

module.exports = { start };
