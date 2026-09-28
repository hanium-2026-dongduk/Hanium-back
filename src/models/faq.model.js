const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Faq = sequelize.define('Faq', {
  faq_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  question: { type: DataTypes.STRING(300), allowNull: false },
  answer: { type: DataTypes.TEXT, allowNull: false },
  is_recommended: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  is_published: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  display_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, { tableName: 'faqs', underscored: true, timestamps: true });

module.exports = Faq;
