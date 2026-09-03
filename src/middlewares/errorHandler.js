const env = require('../config/env');
const response = require('../utils/response');

/**
 * 라우터가 처리하지 않은 경로.
 *
 * 응답 형식을 공통 봉투(`{ success, message }`)로 맞춘다 — 예전에는 `{ message }`만
 * 돌려줘서, "모든 응답은 봉투에 담긴다"는 계약을 404·500에서만 어기고 있었다.
 */
const notFound = (req, res) => {
  return response.error(res, 404, `요청한 경로를 찾을 수 없습니다: ${req.originalUrl}`);
};

/**
 * 마지막 에러 처리기.
 *
 * `statusCode`가 붙은 오류는 서비스가 의도적으로 던진 것이라 메시지를 그대로 보여준다
 * (예: "이미 가입된 이메일입니다"). 반면 **처리되지 않은 오류(500)의 메시지는 내보내지 않는다** —
 * Sequelize나 드라이버의 원문에는 테이블·컬럼명, SQL 조각이 들어 있어 스키마가 새어나간다.
 *
 * 스택트레이스는 원래도 응답에 넣지 않았지만, 서버 로그에는 남겨야 원인을 찾을 수 있다.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  if (statusCode >= 500) {
    // 로그에는 전문을 남긴다. 응답으로 나가지 않는다.
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  }

  const message =
    statusCode >= 500 && env.isProduction
      ? '서버 오류가 발생했습니다.'
      : err.message || '서버 오류가 발생했습니다.';

  return response.error(res, statusCode, message);
};

module.exports = { notFound, errorHandler };
