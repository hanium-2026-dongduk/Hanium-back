require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

// 운영 환경에서는 개발용 기본 JWT secret을 사용하지 못하도록 기동 시점에 차단한다.
if (isProduction && (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET)) {
  throw new Error(
    'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set via environment variables in production.'
  );
}

module.exports = {
  port: process.env.PORT || 3000,
  db: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
  mail: {
    host: process.env.MAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.MAIL_PORT, 10) || 587,
    user: process.env.MAIL_USER,
    password: process.env.MAIL_PASSWORD,
    from: process.env.MAIL_FROM || process.env.MAIL_USER,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'access-secret-dev',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'refresh-secret-dev',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
};
