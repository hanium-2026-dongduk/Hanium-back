# 출석 · 미션 · 리워드 API 스펙

> Base URL: `{SERVER_URL}/api`
> Content-Type: `application/json`
> **모든 엔드포인트는 인증 필요** — `Authorization: Bearer {accessToken}` 헤더 필수 (없으면 401)

전체 설계 배경(테이블 구조, 동시성 정책, 대안 비교)은 [WEEK3_A_DESIGN.md](./WEEK3_A_DESIGN.md) 참고.
여기서는 API 계약과 프론트/개발자 B가 알아야 할 정책만 다룬다.

---

## 구현 상태

| 항목 | 상태 |
|---|---|
| 스키마 4종 (`attendance_logs`, `daily_missions`, `reward_wallets`, `reward_transactions`) | ✅ 마이그레이션 `0008`~`0011` |
| `rewardService` (포인트 지급/조회, 레벨, 이력) | ✅ 구현 완료 |
| `missionService` (지연 생성, 진행도, 보상) | ✅ 구현 완료 |
| `attendanceService` (출석, streak, 마일스톤 보너스) | ✅ 구현 완료 |
| API 7종 (아래 전부) | ✅ 구현 완료 |
| **학습 이벤트 → 미션 진행도 연동** | ⏳ **대기 중 — 개발자 B의 동화/퀴즈 라우트가 아직 없음.** 아래 "개발자 B 연동 계약" 참고 |
| 정책 수치(레벨 임계값, 미션 보상, streak 보너스) | ⚠️ **예시값 — 기획 확정 필요** |

**즉 현재 실제로 포인트가 쌓이는 경로는 출석뿐이다.** `story_read`/`word_clicked`/`quiz_answered`
미션은 행이 생성되고 조회도 되지만, 진행도를 올려주는 호출자가 아직 없어 영원히 `pending`에
머문다. 개발자 B가 `missionService.recordProgress()`를 붙이면 그때부터 동작한다.

---

## 핵심 원칙: 포인트 지급은 언제나 멱등이다

모든 지급은 `reward_transactions`에 원장을 남기며, `UNIQUE(child_profile_id, idempotency_key)`가
같은 사유의 두 번째 지급을 DB 레벨에서 차단한다. 따라서 **클라이언트가 네트워크 재시도로
같은 요청을 여러 번 보내도 포인트가 중복 지급되지 않는다.**

| 지급 사유 | 멱등키 | 지급 시점 |
|---|---|---|
| `mission_reward` | `mission:{daily_mission_id}` | 미션 진행도가 목표치에 도달한 순간 |
| `streak_bonus` | `streak:{childProfileId}:{attendanceDate}` | 연속 출석일이 마일스톤에 정확히 도달한 날 |

> **출석 포인트는 별도로 지급되지 않는다.** 출석 보상은 `attendance` 데일리 미션의
> `mission_reward`로 일원화되어 있다 — 출석 자체에 또 포인트를 붙이면 같은 행동에 보상이
> 이중으로 나가기 때문이다.

---

## 1. 출석 체크

```
POST /api/attendance/check
```

**멱등하다.** 같은 날 몇 번을 호출해도 출석은 한 번만 기록되고 포인트도 한 번만 지급된다.
앱 재실행·네트워크 재시도로 중복 호출해도 안전하므로, 클라이언트가 "오늘 이미 호출했는지"를
따로 관리할 필요가 없다.

### Request Body
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| child_profile_id | int | O | 양의 정수. 요청자 소유가 아니면 404 |

### Response

**201 Created** — 그날의 첫 출석
```json
{
  "success": true,
  "message": "출석이 기록되었습니다.",
  "data": {
    "attendanceDate": "2026-08-12",
    "alreadyChecked": false,
    "streakDays": 3,
    "pointsEarned": 30
  }
}
```

**200 OK** — 같은 날 재요청 (오류가 아니다)
```json
{
  "success": true,
  "message": "오늘은 이미 출석했습니다.",
  "data": {
    "attendanceDate": "2026-08-12",
    "alreadyChecked": true,
    "streakDays": 3,
    "pointsEarned": 0
  }
}
```

`pointsEarned`는 **이번 호출로 실제 획득한 포인트 합계**다 — 출석 미션 보상 + (마일스톤인 경우)
streak 보너스. 위 예시의 30점은 미션 10점 + 3일 연속 보너스 20점이다.

**400** child_profile_id 누락/형식 오류 · **401** 인증 실패 · **404** 미소유/존재하지 않는 프로필

### 프론트엔드 참고
- `201`과 `200`을 굳이 구분해 처리할 필요는 없다. `alreadyChecked`로 UI를 정하면 된다.
- `pointsEarned > 0`이면 획득 연출을 띄우고, `0`이면 조용히 넘어가면 된다.

---

## 2. 월간 출석 현황

```
GET /api/attendance/:childId?month=YYYY-MM
```

### Query Parameters
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| month | string | X | `YYYY-MM`. 생략하면 오늘(Asia/Seoul) 기준 당월 |

### Response

**200 OK**
```json
{
  "success": true,
  "message": "월간 출석 현황을 조회했습니다.",
  "data": {
    "childProfileId": 1,
    "month": "2026-08",
    "attendedDates": ["2026-08-01", "2026-08-03", "2026-08-06"],
    "attendedCount": 3,
    "denominator": 12,
    "attendanceRate": 25.0,
    "currentStreak": 4
  }
}
```

### ⚠️ 출석률 분모 정책 (기획 확인 필요)

`attendanceRate = attendedCount / denominator × 100` (소수 1자리 반올림)이며, `denominator`는
조회 대상 월에 따라 달라진다:

| 조회 대상 | denominator |
|---|---|
| 지난 달 | 해당 월의 전체 일수 (예: 6월 → 30) |
| **진행 중인 이번 달** | **오늘까지 경과한 일수** (예: 8월 12일에 조회 → 12) |
| 미래 달 | 해당 월의 전체 일수 (출석은 0이므로 0%) |

이번 달에 전체 일수를 쓰면 월초마다 출석률이 부당하게 낮게 보이기 때문이다(8월 1일에
개근해도 1/31 = 3.2%). **이 방식이 기획 의도와 맞는지 확인이 필요하다.**

**400** childId/month 형식 오류 · **401** · **404**

---

## 3. 미션 카탈로그

```
GET /api/missions
```

자녀에 종속되지 않는 정적 목록이다(인증만 필요, 소유권 검증 없음). DB를 타지 않으므로
자유롭게 캐시해도 된다.

### Response

**200 OK**
```json
{
  "success": true,
  "message": "미션 목록을 조회했습니다.",
  "data": {
    "missions": [
      { "missionType": "attendance",    "targetCount": 1, "rewardPoints": 10 },
      { "missionType": "story_read",    "targetCount": 1, "rewardPoints": 20 },
      { "missionType": "word_clicked",  "targetCount": 5, "rewardPoints": 15 },
      { "missionType": "quiz_answered", "targetCount": 1, "rewardPoints": 20 }
    ]
  }
}
```

> ⚠️ `targetCount`/`rewardPoints`는 예시값이며 기획 확정이 필요하다.
> 카탈로그는 `src/config/missionCatalog.js`의 코드 상수라 변경에 마이그레이션이 필요 없다.
> 단, 변경은 **이미 생성된 그날의 행에는 소급되지 않는다** — 생성 시점의 값이 행에 복사되기 때문.

---

## 4. 오늘의 미션 진행 상황

```
GET /api/missions/progress/:childId
```

**부작용이 있는 GET이다.** 오늘자 미션 행이 없으면 이 호출이 카탈로그 4종을 생성한다.
이 프로젝트에는 스케줄러가 없어 자정 배치로 미리 만들어둘 수 없기 때문이며, Week 2의
"그날 첫 heartbeat가 요약 행을 생성"과 같은 선례를 따른다.

### Response

**200 OK**
```json
{
  "success": true,
  "message": "오늘의 미션 진행 상황을 조회했습니다.",
  "data": {
    "missionDate": "2026-08-12",
    "missions": [
      { "missionType": "attendance",    "targetCount": 1, "progressCount": 1, "rewardPoints": 10, "status": "rewarded" },
      { "missionType": "story_read",    "targetCount": 1, "progressCount": 0, "rewardPoints": 20, "status": "pending" },
      { "missionType": "word_clicked",  "targetCount": 5, "progressCount": 2, "rewardPoints": 15, "status": "pending" },
      { "missionType": "quiz_answered", "targetCount": 1, "progressCount": 0, "rewardPoints": 20, "status": "pending" }
    ]
  }
}
```

`missions` 배열은 항상 카탈로그 순서로 반환된다.

### status 값
| 값 | 의미 |
|---|---|
| `pending` | 진행 중 (`progressCount < targetCount`) |
| `completed` | 목표 달성했으나 포인트 지급이 아직 완료되지 않음 |
| `rewarded` | 포인트 지급까지 완료 — 그날의 종착 상태 |

`completed`는 지급 직전의 짧은 중간 상태이거나, 지급 트랜잭션이 실패한 뒤의 재개 대기
상태다. 다음 `recordProgress` 호출이 진행도를 올리지 않고 지급만 이어서 시도한다.
**프론트에서는 `completed`와 `rewarded`를 모두 "완료"로 묶어 표시하면 된다.**

`progressCount`는 `targetCount`를 넘지 않는다(초과분은 절삭).

**400** childId 형식 오류 · **401** · **404**

---

## 5. 리워드 조회

```
GET /api/rewards/:childId
```

### Response

**200 OK**
```json
{
  "success": true,
  "message": "리워드 정보를 조회했습니다.",
  "data": {
    "childProfileId": 1,
    "points": 340,
    "level": 3,
    "streakDays": 4,
    "levelProgress": {
      "currentLevelFloor": 300,
      "nextLevelAt": 600,
      "pointsToNextLevel": 260
    }
  }
}
```

최고 레벨(10)에 도달하면 `nextLevelAt`과 `pointsToNextLevel`은 `null`이다.

### 레벨 정책

| 레벨 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| 필요 누적 포인트 | 0 | 100 | 300 | 600 | 1000 | 1500 | 2200 | 3000 | 4000 | 5200 |

> ⚠️ 예시값이며 기획 확정이 필요하다(`src/config/levelThresholds.js`).

레벨은 별도 카운터가 아니라 **현재 포인트로부터 매번 재계산되는 순수 함수**다. 따라서
포인트와 레벨이 어긋난 상태가 존재할 수 없고, 임계값을 조정하면 기존 사용자의 레벨도
자동으로 재산정된다.

**400** · **401** · **404**

---

## 6. 보유 포인트 (메인 화면용)

```
GET /api/rewards/:childId/summary
```

메인 화면(MN02)에서 매번 호출하는 경량 응답이다. 프론트는 이 값을 화면에 따라
**"토큰"**(메인 화면) 또는 **"포인트"**(마이페이지)로 라벨링한다 — 둘은 같은 값이다.

### Response

**200 OK**
```json
{
  "success": true,
  "message": "보유 포인트를 조회했습니다.",
  "data": { "points": 340 }
}
```

**400** · **401** · **404**

---

## 7. 포인트 획득 이력

```
GET /api/rewards/:childId/history?page=1&limit=20&reason=&from=&to=
```

### Query Parameters
| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| page | int | X | 1 | 1 이상 |
| limit | int | X | 20 | 1~100 |
| reason | string | X | 전체 | 아래 지급 사유 중 하나 |
| from | string | X | 제한 없음 | `YYYY-MM-DD` (Asia/Seoul 캘린더 날짜, 해당일 포함) |
| to | string | X | 제한 없음 | `YYYY-MM-DD` (해당일 **전체** 포함) |

**지급 사유(`reason`)**: `attendance`, `streak_bonus`, `mission_reward`, `story_read`,
`word_clicked`, `quiz_answered`

> 현재 실제로 기록되는 값은 `mission_reward`와 `streak_bonus`뿐이다. 나머지는 개발자 B가
> 미션과 별개로 직접 지급할 여지를 남겨둔 계약상의 값이다.

### Response

**200 OK**
```json
{
  "success": true,
  "message": "포인트 획득 이력을 조회했습니다.",
  "data": {
    "items": [
      {
        "points": 20,
        "reason": "mission_reward",
        "balanceAfter": 340,
        "createdAt": "2026-08-12T01:23:45.000Z",
        "metadata": { "missionType": "story_read", "missionDate": "2026-08-12" }
      }
    ],
    "pagination": { "page": 1, "limit": 20, "totalCount": 37, "totalPages": 2 }
  }
}
```

`balanceAfter`는 그 지급 직후의 잔액이라 이력만으로 잔액 변화를 재구성할 수 있다.
정렬은 최신순이며, 같은 초에 여러 건이 기록되어도 페이지 경계에서 항목이 중복/누락되지
않도록 PK를 보조 정렬키로 사용한다.

**400** 형식 오류·범위 초과·알 수 없는 reason·`from > to` · **401** · **404**

---

## 날짜/타임존 정책

출석일·미션일은 전부 **Asia/Seoul 캘린더 기준**이다. 서버 프로세스가 어느 타임존에서
구동되든 동일하게 동작한다(`src/utils/dateUtils.js`에 계산이 모여 있다).

- 자정(KST)이 지나면 다음 접근 시 새 날짜의 미션 행이 새로 생성된다.
- 어제자 행은 마감 처리 없이 그대로 이력으로 남는다.
- `createdAt` 같은 시각 값은 UTC로 저장/응답되므로, 프론트에서 KST로 변환해 표시해야 한다.

### 연속 출석일(streak) 계산

```
어제 = 오늘 - 1일 (KST)
if  마지막 활동일 == 어제  →  streakDays += 1
else                      →  streakDays = 1   (연속이 끊겼거나 첫 출석)
```

마일스톤 보너스는 **정확히 일치하는 날 1회만** 지급된다 — 3일차에 20점을 받았다면 4·5일차에는
받지 않는다. 연속이 끊겨 1로 리셋된 뒤 다시 3일을 채우면 그때는 새로운 지급 대상이다.

| 연속일 | 3일 | 7일 | 14일 | 30일 |
|---|---|---|---|---|
| 보너스 | 20 | 50 | 100 | 300 |

> ⚠️ 예시값이며 기획 확정이 필요하다(`src/config/streakBonuses.js`).

---

## 개발자 B 연동 계약

학습 이벤트가 발생하면 아래를 호출하면 된다. HTTP API가 아니라 **서비스 함수 직접 호출**이다.

```js
const missionService = require('../services/mission.service');

// 동화 1편 완독
await missionService.recordProgress({
  childProfileId,
  eventType: 'story_read',
  transaction: t,        // ← 자신의 트랜잭션이 있다면 반드시 넘길 것
});

// 단어 클릭 (목표 5회)
await missionService.recordProgress({ childProfileId, eventType: 'word_clicked', transaction: t });

// 퀴즈 정답
await missionService.recordProgress({ childProfileId, eventType: 'quiz_answered', transaction: t });
```

미션과 무관한 별도 지급이 필요하면 `rewardService.addPoints()`를 직접 쓴다:

```js
await rewardService.addPoints({
  childProfileId,
  points: 5,
  reason: 'quiz_answered',                    // REWARD_REASONS 중 하나
  idempotencyKey: `quiz:${quizAttemptId}`,    // {도메인}:{고유 PK} 컨벤션
  metadata: { quizId },
  transaction: t,
});
```

### 지켜야 할 것 3가지

1. **트랜잭션을 반드시 넘길 것.** 퀴즈 채점처럼 자체 트랜잭션 안에서 호출할 때 `transaction`을
   생략하면 별개의 트랜잭션이 열려, "퀴즈 결과 저장은 성공했는데 포인트 지급은 실패"처럼
   따로 커밋/롤백되는 불일치가 생긴다. 넘기면 그 트랜잭션에 그대로 합류한다(SAVEPOINT를
   열지 않는다).

2. **이벤트당 정확히 1회 호출할 것.** `recordProgress`는 진행도 증가 자체의 중복 제거를 하지
   않는다(`eventId`는 원장 기록용일 뿐이다). 같은 완독 이벤트로 두 번 호출하면 진행도가 2 오른다.
   다만 **포인트 중복 지급은 `daily_mission_id` 기반 멱등키가 항상 막는다** — 최악의 경우에도
   진행도만 부풀고 포인트가 두 번 나가지는 않는다.

3. **잠금 순서를 지킬 것.** 이 도메인의 잠금 순서는 `출석 로그 → 미션 행 → 지갑 행`이다.
   같은 트랜잭션에서 `addPoints`와 `recordProgress`를 함께 쓴다면 **`recordProgress`를 먼저**
   호출해야 한다. 반대로 하면 서로 다른 방향으로 잠금을 잡아 교착이 발생한다.

### 반환값

```js
// recordProgress
{ updated: boolean, mission: DailyMission, reward: AddPointsResult|null }

// addPoints
{ alreadyProcessed: boolean, wallet, rewardTransaction, pointsAdded: number,
  leveledUp: boolean, oldLevel: number, newLevel: number }
```

`leveledUp`이 `true`면 레벨업 연출을 띄울 근거가 된다. `alreadyProcessed: true`는 멱등키가
걸려 중복 지급이 차단된 경우이며, `pointsAdded`는 0이다(**오류가 아니다**).

---

## 동시성

| 시나리오 | 방어 |
|---|---|
| 같은 자녀의 출석 요청 동시 도착 | `UNIQUE(child_profile_id, attendance_date)` — 진 쪽은 포인트 지급 경로를 타지 않음 |
| 같은 미션의 진행도 동시 갱신 | 미션 행 `FOR UPDATE` 잠금 + `UNIQUE(child_profile_id, mission_date, mission_type)` |
| 같은 사유의 포인트 중복 지급 | 지갑 행 잠금 → 멱등키 확인 → 지급 순서 + `UNIQUE(child_profile_id, idempotency_key)` |
| 지갑/미션 행 최초 생성 경합 | find-or-create 후 UNIQUE 충돌 시 재조회로 같은 행에 합류 |
| 갭 락 경합으로 인한 데드락 | 최상위 트랜잭션에서 최대 3회 재시도 (`src/utils/dbRetry.js`) |

> `reward_wallets.points`에는 `CHECK(points >= 0)`가 걸려 있으나 **MySQL 8.0.16 미만에서는
> 조용히 무시된다.** 해당 버전에서는 애플리케이션 레벨 검증만이 잔액 음수를 막는다.
> 배포 대상 MySQL 버전 확인이 필요하다.
