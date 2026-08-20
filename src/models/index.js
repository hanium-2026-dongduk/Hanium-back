const sequelize = require('../config/database');
const User = require('./user.model');
const EmailVerification = require('./emailVerification.model');
const RefreshToken = require('./refreshToken.model');
const ChildProfile = require('./childProfile.model');
const GuardianSetting = require('./guardianSetting.model');
const UsageDailySummary = require('./usageDailySummary.model');
const AttendanceLog = require('./attendanceLog.model');
const DailyMission = require('./dailyMission.model');
const RewardWallet = require('./rewardWallet.model');
const RewardTransaction = require('./rewardTransaction.model');
const ChildBadge = require('./childBadge.model');
const StickerSend = require('./stickerSend.model');

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

// Week3 — 자녀 소유 데이터는 프로필이 삭제되면 함께 삭제된다(usage_daily_summaries와
// 동일 정책). child_profiles.user_id와 달리 이 FK들은 생성 컬럼의 베이스가 아니므로
// CASCADE에 제약이 없다.
ChildProfile.hasMany(AttendanceLog, { foreignKey: 'child_profile_id', onDelete: 'CASCADE' });
AttendanceLog.belongsTo(ChildProfile, { foreignKey: 'child_profile_id' });

ChildProfile.hasMany(DailyMission, { foreignKey: 'child_profile_id', onDelete: 'CASCADE' });
DailyMission.belongsTo(ChildProfile, { foreignKey: 'child_profile_id' });

ChildProfile.hasOne(RewardWallet, { foreignKey: 'child_profile_id', onDelete: 'CASCADE' });
RewardWallet.belongsTo(ChildProfile, { foreignKey: 'child_profile_id' });

ChildProfile.hasMany(RewardTransaction, { foreignKey: 'child_profile_id', onDelete: 'CASCADE' });
RewardTransaction.belongsTo(ChildProfile, { foreignKey: 'child_profile_id' });

// Week4 — 배지 획득 기록. 배지 "종류"는 DB가 아니라 src/config/badgeCatalog.js에 있다.
ChildProfile.hasMany(ChildBadge, { foreignKey: 'child_profile_id', onDelete: 'CASCADE' });
ChildBadge.belongsTo(ChildProfile, { foreignKey: 'child_profile_id' });

// 칭찬 스티커. 자녀가 지워지면 함께 지우되, 보낸 보호자가 지워질 때는 막는다(RESTRICT) —
// 아이가 받은 칭찬 기록이 계정 삭제로 조용히 사라지지 않게 하기 위함이다.
ChildProfile.hasMany(StickerSend, { foreignKey: 'child_profile_id', onDelete: 'CASCADE' });
StickerSend.belongsTo(ChildProfile, { foreignKey: 'child_profile_id' });
User.hasMany(StickerSend, { foreignKey: 'sender_user_id', onDelete: 'RESTRICT' });
StickerSend.belongsTo(User, { foreignKey: 'sender_user_id', as: 'sender' });

const db = {
  sequelize,
  User,
  EmailVerification,
  RefreshToken,
  ChildProfile,
  GuardianSetting,
  UsageDailySummary,
  AttendanceLog,
  DailyMission,
  RewardWallet,
  RewardTransaction,
  ChildBadge,
  StickerSend,
};

module.exports = db;
