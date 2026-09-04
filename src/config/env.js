require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

// 운영 환경에서는 개발용 기본 JWT secret을 사용하지 못하도록 기동 시점에 차단한다.
if (isProduction && (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET)) {
  throw new Error(
    'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set via environment variables in production.'
  );
}

/**
 * CORS 허용 출처.
 *
 * 비워두면 **모든 출처를 허용**한다 — 개발 중에는 그게 편하지만 운영에서는 위험하다.
 * 앱이 브라우저에서 돌지 않는(Flutter 네이티브) 지금은 실질 위험이 낮지만, 나중에
 * 웹 클라이언트가 붙거나 관리자 페이지가 생기면 반드시 채워야 한다.
 *
 * 예: CORS_ORIGINS=https://app.example.com,https://admin.example.com
 */
const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

module.exports = {
  port: process.env.PORT || 3000,
  isProduction,
  corsOrigins,
  /**
   * Nginx 뒤에서 돌 때 실제 클라이언트 IP를 알기 위한 신뢰 프록시 수. 이걸 켜지 않으면
   * rate limit이 **모든 요청을 Nginx 하나의 IP로 보고** 전체 사용자를 함께 막아버린다.
   * 반대로 프록시가 없는데 켜면 클라이언트가 X-Forwarded-For를 위조해 제한을 우회할 수 있다.
   */
  trustProxy: process.env.TRUST_PROXY === 'true',
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
