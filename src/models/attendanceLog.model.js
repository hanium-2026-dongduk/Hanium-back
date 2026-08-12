const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * 자녀별 일일 출석 기록 (MN04, MP03/PD02의 월간 출석률 근거 데이터).
 *
 * UNIQUE(child_profile_id, attendance_date)로 "자녀별 출석은 하루 한 번"을 DB 레벨에서
 * 강제한다 — 동시에 여러 출석 요청이 들어와도 실제 기록(과 포인트 지급)은 정확히 한 번만
 * 일어난다. 생성 후 수정되지 않는 불변 로그라 updated_at을 두지 않는다
 * (refresh_tokens와 동일 패턴).
 */
const AttendanceLog = sequelize.define(
  'AttendanceLog',
  {
    attendance_log_id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    child_profile_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    // Asia/Seoul 캘린더 기준 날짜. 서버 타임존과 무관하게 utils/dateUtils에서 계산한다.
    attendance_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    // 서버가 실제로 처리한 시각(감사용). attendance_date와 달리 시:분:초를 보존한다.
    checked_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    tableName: 'attendance_logs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [{ unique: true, fields: ['child_profile_id', 'attendance_date'] }],
  }
);

module.exports = AttendanceLog;
