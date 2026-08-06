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
    pin_failed_attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    pin_locked_until: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // PIN이 설정/변경될 때마다 증가한다. guardianToken 발급 시점의 pin_version을
    // payload에 함께 넣어두고, 이후 그 토큰을 사용할 때 DB의 현재 값과 비교해
    // 일치하지 않으면(=그 사이 PIN이 바뀌었으면) 거부한다. stateless JWT인
    // guardianToken을 PIN 변경 시점에 즉시 무효화하기 위한 장치.
    pin_version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    reauth_failed_attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    reauth_locked_until: {
      type: DataTypes.DATE,
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
