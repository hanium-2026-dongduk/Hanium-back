const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * 자녀 프로필별 "하루(Asia/Seoul 캘린더 기준) 누적 사용 시간" 집계 행.
 * 클라이언트가 주기적으로 보내는 heartbeat 요청마다 서버가 직접 계산한 경과
 * 시간만큼만 accumulated_seconds를 증가시킨다 — 클라이언트가 값을 조작해 보낼
 * 여지가 없다. (자세한 설계 근거는 docs/USAGE_TRACKING_DESIGN.md 참고)
 */
const UsageDailySummary = sequelize.define(
  'UsageDailySummary',
  {
    usage_summary_id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    child_profile_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    usage_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    accumulated_seconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    last_heartbeat_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'usage_daily_summaries',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [{ unique: true, fields: ['child_profile_id', 'usage_date'] }],
  }
);

module.exports = UsageDailySummary;
