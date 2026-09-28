const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const NoticeRead = sequelize.define('NoticeRead', {
  notice_id: { type: DataTypes.BIGINT, primaryKey: true },
  user_id: { type: DataTypes.BIGINT, primaryKey: true },
  read_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, { tableName: 'notice_reads', timestamps: false });

module.exports = NoticeRead;
