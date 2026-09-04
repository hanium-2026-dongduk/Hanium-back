const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Story = sequelize.define('Story', {
  story_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  child_profile_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  character_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  background: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  main_event: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  child_age: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  tableName: 'stories',
  underscored: true,
  timestamps: true,
});

module.exports = Story;