const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Character = sequelize.define('Character', {
  character_id: {
    type: DataTypes.INTEGER,
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