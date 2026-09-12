const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Character = sequelize.define('Character', {
  character_id: {
    // stories.character_id와 FK 타입이 정확히 같아야 MySQL이 제약을 생성할 수 있다.
    // 마이그레이션(0014)도 양쪽 키를 BIGINT로 정의한다.
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  personality: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: '밝음',
  },
  description: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  image_url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  type: {
    type: DataTypes.ENUM('PRESET', 'CUSTOM', 'RANDOM'),
    allowNull: false,
    defaultValue: 'CUSTOM',
  },
}, {
  tableName: 'characters',
  underscored: true,
  timestamps: true,
});

module.exports = Character;
