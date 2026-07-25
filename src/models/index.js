const sequelize = require('../config/database');
const User = require('./user.model');
const EmailVerification = require('./emailVerification.model');
const RefreshToken = require('./refreshToken.model');
const ChildProfile = require('./childProfile.model');
const GuardianSetting = require('./guardianSetting.model');

// 관계 설정
User.hasMany(RefreshToken, { foreignKey: 'user_id', onDelete: 'CASCADE' });
RefreshToken.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(ChildProfile, { foreignKey: 'user_id', onDelete: 'CASCADE' });
ChildProfile.belongsTo(User, { foreignKey: 'user_id' });

User.hasOne(GuardianSetting, { foreignKey: 'user_id', onDelete: 'CASCADE' });
GuardianSetting.belongsTo(User, { foreignKey: 'user_id' });

const db = {
  sequelize,
  User,
  EmailVerification,
  RefreshToken,
  ChildProfile,
  GuardianSetting,
};

module.exports = db;
