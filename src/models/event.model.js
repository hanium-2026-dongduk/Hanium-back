const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Event = sequelize.define('Event', {
  event_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  title: { type: DataTypes.STRING(200), allowNull: false },
  content: { type: DataTypes.TEXT, allowNull: false },
  starts_at: { type: DataTypes.DATE, allowNull: false },
  ends_at: { type: DataTypes.DATE, allowNull: false },
  is_published: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, { tableName: 'events', underscored: true, timestamps: true });

module.exports = Event;
