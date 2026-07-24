const sequelize = require('../config/database');
const User = require('./user.model');
const EmailVerification = require('./emailVerification.model');

const db = {
  sequelize,
  User,
  EmailVerification,
};

module.exports = db;
