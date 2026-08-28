const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { MISSION_TYPES } = require('../config/missionCatalog');

/**
 * 자녀별 하루치 데일리 미션 진행 상태 (MN03, RW01_POINT_02).
 *
 * 스케줄러 없이 그날 첫 접근 시점에 지연 생성되며(WEEK3_A_DESIGN.md 3-2절),
 * UNIQUE(child_profile_id, mission_date, mission_type)가 중복 생성·중복 보상의
 * 근본 방어선이다.
 *
 * 상태 전이: pending →(progress_count ≥ target_count)→ completed →(포인트 지급 성공)→ rewarded
 * completed와 rewarded를 나눈 이유는 "진행도 달성"과 "포인트 실제 지급"이 재시도 시
 * 어디까지 진행됐는지 구분할 근거가 되기 때문이다.
 */
const DailyMission = sequelize.define(
  'DailyMission',
  {
    daily_mission_id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    child_profile_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    // Asia/Seoul 캘린더 기준 날짜
    mission_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    // ENUM 대신 STRING + isIn — 미션 종류 추가에 마이그레이션이 필요 없도록
    // (learning_level, EmailVerification.purpose와 동일 컨벤션)
    mission_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
      validate: {
        isIn: [MISSION_TYPES],
      },
    },
    // 생성 시점의 카탈로그 값을 행에 복사해 둔다 — 카탈로그 수치를 나중에 바꿔도
    // 이미 진행 중인 미션의 목표/보상이 소급 변경되지 않게 하기 위함.
    target_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    progress_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    reward_points: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
      validate: {
        isIn: [['pending', 'completed', 'rewarded']],
      },
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    rewarded_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'daily_missions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [{ unique: true, fields: ['child_profile_id', 'mission_date', 'mission_type'] }],
  }
);

module.exports = DailyMission;
