# 보호자(Guardian) API 스펙

> Base URL: `{SERVER_URL}/api/guardian`
> Content-Type: `application/json`
> **모든 엔드포인트는 인증 필요** — `Authorization: Bearer {accessToken}` 헤더 필수 (없으면 401)

공통 응답 포맷은 [API_SPEC_AUTH.md](./API_SPEC_AUTH.md#공통-응답-포맷)와 동일하다.

---

## 선택한 재인증 설계 (3차 보안 리뷰 반영)

이 서비스는 부모(보호자)와 자녀가 **같은 로그인 세션(accessToken)을 공유**한다. 이 구조에서는
"자녀가 access token만으로 보호자 권한(guardianToken)을 스스로 획득"하는 권한 상승이
가능해서는 안 된다. 검토 후 아래 설계를 선택했다.

| 구성 요소 | 역할 |
|---|---|
| **`POST /api/guardian/reauth`** | 계정 비밀번호를 **한 곳에서만** 확인하고 짧은 수명의 `reauthToken`을 발급 |
| **`reauthToken`** (`type:'reauth'`, 10분) | "방금 비밀번호를 확인했다"는 증명. PIN 설정/변경에서만 사용 |
| **`guardianToken`** (`type:'guardian'`, 10분, `pin_version` 포함) | "방금 PIN을 확인했다"는 증명. PIN 변경 및 보호자 전용 설정 변경에서 사용 |
| **`PUT /api/guardian/pin`** | `reauthToken` 또는 `guardianToken` 중 하나가 유효해야 성공. **최초 설정도 예외 없음** |

**대안으로 검토했으나 채택하지 않은 안**: "최초 설정은 password 필드를 직접 받아 그 자리에서
bcrypt.compare, PIN 변경은 guardianToken만 허용"하는 더 단순한 안도 가능했다(리뷰에서 대안으로
제시됨). 채택하지 않은 이유:
- `PUT /guardian/pin`이 비밀번호를 직접 비교하면, 그 엔드포인트 자체에 실패 횟수 잠금을
  **또** 구현해야 한다 — PIN 잠금(`pin_failed_attempts`)과 별개로 비밀번호 잠금
  (`reauth_failed_attempts`)을 같은 함수 안에 뒤섞어 두 종류의 재인증 로직이 얽히게 된다.
- 재인증이 필요한 보호자 기능이 앞으로 늘어날 경우(예: 계정 삭제, 결제 수단 변경) 매번
  "비밀번호를 직접 받아 비교"하는 코드를 반복하게 된다.
- 반면 `POST /api/guardian/reauth`로 좁혀두면, **비밀번호를 비교하는 코드 경로가 이 서비스
  전체에 단 하나**가 되어 감사(audit)·레이트리밋·정책 변경이 한 곳으로 모인다.

결과적으로 구현 범위가 크게 늘지 않으면서(엔드포인트 1개 + 컬럼 2개 추가) 더 일관된 구조가
되어 이 설계를 채택했다.

---

## 개념 1: guardianToken / reauthToken (재인증 게이트)

`POST /pin/verify` 성공 시 **guardianToken**(10분), `POST /reauth` 성공 시
**reauthToken**(10분)을 각각 발급한다. 각각 헤더로 전달한다:

```
X-Guardian-Token: {verify 응답의 data.guardianToken}
X-Reauth-Token:   {reauth 응답의 data.reauthToken}
```

- 두 토큰 모두 accessToken과 서명 키를 공유하지만(`env.jwt.accessSecret`), payload의
  `type` 클레임(`'guardian'` / `'reauth'`)으로 access token은 물론 서로 간에도 절대
  교차 사용할 수 없다. `verifyGuardianToken`/`verifyReauthToken`은 정확한 `type`이
  아니면 무조건 거부한다.
- 둘 다 **다른 유저에게 발급된 토큰**이면 거부된다(payload의 `user_id`가 요청자와 달라야 함).
- **정책(기존 토큰 처리)**: `type` 클레임이 없는(이 정책 도입 이전에 발급된) 토큰은 서명이
  유효해도 무조건 거부된다 — 배포 시점에 로그인해 있던 모든 세션이 즉시 무효화되며
  재로그인이 필요하다. `refresh_tokens` 테이블의 옛 레코드를 별도로 지울 필요는 없다.

## 개념 2: pin_version (guardianToken의 즉시 무효화)

stateless JWT인 guardianToken은 발급 후 서버가 강제로 회수할 방법이 없어, PIN을 변경해도
기존에 발급된 guardianToken이 최대 10분간 계속 유효한 문제가 있었다. 이를 막기 위해:

- `guardian_settings.pin_version`(정수)을 두고, PIN이 설정/변경될 때마다 1씩 증가시킨다.
- guardianToken 발급 시(`POST /pin/verify` 성공 시) 그 시점의 `pin_version`을 payload에
  함께 싣는다.
- guardianToken을 사용하는 모든 곳(`PUT /guardian/settings`의 게이트, `PUT /guardian/pin`의
  재인증 검사)은 `guardian.service.js`의 **`isGuardianTokenValid(token, userId)`** 하나만
  호출한다 — 서명/타입/`user_id` 일치 확인에 더해 **DB의 현재 `pin_version`과 토큰의
  `pin_version`이 같은지**까지 검사한다. 이 함수를 미들웨어와 서비스가 각자 구현하면
  한쪽만 고치는 실수로 우회 경로가 다시 생길 수 있어, 검증 로직을 한 곳으로 모았다.
- 따라서 **PIN이 바뀌면 그 이전에 발급된 모든 guardianToken은 즉시(다음 요청부터) 무효**가
  된다. reauthToken은 PIN 상태와 무관하므로 이 버전 검사를 받지 않는다.

---

## 1. 비밀번호 재인증

```
POST /api/guardian/reauth
```

계정 비밀번호를 확인해야 하는 민감한 작업(현재는 PIN 설정/변경) 전에 호출한다.

### Request Body
| 필드 | 타입 | 필수 |
|------|------|------|
| password | string | O |

### 잠금 정책 (DB 기반 — 메모리 Map 아님)
`guardian_settings.reauth_failed_attempts` / `reauth_locked_until`에 저장한다. 연속
**5회** 오답 시 **10분간** 잠긴다(PIN 잠금과 별개의 카운터). 프로세스 재시작이나
다중 인스턴스 배포에서도 DB에 상태가 있으므로 잠금이 유지된다. 잠긴 동안은 올바른
비밀번호를 보내도 429가 반환된다(정답 여부를 확인해주지 않음 — 무차별 대입 방지).

### Response

**200 OK**
```json
{
  "success": true,
  "message": "비밀번호가 확인되었습니다.",
  "data": { "reauthToken": "eyJhbGciOi...", "expiresIn": "10m" }
}
```

**401 Unauthorized** — 비밀번호 불일치 (잠기기 전)
**429 Too Many Requests** — 잠김
**400 Bad Request** — validation

---

## 2. PIN 설정/변경

```
PUT /api/guardian/pin
```

### Request Body
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| pin | string | O | 4~6자리 숫자, 새로 설정할 PIN |

재인증은 body가 아니라 헤더로 보낸다: `X-Guardian-Token` 또는 `X-Reauth-Token` 중
하나가 유효해야 한다.

### 정책
- **최초 설정과 변경을 구분하지 않는다** — "최초 설정인지"는 클라이언트가 지정할 수 없고
  서버가 DB의 `parent_pin_hash` 존재 여부만으로 판단하며, **어느 쪽이든 재인증은 항상
  필수**다. (과거에는 최초 설정에 재인증을 요구하지 않아, access token만 가진 자녀가
  원하는 PIN을 최초 설정 → 검증 → guardianToken 획득까지 완주할 수 있는 권한 상승
  경로가 있었다 — 지금은 최초 설정 단계 자체가 막힌다.)
- 재인증은 `X-Guardian-Token`(PIN을 이미 아는 상태) 또는 `X-Reauth-Token`(비밀번호를
  아는 상태) 중 **하나 이상**이 유효해야 한다. 둘 다 없거나 둘 다 무효면 **401**.
- **`currentPin`(기존 PIN 값을 직접 받는 방식)과 `password`(계정 비밀번호를 이 요청에
  직접 담는 방식) 모두 지원하지 않는다.** 이 두 필드를 body에 실어 보내도 서버는
  아예 읽지 않는다 — 각각 다음 문제가 있었다:
  - `currentPin`: `bcrypt.compare`만으로 비교하고 `POST /pin/verify`의 5회 잠금을
    전혀 거치지 않는 별도의 PIN 대입 경로였다.
  - `password`(이 엔드포인트에 직접): 유효한 access token만 있으면 실패 횟수 제한 없이
    비밀번호를 반복 대입하는 oracle로 쓸 수 있었다. 비밀번호 확인은
    `POST /guardian/reauth` 하나로 좁혀 그곳에만 DB 기반 잠금을 집중시켰다.
- 성공 시 `pin_version`이 1 증가한다 — 그 이전에 발급된 guardianToken은 즉시 무효화된다.
- 성공 시 PIN 오답 잠금 카운터/잠금 시각(`pin_failed_attempts`/`pin_locked_until`)도
  초기화된다.
- 저장은 bcrypt 해시로만 이루어지며, 어떤 API 응답에도 해시가 포함되지 않는다.

**200 OK** / **401**(재인증 실패) / **400**(validation)

---

## 3. PIN 검증

```
POST /api/guardian/pin/verify
```

### Request Body
| 필드 | 타입 | 필수 |
|------|------|------|
| pin | string | O |

### 잠금 정책
연속 **5회** 오답 시 **10분간** 잠긴다. 잠긴 동안은 정답을 입력해도 429가 반환된다.

### Response

**200 OK**
```json
{
  "success": true,
  "message": "PIN이 확인되었습니다.",
  "data": { "verified": true, "guardianToken": "eyJhbGciOi...", "expiresIn": "10m" }
}
```

**400 Bad Request** — 아직 PIN이 설정되지 않음
**401 Unauthorized** — PIN 불일치 (잠기기 전)
**429 Too Many Requests** — 잠김

---

## 4. 보호자 설정 조회

```
GET /api/guardian/settings
```

**200 OK**
```json
{
  "success": true,
  "data": {
    "setting": {
      "setting_id": 1,
      "user_id": 1,
      "daily_usage_limit_minutes": 60,
      "push_enabled": true,
      "has_pin": true
    }
  }
}
```
`parent_pin_hash`, PIN/재인증 잠금 카운터·시각, `pin_version`은 응답에 절대 포함되지
않는다. PIN 설정 여부는 `has_pin`(boolean)으로만 알 수 있다.

---

## 5. 보호자 설정 변경 (보호자 전용 — guardianToken 필요)

```
PUT /api/guardian/settings
```

**`X-Guardian-Token` 헤더 필수** — `isGuardianTokenValid`가 false를 반환하면(없음/무효/
타인 토큰/`pin_version` 불일치 포함) 403.

### Request Body
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| daily_usage_limit_minutes | int | X | 1~1440, 일일 사용 제한(분). 자녀별이 아니라 이 보호자 계정의 모든 자녀에게 동일하게 적용된다(자세한 내용은 [API_SPEC_USAGE.md](./API_SPEC_USAGE.md) 참고) |
| push_enabled | boolean | X | 푸시 알림 여부 |

**200 OK** / **403**(guardianToken 없음/무효) / **400**(validation)

---

## 변경 이력

- PIN 연속 오답 잠금(5회/10분), PIN 변경 시 재인증, `PUT /settings`의 guardianToken
  게이트, JWT `type` 클레임 분리 — 1~2차 리뷰에서 반영(세부 내용은 git 이력 참고).
- **(3차 리뷰 반영) 최초 PIN 설정에도 재인증을 요구한다.** 과거에는 최초 설정이
  재인증 없이 가능해, 자녀와 보호자가 accessToken을 공유하는 구조상 자녀가 스스로
  보호자 권한을 획득할 수 있는 권한 상승 경로였다.
- **(3차 리뷰 반영) `PUT /guardian/pin`이 계정 비밀번호를 더 이상 직접 비교하지
  않는다.** 신규 `POST /api/guardian/reauth` 엔드포인트로 분리되었고, DB 기반
  실패 횟수/잠금(`reauth_failed_attempts`/`reauth_locked_until`)이 적용된다. 기존에
  `password` 필드를 body에 보내던 클라이언트는 `POST /reauth` → `reauthToken` 획득 →
  `X-Reauth-Token` 헤더로 전달하는 흐름으로 바뀌어야 한다(breaking change, 단 이전에도
  공식 문서화된 계약은 아니었음).
- **(3차 리뷰 반영) `pin_version`이 도입되어, PIN 변경 이전에 발급된 guardianToken은
  변경 직후부터 즉시 거부된다.** 이 컬럼이 없던 시점(이번 마이그레이션 이전)에 발급된
  guardianToken은 `pin_version` 클레임 자체가 없어(`undefined`) DB 값(0 이상)과 항상
  달라 자동으로 무효화된다.
