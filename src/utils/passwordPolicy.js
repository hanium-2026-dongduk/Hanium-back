const { body } = require('express-validator');

/**
 * 비밀번호 정책 (요구사항 정의서 v3.0 SC01_PWD_01: "영어, 숫자, 특수문자 최소 1개
 * 포함, 6자 이상"). 최소 길이는 보안상 요구사항보다 강화해 8자로 유지한다(6자
 * 이상이라는 조건 자체는 만족).
 *
 * 회원가입(auth.controller.js signupValidation)과 비밀번호 재설정
 * (passwordResetValidation)이 각자 다른 정규식을 쓰다가 재설정 쪽에서만 특수문자
 * 조건이 빠져있던 문제가 있었다 — 이 모듈 하나로 합쳐 두 곳이 항상 같은 정책을
 * 쓰도록 강제한다.
 */
const PASSWORD_MIN_LENGTH = 8;

// 영문 1자 이상 + 숫자 1자 이상 + 특수문자(영문/숫자/공백이 아닌 문자) 1자 이상
const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[^a-zA-Z0-9\s]).+$/;

const PASSWORD_POLICY_MESSAGE =
  '비밀번호는 영문, 숫자, 특수문자를 각각 최소 1개 포함해야 합니다.';

/**
 * "새 비밀번호"를 받는 모든 곳(회원가입, 비밀번호 재설정 등)에서 재사용하는 공통
 * express-validator 체인.
 * @param {string} field - body의 필드명 (예: 'password', 'newPassword')
 */
const passwordValidation = (field) => [
  body(field)
    .isLength({ min: PASSWORD_MIN_LENGTH })
    .withMessage(`비밀번호는 최소 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`)
    .matches(PASSWORD_COMPLEXITY_REGEX)
    .withMessage(PASSWORD_POLICY_MESSAGE),
];

module.exports = {
  PASSWORD_MIN_LENGTH,
  PASSWORD_COMPLEXITY_REGEX,
  PASSWORD_POLICY_MESSAGE,
  passwordValidation,
};
