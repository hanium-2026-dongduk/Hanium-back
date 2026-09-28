const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const StoryGenerationJob = sequelize.define('StoryGenerationJob', {
  job_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.BIGINT, allowNull: false },
  child_profile_id: { type: DataTypes.BIGINT, allowNull: false },
  request_id: { type: DataTypes.STRING(100), allowNull: false },
  request_hash: { type: DataTypes.CHAR(64), allowNull: false },
  input_json: { type: DataTypes.JSON, allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'), allowNull: false, defaultValue: 'pending' },
  claim_token: { type: DataTypes.CHAR(36), allowNull: true },
  lease_until: { type: DataTypes.DATE, allowNull: true },
  attempt_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  story_id: { type: DataTypes.BIGINT, allowNull: true },
  error_message: { type: DataTypes.STRING(255), allowNull: true },
}, {
  tableName: 'story_generation_jobs',
  underscored: true,
  timestamps: true,
  indexes: [
    { unique: true, fields: ['user_id', 'request_id'] },
    { fields: ['status', 'lease_until', 'created_at'] },
    { fields: ['child_profile_id'] },
    { fields: ['story_id'] },
  ],
});

module.exports = StoryGenerationJob;
