const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const StoryPage = sequelize.define('StoryPage', {
  story_page_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  story_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  page_number: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
}, {
  tableName: 'story_pages',
  underscored: true,
  timestamps: true,
});

module.exports = StoryPage;