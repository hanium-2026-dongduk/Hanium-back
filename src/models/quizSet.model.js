const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const QuizSet = sequelize.define('QuizSet', {
  quiz_set_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  story_id: { type: DataTypes.BIGINT, allowNull: true }, // 단어장 기반 퀴즈는 특정 동화에 안 묶일 수 있어 nullable로 변경
  child_profile_id: { type: DataTypes.BIGINT, allowNull: true }, // story JOIN 없이도 소유권 확인 가능하도록 직접 보유
  source_type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'story' },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
  generated_at: { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'quiz_sets', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

module.exports = QuizSet;