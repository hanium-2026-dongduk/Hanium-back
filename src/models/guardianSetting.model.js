const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const GuardianSetting = sequelize.define(
  'GuardianSetting',
  {
    setting_id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      unique: true,
    },
    parent_pin_hash: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    daily_usage_limit_minutes: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    push_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'guardian_settings',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

module.exports = GuardianSetting;
