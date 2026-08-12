const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * 포인트 지급 원장 (RW03_HISTORY_01 — 날짜/유형별 포인트 획득 기록).
 *
 * reward_wallets.points는 "현재 잔액" 하나뿐이라 이력 조회도, "이 이벤트를 이미
 * 처리했는가"의 판단도 불가능하다. 이 테이블이 그 두 가지를 모두 담당한다:
 *  - UNIQUE(child_profile_id, idempotency_key)가 중복 지급을 DB 레벨에서 차단하고,
 *  - balance_after 스냅샷이 이력 재계산 없이 시점별 잔액 조회를 가능하게 한다.
 *
 * 원장이므로 생성 후 수정·삭제하지 않는다(updated_at 없음).
 */
const RewardTransaction = sequelize.define(
  'RewardTransaction',
  {
    reward_transaction_id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    child_profile_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    // 이번 설계는 "지급"만 다룬다 — 차감/환수가 필요해지면 음수 허용 정책과
    // reward_wallets의 CHECK(points>=0)를 함께 재검토해야 한다(8절 7번).
    points: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1 },
    },
    // ENUM이 아닌 STRING — 개발자 B가 새 지급 사유를 추가할 때 마이그레이션이 필요 없도록.
    // 값 화이트리스트는 reward.service.js의 REWARD_REASONS가 관리한다.
    reason: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    // 호출자가 보장하는 고유 키. 컨벤션: `{domain}:{그 도메인에서의 고유 PK}`
    idempotency_key: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    // 이 거래 직후의 잔액 스냅샷
    balance_after: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    tableName: 'reward_transactions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['child_profile_id', 'idempotency_key'] },
      // GET /rewards/:childId/history의 날짜 역순 페이지네이션용
      { fields: ['child_profile_id', 'created_at'] },
    ],
  }
);

module.exports = RewardTransaction;
