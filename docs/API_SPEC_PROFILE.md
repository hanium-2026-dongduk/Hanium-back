# 자녀 프로필 API 스펙 (AU04)

> Base URL: `{SERVER_URL}/api/children`
> Content-Type: `application/json`
> **모든 엔드포인트는 인증 필요** — `Authorization: Bearer {accessToken}` 헤더 필수 (없으면 401)

공통 응답 포맷은 [API_SPEC_AUTH.md](./API_SPEC_AUTH.md#공통-응답-포맷)와 동일하다.

---

## 소유권 정책

모든 `:id`는 **요청자(로그인한 보호자 계정)가 소유한 자녀 프로필**이어야 한다. 다른 유저의
프로필 id를 넣으면(존재는 하지만 내 소유가 아닌 경우) **404**를 반환한다 — "존재는 하는데
권한이 없다(403)"가 아니라 "찾을 수 없다(404)"로 응답해, 다른 사람의 프로필 id가 유효한지
여부 자체를 추측할 수 없게 한다.

`:id`는 항상 양의 정수여야 하며, 아니면 400.

---

## 1. 자녀 프로필 생성

```
POST /api/children
```

### Request Body
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| child_name | string | O | 1~100자 |
| age | int | X | 1~15 |
| learning_level | string | X | `beginner` \| `intermediate` \| `advanced` (기본 `beginner`) |
| vocabulary_level | string | X | 1~30자 |
| profile_image_url | string | X | URL 형식, 500자 이하 |

### Response

**201 Created**
```json
{
  "success": true,
  "message": "자녀 프로필이 생성되었습니다.",
  "data": { "profile": { "child_profile_id": 1, "user_id": 1, "child_name": "첫째", "is_active": true, ... } }
}
```

**400 Bad Request** — validation 실패

### 활성화(is_active) 정책
- **최초 프로필**(해당 유저에게 프로필이 하나도 없던 상태에서 생성)은 자동으로 `is_active: true`로 생성된다.
- **두 번째 이후 프로필**은 `is_active: false`로 생성된다 — 활성 전환은 아래 4번 API를 명시적으로 호출해야 한다.
- 한 유저에게 활성 프로필은 **항상 최대 1개**다. 서비스 레벨(트랜잭션 + 행 잠금)과
  DB 레벨(생성 컬럼 + UNIQUE 인덱스, `db/migrations/0003_...sql`) 이중으로 강제된다.

---

## 2. 자녀 프로필 목록 조회

```
GET /api/children
```

**200 OK** — 로그인한 유저 소유의 프로필만 `created_at` 오름차순으로 반환.

---

## 3. 자녀 프로필 단건 조회

```
GET /api/children/:id
```

**200 OK** / **404 Not Found**(소유하지 않음 또는 존재하지 않음) / **400**(:id 형식 오류)

---

## 4. 자녀 프로필 수정

```
PUT /api/children/:id
```

허용된 필드(`child_name, age, learning_level, vocabulary_level, profile_image_url`)만 반영되며,
그 외 필드는 조용히 무시된다(mass assignment 방지). **반영할 필드가 하나도 없는 요청(빈 body,
또는 허용되지 않은 필드만 있는 body)은 400**으로 거부된다.

**200 OK** / **400**(validation 실패 또는 빈 요청) / **404**

---

## 5. 자녀 프로필 삭제

```
DELETE /api/children/:id
```

**200 OK** / **404**

### 삭제 정책
활성 프로필을 삭제해도 **다른 프로필이 자동으로 활성화되지 않는다**. 삭제 후 활성 프로필이
0개인 상태는 정상 상태이며, AU04_PROFILE_01("프로필 선택 — 없는 경우 생성으로")과 동일하게
클라이언트가 프로필 선택 화면으로 안내하고 명시적으로 4번 API를 호출해야 한다. (자동으로
"다음 프로필"을 추측해서 활성화하지 않는 이유: 어떤 프로필을 이어서 쓸지는 보호자의 의도이지
서버가 임의로 정할 사안이 아니라고 판단했다.)

---

## 6. 활성 프로필 전환

```
PATCH /api/children/:id/activate
```

지정한 프로필만 활성화되고, 같은 유저의 나머지 프로필은 모두 비활성화된다. 유저 행에 대한
`FOR UPDATE` 잠금 + 트랜잭션으로 처리되어, 동시에 서로 다른 프로필에 대한 전환 요청이 와도
최종적으로 활성 프로필은 정확히 1개로 수렴한다.

**200 OK** / **404**(소유하지 않음) / **400**(:id 형식 오류)

---

## 변경 이력 / 알려진 제약

- 기존에는 프로필 생성 시 항상 `is_active: true`였고 활성 전환에 트랜잭션이 없어, 한 유저가
  활성 프로필을 2개 이상 가질 수 있는 결함이 있었다. 위 정책으로 수정되었으며, 기존 DB에
  이미 그런 상태가 있었다면 `db/migrations/0003_...sql`이 적용 시점에 자동으로 정리한다
  (가장 최근 생성된 프로필만 남기고 나머지를 비활성화).
- `vocabulary_level`/`profile_image_url`에 대한 validation이 이번에 추가되었다(과거에는 없었음).
