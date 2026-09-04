const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const QuizAttempt = sequelize.define('QuizAttempt', {
  quiz_attempt_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  child_profile_id: { type: DataTypes.INTEGER, allowNull: false },
  quiz_set_id: { type: DataTypes.INTEGER, allowNull: false },
  total_questions: { type: DataTypes.INTEGER, allowNull: false },
  correct_count: { type: DataTypes.INTEGER, allowNull: false },
  score: { type: DataTypes.INTEGER, allowNull: false },
  answers: { type: DataTypes.JSON, allowNull: false },
  submitted_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, { tableName: 'quiz_attempts', timestamps: false });

module.exports = QuizAttempt;