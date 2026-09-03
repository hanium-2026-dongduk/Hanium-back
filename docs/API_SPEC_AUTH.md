# 인증 API 스펙

> Base URL: `{SERVER_URL}/api/auth`
> Content-Type: `application/json`
>
> **계약의 원본은 Swagger다** — 서버를 띄우고 `/api-docs`에서 볼 수 있다(스펙 원본은
> `/api-docs.json`). 코드 옆 주석에서 생성되므로 구현과 어긋나지 않는다.
> 이 문서는 **왜 이렇게 설계했는지**(정책 배경, 대안 비교)를 남기는 용도로 유지한다.

---

## 공통 응답 포맷

### 성공
```json
{
  "success": true,
  "message": "성공 메시지",
  "data": { ... }
}
```

### 실패
```json
{
  "success": false,
  "message": "에러 메시지",
  "errors": [ ... ]  // validation 에러 시에만 포함
}
```

---

## 1. 이메일 인증번호 발송

회원가입 전 이메일 소유 확인을 위한 인증번호 발송

```
POST /api/auth/email/send
```

### Request Body
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| email | string | O | 인증할 이메일 주소 |

### Request 예시
```json
{
  "email": "user@example.com"
}
```

### Response

**200 OK**
```json
{
  "success": true,
  "message": "인증번호가 발송되었습니다."
}
```

**409 Conflict** - 이미 가입된 이메일
```json
{
  "success": false,
  "message": "이미 가입된 이메일입니다."
}
```

**429 Too Many Requests** - 재발송 쿨다운 중
```json
{
  "success": false,
  "message": "인증번호는 60초마다 재발송할 수 있습니다. 12초 후 다시 시도해주세요."
}
```

### 참고
- 6자리 숫자 인증번호가 이메일로 발송됨
- 인증번호 유효시간: **5분**
- 재발송 시 기존 인증번호는 무효화됨
- 재발송 쿨다운: 마지막 발송 후 **60초** 이내 재요청 시 429

---

## 2. 이메일 인증번호 검증

```
POST /api/auth/email/verify
```

### Request Body
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| email | string | O | 인증할 이메일 주소 |
| code | string | O | 6자리 인증번호 |

### Request 예시
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

### Response

**200 OK**
```json
{
  "success": true,
  "message": "이메일 인증이 완료되었습니다."
}
```

**400 Bad Request** - 인증번호 불일치
```json
{
  "success": false,
  "message": "인증번호가 일치하지 않습니다."
}
```

**410 Gone** - 인증번호 만료
```json
{
  "success": false,
  "message": "인증번호가 만료되었습니다. 다시 요청해주세요."
}
```

**429 Too Many Requests** - 인증 시도 횟수 초과 (무차별 대입 방지)
```json
{
  "success": false,
  "message": "시도 횟수를 초과했습니다. 인증번호를 다시 요청해주세요."
}
```

### 참고
- 동일 인증번호에 대해 **5회** 오답 시 잠기며, `POST /api/auth/email/send`로 재발송받아야 함

---

## 3. 회원가입

이메일 인증 완료 후 회원가입 가능

```
POST /api/auth/signup
```

### Request Body
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| email | string | O | 이메일 (인증 완료된 이메일) |
| password | string | O | 비밀번호 (8자 이상, 영문+숫자+특수문자 포함) |

### Request 예시
```json
{
  "email": "user@example.com",
  "password": "mypass123!"
}
```

### Response

**201 Created**
```json
{
  "success": true,
  "message": "회원가입이 완료되었습니다.",
  "data": {
    "user": {
      "user_id": 1,
      "email": "user@example.com",
      "role": "parent",
      "status": "active",
      "created_at": "2026-07-23T10:00:00.000Z",
      "updated_at": "2026-07-23T10:00:00.000Z"
    }
  }
}
```

**403 Forbidden** - 이메일 인증 미완료
```json
{
  "success": false,
  "message": "이메일 인증이 완료되지 않았습니다."
}
```

**409 Conflict** - 이메일 중복
```json
{
  "success": false,
  "message": "이미 사용 중인 이메일입니다."
}
```

### 비밀번호 규칙 (SC01_PWD_01)
- 최소 8자 이상 (요구사항 정의서는 6자 이상이나 보안상 강화)
- 영문(대/소문자) 1자 이상 포함
- 숫자 1자 이상 포함
- **특수문자 1자 이상 포함** (영문/숫자/공백이 아닌 문자)

이 규칙은 회원가입(`password`)과 비밀번호 재설정(`newPassword`, 7-2절) 양쪽에
`src/utils/passwordPolicy.js`를 통해 동일하게 적용된다.

### 참고
- 회원가입에 사용된 이메일 인증 기록은 성공 즉시 소멸되어 재사용할 수 없음

---

## 4. 로그인

```
POST /api/auth/login
```

### Request Body
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| email | string | O | 이메일 |
| password | string | O | 비밀번호 |

### Request 예시
```json
{
  "email": "user@example.com",
  "password": "mypass123!"
}
```

### Response

**200 OK**
```json
{
  "success": true,
  "message": "로그인되었습니다.",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "user_id": 1,
      "email": "user@example.com",
      "role": "parent",
      "status": "active",
      "created_at": "2026-07-23T10:00:00.000Z",
      "updated_at": "2026-07-23T10:00:00.000Z"
    }
  }
}
```

**401 Unauthorized** - 이메일/비밀번호 오류
```json
{
  "success": false,
  "message": "이메일 또는 비밀번호가 올바르지 않습니다."
}
```

**403 Forbidden** - 비활성화된 계정
```json
{
  "success": false,
  "message": "비활성화된 계정입니다."
}
```

### 토큰 정보
| 토큰 | 만료시간 | 용도 |
|------|----------|------|
| accessToken | 15분 | API 요청 인증 |
| refreshToken | 7일 | accessToken 갱신 |

---

## 5. 토큰 갱신

accessToken 만료 시 refreshToken으로 새 accessToken 발급.
**refresh token은 회전(rotation)된다** — 요청에 사용한 refreshToken은 즉시 폐기되고, 응답으로
새 refreshToken이 함께 발급된다. 클라이언트는 이후 요청부터 반드시 새로 받은 refreshToken을
사용해야 하며, 기존 refreshToken은 재사용할 수 없다.

```
POST /api/auth/refresh
```

### Request Body
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| refreshToken | string | O | 로그인 시(또는 이전 갱신으로) 받은 refresh token |

### Request 예시
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Response

**200 OK**
```json
{
  "success": true,
  "message": "토큰이 갱신되었습니다.",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**401 Unauthorized** - 유효하지 않거나 이미 사용(회전)되어 폐기된 refresh token
```json
{
  "success": false,
  "message": "유효하지 않은 리프레시 토큰입니다."
}
```

---

## 6. 로그아웃

```
POST /api/auth/logout
```

### Request Body
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| refreshToken | string | O | 삭제할 refresh token |

### Request 예시
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Response

**200 OK**
```json
{
  "success": true,
  "message": "로그아웃되었습니다."
}
```

---

## 7. 비밀번호 재설정 (AU03)

> 요구사항 정의서 v3.0의 AU03(ID/PW 찾기)은 "이메일 입력 → 계정 존재 확인 → 인증번호
> 검증 → 임시 비밀번호/재설정"만 정의하고 있다. 이 시스템은 로그인 ID가 곧 이메일이므로
> (별도의 "아이디"가 없음), 이름 등으로 이메일을 찾아주는 별도의 "ID 찾기" 기능은
> 요구사항에 없다 — 비밀번호 재설정 하나로 통합되어 있다.
> **(변경 이력)** 과거 존재했던 `POST /api/auth/find-email`(자녀 이름만으로 계정을 찾는
> 엔드포인트)은 요구사항 근거가 없고 동명이인 시 다른 사람의 계정을 반환하는 보안 결함이
> 있어 제거되었다. 이 문서에는 처음부터 포함된 적이 없어 프론트엔드와 공유된 계약을
> 깨지 않는다.

이메일 인증번호는 회원가입용(`purpose=signup`)과 비밀번호 재설정용(`purpose=password_reset`)이
DB 레벨에서 분리되어 있어 서로 교차 사용할 수 없다.

### 7-1. 비밀번호 재설정 인증번호 발송

```
POST /api/auth/password/reset-request
```

#### Request Body
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| email | string | O | 비밀번호를 재설정할 계정의 이메일 |

#### Response

**200 OK** — 이메일이 실제로 가입되어 있는지와 무관하게 항상 동일한 메시지를 반환한다
(계정 열거 공격 방지). 가입된 이메일인 경우에만 실제로 메일이 발송된다.
```json
{
  "success": true,
  "message": "해당 이메일이 가입되어 있다면 인증번호가 발송되었습니다."
}
```

**429 Too Many Requests** — 재발송 쿨다운 중 (가입된 이메일에 한해 발생 — 이 응답 자체가
계정 존재를 약하게 암시할 수 있다는 점은 알려진 한계로 문서화한다. 완전히 없애려면
이메일이 아닌 IP 기준 rate limit이 추가로 필요하다)
```json
{
  "success": false,
  "message": "인증번호는 60초마다 재발송할 수 있습니다. 12초 후 다시 시도해주세요."
}
```

### 7-2. 비밀번호 재설정

인증번호 검증과 비밀번호 변경이 한 번의 요청/트랜잭션으로 처리된다.

```
PUT /api/auth/password/reset
```

#### Request Body
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| email | string | O | 이메일 |
| code | string | O | 6자리 인증번호 (reset-request로 받은 것) |
| newPassword | string | O | 새 비밀번호 (8자 이상, 영문+숫자+특수문자 포함 — 7-2절 참고, 회원가입과 동일 정책) |

#### Response

**200 OK**
```json
{ "success": true, "message": "비밀번호가 재설정되었습니다." }
```

**400 Bad Request** — 인증번호 불일치, 또는 애초에 존재하지 않는(가입되지 않은 이메일의)
레코드. 회원가입용(`purpose=signup`) 인증번호를 여기 넣어도 동일하게 400이 난다 — 서로
다른 목적의 코드는 조회 조건 자체가 다르기 때문.
**410 Gone** — 인증번호 만료
**429 Too Many Requests** — 시도 횟수(5회) 초과. 재발송 필요.

#### 참고
- 성공 시 해당 인증번호는 즉시 소비(`is_verified=true`)되어 재사용할 수 없다.
- 성공 시 해당 계정의 **기존 refresh token이 모두 폐기**된다 — 재설정 이전에 로그인된
  다른 기기/세션은 다시 로그인해야 한다.
- 인증번호 검증(코드 불일치 시 attempts 증가) ~ 비밀번호 변경 ~ refresh token 폐기는
  하나의 DB 트랜잭션으로 처리된다.

---

## 인증이 필요한 API 호출 방법

로그인 후 인증이 필요한 API를 호출할 때는 **Authorization 헤더**에 accessToken을 포함:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### 토큰 만료 시 처리 플로우

```
1. API 호출 → 401 응답 (토큰 만료)
2. POST /api/auth/refresh 호출 → 새 accessToken + 새 refreshToken 발급 (기존 refreshToken은 폐기)
3. 새 accessToken으로 원래 API 재호출, 저장된 refreshToken을 새 값으로 교체
4. refreshToken도 만료(또는 이미 사용되어 폐기)된 경우 → 로그인 화면으로 이동
```

### 토큰 종류와 용도 분리 (type 클레임)

accessToken/refreshToken/guardianToken([API_SPEC_GUARDIAN.md](./API_SPEC_GUARDIAN.md) 참고)은
모두 JWT의 payload에 `type`('access'/'refresh'/'guardian') 클레임을 갖고 있으며, 각 검증
함수(`verifyAccessToken`/`verifyRefreshToken`/`verifyGuardianToken`)는 정확히 그 타입이
아니면 서명이 유효해도 무조건 거부한다. 즉:

- accessToken을 `X-Guardian-Token`으로 사용할 수 없다.
- guardianToken을 `Authorization: Bearer`로 사용할 수 없다.
- refreshToken을 위 두 용도 어디에도 사용할 수 없다(반대로 access/guardian 토큰도
  `/api/auth/refresh`의 refreshToken으로 사용할 수 없다).

**정책(기존 토큰 처리)**: `type` 클레임이 없거나 기대값과 다른 토큰은 서명이 멀쩡해도
전부 무효로 취급한다. 이 정책 도입 이전에 발급된 토큰(= `type`이 없는 토큰)은 즉시
무효화되며, 해당 세션은 재로그인해야 한다. `refresh_tokens` 테이블의 옛 레코드를 별도로
정리할 필요는 없다 — 검증 단계에서 항상 거부되므로 재사용될 위험이 없다.

---

## 전체 회원가입/로그인 플로우

```
[회원가입]
1. POST /api/auth/email/send     → 인증번호 이메일 발송
2. POST /api/auth/email/verify   → 인증번호 확인
3. POST /api/auth/signup         → 회원가입 완료

[로그인]
4. POST /api/auth/login          → accessToken + refreshToken 발급

[인증 API 사용]
5. GET /api/xxx (Header: Authorization: Bearer {accessToken})

[토큰 갱신]
6. POST /api/auth/refresh        → 새 accessToken + 새 refreshToken 발급 (기존 refreshToken은 회전되어 폐기됨)

[로그아웃]
7. POST /api/auth/logout         → refreshToken 무효화
```
