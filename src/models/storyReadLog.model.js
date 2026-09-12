const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const StoryReadLog = sequelize.define(
  'StoryReadLog',
  {
    story_read_log_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    child_profile_id: { type: DataTypes.BIGINT, allowNull: false },
    story_id: { type: DataTypes.BIGINT, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    tableName: 'story_read_logs',
    timestamps: false,
    indexes: [{ unique: true, fields: ['child_profile_id', 'story_id'] }],
  }
);

module.exports = StoryReadLog;