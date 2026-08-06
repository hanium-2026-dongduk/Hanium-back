const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');

/**
 * 토큰 종류(access/refresh/guardian/reauth)를 payload의 `type` 클레임으로 명시하고,
 * 검증 시 정확한 타입인지 강제한다. access/guardian/reauth 토큰은 같은 secret
 * (env.jwt.accessSecret)을 쓰기 때문에, `type` 검사가 없으면 서명만 유효한 어떤
 * 토큰이든 다른 용도(Authorization 헤더, X-Guardian-Token, X-Reauth-Token)로도
 * 통할 수 있었다 — 예를 들어 PIN 검증으로 받은 guardianToken을 그대로
 * Authorization: Bearer로 보내면 일반 API 인증을 통과해버리는 문제가 있었다.
 *
 * 정책: `type` 클레임이 없거나 기대한 값과 다르면 무조건 거부한다. 이 정책을 도입하기
 * 전에 발급된 토큰(= type 클레임이 없는 토큰)은 서명 자체는 유효하더라도 전부
 * 무효화된다 — refresh token은 DB에 저장된 레코드가 남아있어도 검증 단계에서 항상
 * 거부되므로 재로그인이 필요하다(별도의 DB 정리/마이그레이션은 필요 없음, 어차피
 * 재사용될 수 없기 때문).
 */
const TOKEN_TYPE = { ACCESS: 'access', REFRESH: 'refresh', GUARDIAN: 'guardian', REAUTH: 'reauth' };

const assertTokenType = (decoded, expectedType) => {
  if (decoded.type !== expectedType) {
    const error = new Error(`유효하지 않은 토큰 유형입니다. (expected: ${expectedType})`);
    error.name = 'TokenTypeMismatchError';
    throw error;
  }
  return decoded;
};

/**
 * Access Token 생성
 * @param {object} payload - { user_id, email, role }
 * @returns {string} JWT access token
 */
const generateAccessToken = (payload) => {
  return jwt.sign({ ...payload, type: TOKEN_TYPE.ACCESS }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiresIn,
  });
};

/**
 * Refresh Token 생성
 * jti(고유 식별자)를 포함해 같은 사용자에 대해 같은 초(second)에 여러 번 발급되더라도
 * (예: refresh token rotation) 토큰 문자열이 절대 충돌하지 않도록 한다.
 * @param {object} payload - { user_id }
 * @returns {string} JWT refresh token
 */
const generateRefreshToken = (payload) => {
  return jwt.sign(
    { ...payload, type: TOKEN_TYPE.REFRESH, jti: crypto.randomUUID() },
    env.jwt.refreshSecret,
    { expiresIn: env.jwt.refreshExpiresIn }
  );
};

/**
 * Access Token 검증 — type:'access'가 아니면 거부한다(refresh/guardian/reauth 토큰 재사용 차단).
 * @param {string} token
 * @returns {object} decoded payload
 */
const verifyAccessToken = (token) => {
  return assertTokenType(jwt.verify(token, env.jwt.accessSecret), TOKEN_TYPE.ACCESS);
};

/**
 * Refresh Token 검증 — type:'refresh'가 아니면 거부한다.
 * @param {string} token
 * @returns {object} decoded payload
 */
const verifyRefreshToken = (token) => {
  return assertTokenType(jwt.verify(token, env.jwt.refreshSecret), TOKEN_TYPE.REFRESH);
};

const GUARDIAN_TOKEN_EXPIRES_IN = '10m';
const REAUTH_TOKEN_EXPIRES_IN = '10m';

/**
 * 보호자(Guardian) 토큰 생성
 * PIN 검증(POST /api/guardian/pin/verify)에 성공했을 때만 발급되는 단기 토큰으로,
 * 보호자 전용 기능(예: 사용 시간 제한 변경, 기존 PIN 변경)이 "PIN 검증 API가
 * true를 반환했다"는 클라이언트 주장이 아니라 서버가 발급한 토큰의 존재로 보호되도록
 * 하기 위함이다. accessSecret을 재사용하되 payload의 `type:'guardian'` 클레임으로
 * access token과 용도를 구분한다.
 *
 * payload에는 발급 시점의 `pin_version`을 반드시 포함해야 한다 — 이 토큰의 유효성은
 * 서명/만료뿐 아니라 DB의 현재 pin_version과 일치하는지로도 판단되며(PIN이 바뀌면
 * pin_version이 증가해 기존에 발급된 토큰이 즉시 무효가 된다), 그 비교 로직은
 * guardian.service.js의 isGuardianTokenValid()가 전담한다(이 함수는 서명/타입만 본다).
 *
 * @param {object} payload - { user_id, pin_version }
 */
const generateGuardianToken = (payload) => {
  return jwt.sign({ ...payload, type: TOKEN_TYPE.GUARDIAN }, env.jwt.accessSecret, {
    expiresIn: GUARDIAN_TOKEN_EXPIRES_IN,
  });
};

/**
 * 보호자 토큰 검증 — type:'guardian'이 아니면 거부한다(access/refresh/reauth 토큰 재사용 차단).
 * 서명/타입/만료만 검증하며, pin_version이 DB와 일치하는지는 검사하지 않는다
 * (guardian.service.js의 isGuardianTokenValid 참고 — DB 조회가 필요해 여기(순수 JWT
 * 유틸리티)가 아니라 서비스 레이어의 몫이다).
 * @param {string} token
 * @returns {object} decoded payload
 */
const verifyGuardianToken = (token) => {
  return assertTokenType(jwt.verify(token, env.jwt.accessSecret), TOKEN_TYPE.GUARDIAN);
};

/**
 * 재인증(Reauth) 토큰 생성
 * 계정 비밀번호를 확인해야 하는 민감한 작업(예: 최초 PIN 설정 — 아직 PIN이 없어
 * guardianToken을 받을 수 없는 상태) 전용의 단기 토큰. POST /api/guardian/reauth에서
 * 비밀번호를 한 번만 검증하고 발급하며, 이후 그 작업 자체(예: PUT /guardian/pin)에서는
 * 비밀번호를 다시 비교하지 않는다 — 그래야 "비밀번호 확인 엔드포인트"가 하나로
 * 좁혀져 그곳에만 잠금/무차별 대입 방지를 집중시킬 수 있다.
 * @param {object} payload - { user_id }
 */
const generateReauthToken = (payload) => {
  return jwt.sign({ ...payload, type: TOKEN_TYPE.REAUTH }, env.jwt.accessSecret, {
    expiresIn: REAUTH_TOKEN_EXPIRES_IN,
  });
};

/**
 * 재인증 토큰 검증 — type:'reauth'가 아니면 거부한다.
 * @param {string} token
 * @returns {object} decoded payload
 */
const verifyReauthToken = (token) => {
  return assertTokenType(jwt.verify(token, env.jwt.accessSecret), TOKEN_TYPE.REAUTH);
};

/**
 * 주어진 토큰 문자열이 지정한 userId에게 발급된 유효한 reauthToken인지 확인한다.
 * (guardianToken과 달리 pin_version처럼 DB와 대조할 상태가 없으므로 순수 JWT
 * 검증만으로 충분하다 — 여기 있어도 안전하다.)
 * @param {string} token
 * @param {number} userId
 * @returns {boolean}
 */
const isValidReauthToken = (token, userId) => {
  if (!token) return false;
  try {
    const decoded = verifyReauthToken(token);
    return decoded.user_id === userId;
  } catch {
    return false;
  }
};

module.exports = {
  TOKEN_TYPE,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateGuardianToken,
  verifyGuardianToken,
  generateReauthToken,
  verifyReauthToken,
  isValidReauthToken,
  GUARDIAN_TOKEN_EXPIRES_IN,
  REAUTH_TOKEN_EXPIRES_IN,
};
