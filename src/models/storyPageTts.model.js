const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const StoryPageTts = sequelize.define('StoryPageTts', {
  tts_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  story_page_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  audio_url: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  tableName: 'story_page_tts',
  underscored: true,
  timestamps: true,
});

module.exports = StoryPageTts;