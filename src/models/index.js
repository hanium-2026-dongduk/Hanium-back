const sequelize = require('../config/database');

// 여기에 모델을 추가하고 db 객체에 등록합니다.
// 예: db.User = require('./user.model')(sequelize);

const db = {
  sequelize,
};

module.exports = db;
