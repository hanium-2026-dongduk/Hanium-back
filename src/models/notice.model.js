const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Notice = sequelize.define('Notice', {
  notice_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  title: { type: DataTypes.STRING(200), allowNull: false },
  content: { type: DataTypes.TEXT, allowNull: false },
  is_published: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  published_at: { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'notices', underscored: true, timestamps: true });

module.exports = Notice;
