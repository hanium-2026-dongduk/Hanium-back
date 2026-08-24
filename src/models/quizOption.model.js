const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const QuizOption = sequelize.define('QuizOption', {
  quiz_option_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  quiz_question_id: { type: DataTypes.INTEGER, allowNull: false },
  option_order: { type: DataTypes.INTEGER, allowNull: false },
  option_text: { type: DataTypes.TEXT, allowNull: false },
  is_correct: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, { tableName: 'quiz_options', timestamps: false });

module.exports = QuizOption;