const sequelize = require('../config/database');
const User = require('./user.model');
const EmailVerification = require('./emailVerification.model');
const RefreshToken = require('./refreshToken.model');
const ChildProfile = require('./childProfile.model');
const GuardianSetting = require('./guardianSetting.model');
const UsageDailySummary = require('./usageDailySummary.model');

// 관계 설정
User.hasMany(RefreshToken, { foreignKey: 'user_id', onDelete: 'CASCADE' });
RefreshToken.belongsTo(User, { foreignKey: 'user_id' });

// onDelete는 RESTRICT (CASCADE 아님) — child_profiles.user_id는 활성 프로필 단일성을
// 강제하는 STORED 생성 컬럼(active_owner_id)의 베이스 컬럼인데, InnoDB는 생성 컬럼이
// 의존하는 컬럼에 CASCADE/SET NULL FK를 거는 것을 허용하지 않는다. 실제 DB 제약과
// 동일하게 맞춰둔다 (db/migrations/0006_add_missing_user_foreign_keys.sql 참고).
User.hasMany(ChildProfile, { foreignKey: 'user_id', onDelete: 'RESTRICT' });
ChildProfile.belongsTo(User, { foreignKey: 'user_id' });

User.hasOne(GuardianSetting, { foreignKey: 'user_id', onDelete: 'CASCADE' });
GuardianSetting.belongsTo(User, { foreignKey: 'user_id' });

ChildProfile.hasMany(UsageDailySummary, { foreignKey: 'child_profile_id', onDelete: 'CASCADE' });
UsageDailySummary.belongsTo(ChildProfile, { foreignKey: 'child_profile_id' });

const db = {
  sequelize,
  User,
  EmailVerification,
  RefreshToken,
  ChildProfile,
  GuardianSetting,
  UsageDailySummary,
};

module.exports = db;
