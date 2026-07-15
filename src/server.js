const app = require('./app');
const env = require('./config/env');
const sequelize = require('./config/database');

const start = async () => {
  try {
    await sequelize.authenticate();
    console.log('DB connection established.');
  } catch (err) {
    console.error('Unable to connect to the DB:', err.message);
  }

  app.listen(env.port, () => {
    console.log(`Server running on port ${env.port}`);
  });
};

start();
