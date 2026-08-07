const sequelize = require('../config/database');
const User = require('./user.model');
const EmailVerification = require('./emailVerification.model');
const RefreshToken = require('./refreshToken.model');
const ChildProfile = require('./childProfile.model');
const GuardianSetting = require('./guardianSetting.model');
const UsageDailySummary = require('./usageDailySummary.model');
const Character = require('./character.model');
const Story = require('./story.model');
const StoryPage = require('./storyPage.model');
const StoryPageIllustration = require('./storyPageIllustration.model');
const StoryPageTts = require('./storyPageTts.model');

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

// 동화 생성 관련 관계
// 자녀 프로필이 삭제되면 해당 프로필로 생성된 동화도 함께 정리한다.
ChildProfile.hasMany(Story, { foreignKey: 'child_profile_id', onDelete: 'CASCADE' });
Story.belongsTo(ChildProfile, { foreignKey: 'child_profile_id' });

// 캐릭터는 여러 동화에서 재사용될 수 있으므로, 캐릭터 삭제 시 동화까지 지우진 않고
// 참조 무결성만 강제한다 (RESTRICT).
Character.hasMany(Story, { foreignKey: 'character_id', onDelete: 'RESTRICT' });
Story.belongsTo(Character, { foreignKey: 'character_id' });

Story.hasMany(StoryPage, { foreignKey: 'story_id', onDelete: 'CASCADE' });
StoryPage.belongsTo(Story, { foreignKey: 'story_id' });

StoryPage.hasOne(StoryPageIllustration, { foreignKey: 'story_page_id', onDelete: 'CASCADE' });
StoryPageIllustration.belongsTo(StoryPage, { foreignKey: 'story_page_id' });

StoryPage.hasOne(StoryPageTts, { foreignKey: 'story_page_id', onDelete: 'CASCADE' });
StoryPageTts.belongsTo(StoryPage, { foreignKey: 'story_page_id' });

const db = {
  sequelize,
  User,
  EmailVerification,
  RefreshToken,
  ChildProfile,
  GuardianSetting,
  UsageDailySummary,
  Character,
  Story,
  StoryPage,
  StoryPageIllustration,
  StoryPageTts,
};

module.exports = db;
