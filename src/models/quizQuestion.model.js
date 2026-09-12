const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const QuizQuestion = sequelize.define('QuizQuestion', {
  quiz_question_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  quiz_set_id: { type: DataTypes.INTEGER, allowNull: false },
  question_order: { type: DataTypes.INTEGER, allowNull: false },
  question_text: { type: DataTypes.TEXT, allowNull: false },
  question_type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'multiple_choice' },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, { tableName: 'quiz_questions', timestamps: false });

module.exports = QuizQuestion;