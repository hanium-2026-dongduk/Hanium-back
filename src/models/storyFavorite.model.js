const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const StoryFavorite = sequelize.define(
  'StoryFavorite',
  {
    story_favorite_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    child_profile_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    story_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'story_favorites',
    timestamps: false,
    indexes: [{ unique: true, fields: ['child_profile_id', 'story_id'] }],
  }
);

module.exports = StoryFavorite;