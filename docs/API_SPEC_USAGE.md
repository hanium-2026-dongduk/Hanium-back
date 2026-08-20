# 사용 시간(Usage Time) API 스펙

> Base URL: `{SERVER_URL}/api/usage`
> Content-Type: `application/json`
> **모든 엔드포인트는 인증 필요** — `Authorization: Bearer {accessToken}` 헤더 필수 (없으면 401)

전체 설계 배경(테이블 구조, 정책 근거, 트레이드오프)은 [USAGE_TRACKING_DESIGN.md](./USAGE_TRACKING_DESIGN.md) 참고.
여기서는 API 계약만 다룬다.

---

## 구현 상태 (중요 — 완료로 오해하지 말 것)

| 항목 | 상태 |
|---|---|
| heartbeat 기반 서버 측 일일 사용 시간 집계 (`usage_daily_summaries`, `POST /api/usage/heartbeat`) | ✅ 구현 완료, 실DB 스모크 테스트로 검증됨 |
| 조회 API (`GET /api/usage/:childId/today`) | ✅ 구현 완료 |
| 콘텐츠 라우트용 재사용 가능한 제한 미들웨어 (`checkUsageLimit`) | ✅ 구현 완료, 단위 테스트로 검증됨 |
| **실제 동화/퀴즈 등 콘텐츠 라우트에 제한 적용** | ⏳ **대기 중 — 개발자 B의 콘텐츠 라우트가 이 저장소에 아직 없음.** 아래 "적용 대상" 참고 |

**즉 "사용 시간 제한"은 아직 아무 콘텐츠도 실제로 차단하지 않는다.** 지금 이 저장소가 막을 수
있는 것은 오직 heartbeat 호출 자체(한도 도달 시 heartbeat가 403)뿐이며, 콘텐츠 라우트가
붙기 전까지는 "시간이 다 찬 아이가 동화를 계속 생성/열람하는 것"을 서버가 막지 못한다.

**중요한 한계**: 이 방식은 클라이언트가 heartbeat를 실제로 보내는 것을 전제로 한다.
**heartbeat를 아예 보내지 않는 클라이언트(구버전 앱, 프론트 통합 누락, 악의적 클라이언트가
heartbeat 호출 자체를 생략하는 경우)의 화면 체류 시간은 서버가 전혀 알 수 없다.** 이는
heartbeat 방식 자체의 근본적인 한계이며(세션 시작/종료를 서버가 강제로 감지할 방법이 없음),
프론트엔드가 실제 콘텐츠 화면에서 heartbeat를 성실히 호출한다는 전제 위에서만 유효하다.

---

## 핵심 원칙: 클라이언트가 보내는 시간 값은 절대 신뢰하지 않는다

과거 구현은 클라이언트가 `X-Usage-Minutes` 헤더로 "지금까지 사용한 시간"을 직접 보고하면
그 값을 그대로 믿고 제한을 체크했다 — 헤더를 생략하거나 조작하면 제한을 그냥 우회할 수
있었다. 지금은 **어떤 API도 클라이언트가 보낸 시간/분 값을 읽지 않는다.** 서버는 오직
"지금 요청이 도착했다"는 사실과, 서버가 이전에 기록해둔 마지막 heartbeat 시각의 차이만으로
경과 시간을 계산한다.

---

## 1. 사용 시간 Heartbeat 기록

```
POST /api/usage/heartbeat
```

**계약**: 자녀가 실제로 학습 콘텐츠 화면(동화 생성, 학습 등)에 머무는 동안, 클라이언트는
이 API를 **30~60초 간격**으로 호출해야 한다. 화면을 벗어나거나 앱이 백그라운드로 가면
호출을 멈추면 된다.

### Request Body
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| child_profile_id | int | O | 양의 정수. 요청자 소유가 아니면 404 |

### 서버 계산 방식
1. 서버 시각(`now`)과 해당 자녀의 오늘(Asia/Seoul 캘린더 기준) 요약 행의 `last_heartbeat_at`을 비교.
2. `delta = min(now - last_heartbeat_at, 90초)` — 90초 캡을 두는 이유: 정상적인 호출 간격
   (30~60초)보다 넉넉하게 잡아, 앱이 오래 백그라운드에 있다가 늦게 heartbeat를 보내거나
   의도적으로 드문드문 보내는 경우에도 실제 경과 시간보다 부풀려 적립되지 않게 한다.
3. **그날의 첫 heartbeat**는 비교 기준이 없으므로 0초를 적립한다(과다 적립보다 과소 적립이 안전).
4. `accumulated_seconds += round(delta)`, `last_heartbeat_at = now`를 트랜잭션 + 행 잠금으로 저장.
5. 그 유저(보호자 계정)의 `daily_usage_limit_minutes`와 비교해 초과 여부를 판단.

### Response

**200 OK**
```json
{
  "success": true,
  "message": "사용 시간이 기록되었습니다.",
  "data": { "accumulatedSeconds": 130, "limitSeconds": 3600, "remainingSeconds": 3470 }
}
```
`limitSeconds`/`remainingSeconds`는 제한이 설정되어 있지 않으면 `null`.

**403 Forbidden** — 이 heartbeat를 기록한 결과 오늘 누적 시간이 한도에 도달/초과함.
**(경과 시간은 사실대로 기록한 뒤 차단한다** — 즉 한도를 막 넘긴 그 순간의 실제 사용 시간은
누적값에 반영되고, 이후 호출부터 차단된다.)
**404 Not Found** — 소유하지 않은/존재하지 않는 child_profile_id.
**400 Bad Request** — child_profile_id 형식 오류/누락.

---

## 2. 오늘 누적 사용 시간 조회

```
GET /api/usage/:childId/today
```

읽기 전용, 소유자만 가능.

**200 OK**
```json
{
  "success": true,
  "data": {
    "date": "2026-07-31",
    "accumulatedSeconds": 3650,
    "limitSeconds": 3600,
    "remainingSeconds": 0,
    "limitReached": true
  }
}
```

---

## 날짜/타임존 정책

하루의 경계는 **Asia/Seoul(KST) 자정**이다. 서버 프로세스가 어느 타임존에서 구동되든
`Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })`로 계산한 캘린더 날짜를
`usage_daily_summaries.usage_date`로 사용한다. 자정을 넘기면 새 날짜의 요약 행이
자동으로 생성되며(그날의 첫 heartbeat), 이전 날짜의 기록은 그대로 남는다(삭제하지 않음).

---

## 어떤 API에 제한을 적용하는가

현재 이 저장소에는 개발자 B가 담당하는 실제 "콘텐츠 사용" 라우트(동화 생성, 퀴즈 등)가
아직 없다(Week 2~4 범위, 이 저장소는 개발자 A 범위만 포함). 그래서:

- **`POST /api/usage/heartbeat` 자신이 위 로직(기록 후 초과 시 403)을 내장 수행한다** —
  heartbeat는 "기록"과 "차단 판단"이 같은 트랜잭션 안에서 함께 일어나야 하는 특수한
  라우트이기 때문이다. **이것만으로는 콘텐츠 사용을 막지 못한다** — 아래 미들웨어를
  실제 콘텐츠 라우트에 붙여야 비로소 "제한"으로 기능한다.
- `src/middlewares/usageLimit.js`의 `checkUsageLimit({ getChildProfileId })`는 **재사용
  가능한 미들웨어 팩토리**로 구현·단위테스트까지 완료해 별도로 노출해뒀다. 아직 시작하지
  않은 동작(예: 동화 생성 시작)을 애초에 막는 용도다.

### 개발자 B 연동 대기 — 적용 대상 API와 예시 코드

`docs/DEVELOPMENT_PLAN.md`에 정의된 개발자 B API 중, "콘텐츠를 새로 생성하거나 소비를
시작하는" 아래 엔드포인트들에 적용하는 것을 권장한다(최종 판단은 개발자 B 몫):

| 우선순위 | 엔드포인트 | 이유 |
|---|---|---|
| 권장 | `POST /api/stories/generate` | 동화 생성 시작 — 가장 명확한 "콘텐츠 사용" 시작점 |
| 권장 | `POST /api/quizzes/generate/:storyId` | 퀴즈 생성 시작 |
| 검토 | `POST /api/quizzes/:quizSetId/submit` | 퀴즈 풀이도 학습 활동으로 볼지는 제품 판단 필요 |
| 비권장 | `GET /api/stories/:childId`, `GET /api/stories/explore` 등 단순 조회/목록 API | 콘텐츠 "사용"이 아니라 목록 조회이므로 제한 대상이 아님 |

적용 코드 예시(개발자 B가 실제 스토리 라우트 파일에 추가):

```js
// src/routes/story.route.js (개발자 B 파일 — 이 저장소에는 아직 존재하지 않음)
const { authenticate } = require('../middlewares/auth');
const { checkUsageLimit } = require('../middlewares/usageLimit');

router.post(
  '/stories/generate',
  authenticate,
  checkUsageLimit({ getChildProfileId: (req) => req.body.child_profile_id }),
  storyController.generate
);
```

`getChildProfileId`는 해당 라우트가 자녀 id를 어디서 받는지(body/params)에 맞춰 조정하면
된다. 이 미들웨어는 DB 조회 중 오류가 나면 **fail-closed**(503)로 응답한다 — 과거 구현은
DB 에러를 조용히 삼키고 통과시켰는데(fail-open), 아동 보호(사용 시간 제한) 기능이 인프라
장애 상황에서 조용히 무력화되는 것은 이 기능의 목적에 반한다고 판단해 바꿨다.

- **`/api/auth/*`, `/api/guardian/*`에는 적용하지 않는다.** 로그인/PIN 확인/설정 변경은
  계정 관리 행위이지 "콘텐츠 사용"이 아니며, 오늘 사용 시간이 이미 다 찬 자녀라도 보호자가
  PIN을 확인해 설정을 바꾸거나(예: 오늘 하루 제한 늘리기) 로그아웃/로그인할 수 있어야
  하므로 여기 제한을 걸면 오히려 보호자의 통제 수단을 막는 셈이 된다.

---

## 동시성

heartbeat는 트랜잭션 + 행 잠금(`SELECT ... FOR UPDATE`)으로 누적값을 갱신해 동시 요청으로
인한 값 유실을 막는다. 같은 자녀의 "그날 첫 heartbeat"가 여러 요청에서 동시에 도착하는
경우(요약 행이 아직 없어 INSERT 경쟁이 발생) InnoDB가 데드락으로 감지해 한쪽을 롤백시킬
수 있는데, 이는 정상적인 동시성 제어이므로 서비스 레벨에서 최대 3회까지 자동 재시도한다.
