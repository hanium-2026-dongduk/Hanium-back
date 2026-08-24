const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const QuizSet = sequelize.define('QuizSet', {
  quiz_set_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  story_id: { type: DataTypes.INTEGER, allowNull: false },
  source_type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'story' },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
  generated_at: { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'quiz_sets', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

module.exports = QuizSet;