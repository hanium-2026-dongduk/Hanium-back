const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { STICKER_CODES, MAX_MESSAGE_LENGTH } = require('../config/stickerCatalog');

/**
 * 보호자가 자녀에게 보낸 칭찬 스티커 (PD04_STK_01, MP05_STK_01).
 *
 * 스티커 "종류"는 DB가 아니라 src/config/stickerCatalog.js에 있고, 이 테이블은 **누가
 * 누구에게 무엇을 언제 보냈는지만** 기록한다. 그래서 sticker_code는 FK가 아니라
 * VARCHAR이며 검증은 isIn으로 한다 — child_badges.badge_code와 같은 컨벤션이다.
 *
 * 배지(child_badges)와 달리 UNIQUE 제약이 없다. 같은 스티커를 여러 번 보내는 것이
 * 정상이기 때문이다 — 배지는 "한 번 달성하는 것", 스티커는 "계속 주고받는 것"이다.
 *
 * sender_user_id는 지금은 언제나 자녀 프로필의 소유자와 같다(소유자만 보낼 수 있으므로).
 * 그래도 별도로 남기는 이유: 나중에 보호자가 여러 명이 되면 "누가 보냈는지"가 달라지고,
 * 그때 과거 기록에서 발신자를 되살릴 방법이 없기 때문이다.
 */
const StickerSend = sequelize.define(
  'StickerSend',
  {
    sticker_send_id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    child_profile_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    sender_user_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    // ENUM 대신 STRING + isIn — 스티커 추가에 마이그레이션이 필요 없도록
    sticker_code: {
      type: DataTypes.STRING(40),
      allowNull: false,
      validate: {
        isIn: [STICKER_CODES],
      },
    },
    /** 보호자가 함께 보내는 한마디(선택). */
    message: {
      type: DataTypes.STRING(MAX_MESSAGE_LENGTH),
      allowNull: true,
    },
    sent_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'sticker_sends',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    // 자녀별 최신순 조회가 유일한 읽기 패턴이다.
    indexes: [{ fields: ['child_profile_id', 'sent_at'] }],
  }
);

module.exports = StickerSend;
