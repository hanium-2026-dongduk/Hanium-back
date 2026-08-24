const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const VocabularyEntry = sequelize.define(
  'VocabularyEntry',
  {
    vocabulary_entry_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    child_profile_id: { type: DataTypes.INTEGER, allowNull: false },
    story_id: { type: DataTypes.INTEGER, allowNull: true },
    english_word: { type: DataTypes.STRING(100), allowNull: false },
    korean_meaning: { type: DataTypes.STRING(255), allowNull: false },
    example_sentence: { type: DataTypes.TEXT, allowNull: true },
    is_favorite: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { tableName: 'vocabulary_entries', timestamps: false }
);

module.exports = VocabularyEntry;