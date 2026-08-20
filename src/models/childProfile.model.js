const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ChildProfile = sequelize.define(
  'ChildProfile',
  {
    child_profile_id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    child_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    age: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    learning_level: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'beginner',
      validate: {
        isIn: [['beginner', 'intermediate', 'advanced']],
      },
    },
    vocabulary_level: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    profile_image_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'child_profiles',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

module.exports = ChildProfile;
