const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { BADGE_CODES } = require('../config/badgeCatalog');

/**
 * 자녀가 획득한 배지 (RW04_ACH_02, MP02_RWD_03).
 *
 * 배지 "종류"는 DB가 아니라 src/config/badgeCatalog.js에 있고, 이 테이블은 **누가 무엇을
 * 언제 받았는지만** 기록한다. 그래서 badge_code는 FK가 아니라 VARCHAR이며, 검증은
 * 애플리케이션 레벨(isIn)에서 한다 — daily_missions.mission_type과 같은 컨벤션이다.
 *
 * UNIQUE(child_profile_id, badge_code) — 같은 배지를 두 번 받을 수 없다. 배지 판정이
 * 여러 경로(출석 체크, 미션 보상 등)에서 동시에 돌아도 이 제약이 중복 수여를 막고,
 * 실패한 쪽은 "이미 있음"으로 조용히 넘어간다. 포인트 지급의 idempotency_key와 같은 역할.
 */
const ChildBadge = sequelize.define(
  'ChildBadge',
  {
    child_badge_id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    child_profile_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    // ENUM 대신 STRING + isIn — 배지 추가에 마이그레이션이 필요 없도록
    // (mission_type, learning_level과 동일 컨벤션)
    badge_code: {
      type: DataTypes.STRING(40),
      allowNull: false,
      validate: {
        isIn: [BADGE_CODES],
      },
    },
    // 언제 받았는지. created_at과 같은 값이지만, 나중에 소급 수여 같은 게 생기면
    // "기록 시각"과 "획득 시각"이 갈라질 수 있어 별도 컬럼으로 둔다.
    awarded_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'child_badges',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [{ unique: true, fields: ['child_profile_id', 'badge_code'] }],
  }
);

module.exports = ChildBadge;
