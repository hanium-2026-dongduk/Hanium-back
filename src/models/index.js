const sequelize = require('../config/database');
const Character = require('./character.model');
const Story = require('./story.model');
const StoryPage = require('./storyPage.model');
const StoryPageIllustration = require('./storyPageIllustration.model');
const StoryPageTts = require('./storyPageTts.model');

// 동화 생성 관련 관계
Character.hasMany(Story, { foreignKey: 'character_id', onDelete: 'RESTRICT' });
Story.belongsTo(Character, { foreignKey: 'character_id' });

Story.hasMany(StoryPage, { foreignKey: 'story_id', onDelete: 'CASCADE' });
StoryPage.belongsTo(Story, { foreignKey: 'story_id' });

StoryPage.hasOne(StoryPageIllustration, { foreignKey: 'story_page_id', onDelete: 'CASCADE' });
StoryPageIllustration.belongsTo(StoryPage, { foreignKey: 'story_page_id' });

StoryPage.hasOne(StoryPageTts, { foreignKey: 'story_page_id', onDelete: 'CASCADE' });
StoryPageTts.belongsTo(StoryPage, { foreignKey: 'story_page_id' });

// ⚠️ 임시: ChildProfile 관계는 금요일 A개발자 브랜치 병합 후 추가 예정
// ChildProfile.hasMany(Story, { foreignKey: 'child_profile_id', onDelete: 'CASCADE' });
// Story.belongsTo(ChildProfile, { foreignKey: 'child_profile_id' });

const db = {
  sequelize,
  Character,
  Story,
  StoryPage,
  StoryPageIllustration,
  StoryPageTts,
};

module.exports = db;