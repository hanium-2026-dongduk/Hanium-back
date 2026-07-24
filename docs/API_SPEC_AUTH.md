# 인증 API 스펙

> Base URL: `{SERVER_URL}/api/auth`
> Content-Type: `application/json`

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

### 참고
- 6자리 숫자 인증번호가 이메일로 발송됨
- 인증번호 유효시간: **5분**
- 재발송 시 기존 인증번호는 무효화됨

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
| password | string | O | 비밀번호 (8자 이상, 영문+숫자 포함) |

### Request 예시
```json
{
  "email": "user@example.com",
  "password": "mypass123"
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

### 비밀번호 규칙
- 최소 8자 이상
- 영문(대/소문자) 1자 이상 포함
- 숫자 1자 이상 포함

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
  "password": "mypass123"
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

accessToken 만료 시 refreshToken으로 새 accessToken 발급

```
POST /api/auth/refresh
```

### Request Body
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| refreshToken | string | O | 로그인 시 받은 refresh token |

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
    "accessToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**401 Unauthorized** - 유효하지 않은 refresh token
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

## 인증이 필요한 API 호출 방법

로그인 후 인증이 필요한 API를 호출할 때는 **Authorization 헤더**에 accessToken을 포함:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### 토큰 만료 시 처리 플로우

```
1. API 호출 → 401 응답 (토큰 만료)
2. POST /api/auth/refresh 호출 → 새 accessToken 발급
3. 새 accessToken으로 원래 API 재호출
4. refreshToken도 만료 시 → 로그인 화면으로 이동
```

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
6. POST /api/auth/refresh        → 새 accessToken 발급

[로그아웃]
7. POST /api/auth/logout         → refreshToken 무효화
```
