const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * 자녀별 포인트 지갑 — 현재 잔액/레벨/연속출석일 (MN02, MP02_RWD_01·02, RW02, RW04).
 *
 * 프론트엔드는 화면에 따라 이 `points`를 "토큰"(메인 화면, MN02) 또는 "포인트"(마이페이지,
 * MP02)로 다르게 라벨링한다 — 백엔드에는 재화가 하나뿐이다(WEEK3_A_DESIGN.md 0절).
 *
 * 자녀당 정확히 1행(UNIQUE child_profile_id)이며, child_profiles.create()가 아니라
 * rewardService가 최초 접근 시 지연 생성한다(Week2에 이미 배포된 코드를 건드리지 않기 위함).
 * 잔액은 반드시 rewardService.addPoints()를 통해서만 변경해야 한다 — 직접 UPDATE하면
 * 원장(reward_transactions)과 잔액이 어긋난다.
 */
const RewardWallet = sequelize.define(
  'RewardWallet',
  {
    wallet_id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    child_profile_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      unique: true,
    },
    points: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      // DB에도 CHECK(points >= 0)가 걸려 있다(0010 마이그레이션). 애플리케이션에서도
      // 양수만 가산하므로 이중 방어.
      validate: { min: 0 },
    },
    level: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    streak_days: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    // streak를 마지막으로 갱신한 Asia/Seoul 날짜. "어제"와 비교해 연속/리셋을 판정한다.
    last_activity_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
  },
  {
    tableName: 'reward_wallets',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

module.exports = RewardWallet;
