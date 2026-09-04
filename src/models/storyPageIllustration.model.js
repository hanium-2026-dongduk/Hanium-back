const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const StoryPageIllustration = sequelize.define('StoryPageIllustration', {
  illustration_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  story_page_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  image_url: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  tableName: 'story_page_illustrations',
  underscored: true,
  timestamps: true,
});

module.exports = StoryPageIllustration;