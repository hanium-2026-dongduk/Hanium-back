const sequelize = require('../config/database');
const Character = require('./character.model');
const Story = require('./story.model');
const StoryPage = require('./storyPage.model');
const StoryPageIllustration = require('./storyPageIllustration.model');
const StoryPageTts = require('./storyPageTts.model');
const User = require('./user.model');
const EmailVerification = require('./emailVerification.model');
const RefreshToken = require('./refreshToken.model');
const ChildProfile = require('./childProfile.model');
const GuardianSetting = require('./guardianSetting.model');
const UsageDailySummary = require('./usageDailySummary.model');
const StoryFavorite = require('./storyFavorite.model');
const VocabularyEntry = require('./vocabularyEntry.model');
const QuizSet = require('./quizSet.model');
const QuizQuestion = require('./quizQuestion.model');
const QuizOption = require('./quizOption.model');
const AttendanceLog = require('./attendanceLog.model');
const DailyMission = require('./dailyMission.model');
const RewardWallet = require('./rewardWallet.model');
const RewardTransaction = require('./rewardTransaction.model');
const QuizAttempt = require('./quizAttempt.model');

// 동화 생성 관련 관계
Character.hasMany(Story, { foreignKey: 'character_id', onDelete: 'RESTRICT' });
Story.belongsTo(Character, { foreignKey: 'character_id' });

Story.hasMany(StoryPage, { foreignKey: 'story_id', onDelete: 'CASCADE' });
StoryPage.belongsTo(Story, { foreignKey: 'story_id' });

StoryPage.hasOne(StoryPageIllustration, { foreignKey: 'story_page_id', onDelete: 'CASCADE' });
StoryPageIllustration.belongsTo(StoryPage, { foreignKey: 'story_page_id' });

StoryPage.hasOne(StoryPageTts, { foreignKey: 'story_page_id', onDelete: 'CASCADE' });
StoryPageTts.belongsTo(StoryPage, { foreignKey: 'story_page_id' });

// ChildProfile - Story 관계 (0008_create_story_tables.sql에서 child_profile_id 컬럼+FK 확인됨, 활성화)
ChildProfile.hasMany(Story, { foreignKey: 'child_profile_id', onDelete: 'CASCADE' });
Story.belongsTo(ChildProfile, { foreignKey: 'child_profile_id' });

// 인증/계정 관련 관계
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

// 즐겨찾기 관계
ChildProfile.hasMany(StoryFavorite, { foreignKey: 'child_profile_id', onDelete: 'CASCADE' });
StoryFavorite.belongsTo(ChildProfile, { foreignKey: 'child_profile_id' });

Story.hasMany(StoryFavorite, { foreignKey: 'story_id', onDelete: 'CASCADE' });
StoryFavorite.belongsTo(Story, { foreignKey: 'story_id' });

// 단어장 관계
ChildProfile.hasMany(VocabularyEntry, { foreignKey: 'child_profile_id', onDelete: 'CASCADE' });
VocabularyEntry.belongsTo(ChildProfile, { foreignKey: 'child_profile_id' });

// 퀴즈 관계
QuizSet.hasMany(QuizQuestion, { foreignKey: 'quiz_set_id', onDelete: 'CASCADE' });
QuizQuestion.belongsTo(QuizSet, { foreignKey: 'quiz_set_id' });

QuizQuestion.hasMany(QuizOption, { foreignKey: 'quiz_question_id', onDelete: 'CASCADE' });
QuizOption.belongsTo(QuizQuestion, { foreignKey: 'quiz_question_id' });
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

ChildProfile.hasMany(QuizAttempt, { foreignKey: 'child_profile_id', onDelete: 'CASCADE' });
QuizAttempt.belongsTo(ChildProfile, { foreignKey: 'child_profile_id' });

QuizSet.hasMany(QuizAttempt, { foreignKey: 'quiz_set_id', onDelete: 'CASCADE' });
QuizAttempt.belongsTo(QuizSet, { foreignKey: 'quiz_set_id' });

const db = {
  sequelize,
  Character,
  Story,
  StoryPage,
  StoryPageIllustration,
  StoryPageTts,
  User,
  EmailVerification,
  RefreshToken,
  ChildProfile,
  GuardianSetting,
  UsageDailySummary,
  StoryFavorite,
  VocabularyEntry,
  QuizSet,
  QuizQuestion,
  QuizOption,
  AttendanceLog,
  DailyMission,
  RewardWallet,
  RewardTransaction,
  QuizAttempt,
};

module.exports = db;