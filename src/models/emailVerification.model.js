const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EmailVerification = sequelize.define(
  'EmailVerification',
  {
    verification_id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING(6),
      allowNull: false,
    },
    purpose: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'signup',
      validate: {
        isIn: [['signup', 'password_reset']],
      },
    },
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    is_verified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    tableName: 'email_verifications',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);

module.exports = EmailVerification;
