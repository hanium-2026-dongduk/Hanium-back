const rateLimit = require('express-rate-limit');
const response = require('../utils/response');

/**
 * IP 기준 요청 제한 (M5 — 보안 강화).
 *
 * ## 이미 있는 제한과의 관계
 *
 * 서비스 레벨에는 **이메일/계정 기준** 제한이 이미 있다 — 인증번호 재발송 쿨다운(60초),
 * 인증번호 시도 5회, PIN 오답 잠금. 하지만 그건 전부 "특정 계정을 노리는" 공격만 막는다.
 *
 * 여기서 막는 것은 **IP 기준** 공격이다:
 * - 이메일을 바꿔가며 회원가입 인증번호를 대량 발송(메일 발송 비용·스팸 신고)
 * - 계정을 바꿔가며 로그인 시도(크리덴셜 스터핑)
 * - `password/reset-request`로 계정 존재 여부를 훑기
 *
 * 마지막 항목은 `docs/API_SPEC_AUTH.md` 7-1절에 "IP 기준 rate limit이 없어 429 응답
 * 자체가 계정 존재를 약하게 암시한다"고 한계로 적어둔 것이다 — 이 미들웨어가 그걸 좁힌다.
 *
 * ## 프록시 주의
 *
 * Nginx 뒤에서 돌 때 `trust proxy`를 켜지 않으면 **모든 요청이 Nginx 하나의 IP로 보여**
 * 전체 사용자가 함께 막힌다. `TRUST_PROXY=true`로 켠다(src/app.js).
 */

/** 테스트에서는 끈다 — supertest가 같은 IP로 수십 번 호출해 제한에 걸린다. */
const isTest = process.env.NODE_ENV === 'test';

/**
 * 제한기를 만든다.
 *
 * @param {object} params
 * @param {number} params.windowMs - 창 길이(ms)
 * @param {number} params.max - 창당 허용 요청 수
 * @param {string} params.message - 막혔을 때 보여줄 메시지
 * @param {boolean} [params.skipSuccessfulRequests] - 성공한 요청은 세지 않을지
 */
const createLimiter = ({ windowMs, max, message, skipSuccessfulRequests = false }) =>
  rateLimit({
    windowMs,
    max,
    skipSuccessfulRequests,
    // 표준 헤더(RateLimit-*)만 쓰고 구형 X-RateLimit-*는 끈다.
    standardHeaders: true,
    legacyHeaders: false,
    // 응답도 이 API의 공통 봉투 형식을 지켜야 한다. 기본 핸들러는 평문을 반환한다.
    handler: (req, res) => response.error(res, 429, message),
    // 테스트에서는 항상 통과시킨다.
    skip: () => isTest,
  });

/**
 * 로그인 — 계정을 바꿔가며 시도하는 공격을 막는다.
 *
 * `skipSuccessfulRequests`를 켜서 **실패한 시도만 센다.** 정상 사용자가 여러 기기에서
 * 로그인하거나 같은 공용 IP(학교·카페)를 쓰는 경우까지 막지 않기 위해서다.
 */
const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: '로그인 시도가 너무 잦습니다. 잠시 후 다시 시도해주세요.',
});

/**
 * 메일을 실제로 발송하는 엔드포인트 — 발송 비용과 스팸 신고로 이어지므로 더 빡빡하게 잡는다.
 * (회원가입 인증번호, 비밀번호 재설정 인증번호)
 */
const emailLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.',
});

/**
 * 코드·비밀번호를 대조하는 엔드포인트 — 무차별 대입을 막는다.
 * 서비스 레벨의 시도 횟수 제한(5회)은 이메일 단위라, 이메일을 바꿔가며 시도하는 경우를 못 막는다.
 */
const verifyLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.',
});

module.exports = { createLimiter, loginLimiter, emailLimiter, verifyLimiter };
