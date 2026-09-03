# 배지 API 스펙

> Base URL: `{SERVER_URL}/api`
> Content-Type: `application/json`
> **모든 엔드포인트는 인증 필요** — `Authorization: Bearer {accessToken}` (없으면 401)

대상 요구사항: **RW04_ACH_02**(조건 기반 배지 획득), **MP02_RWD_03**(보유 배지 확인).

---

## 구현 상태

| 항목 | 상태 |
|---|---|
| `child_badges` 스키마 | ✅ 마이그레이션 `0012` |
| 배지 카탈로그 (`src/config/badgeCatalog.js`) | ✅ 11종 |
| 조건 자동 판정 + 수여 (`badgeService`) | ✅ 구현 완료 |
| API 2종 | ✅ 구현 완료 |
| 출석 → 배지 판정 연동 | ✅ `attendance.service.checkIn`에서 호출 |
| **동화·퀴즈·단어장 조건 판정** | ⏳ **대기 중 — 개발자 B 테이블이 아직 없음.** 아래 "개발자 B 연동 계약" 참고 |
| 배지 이름·설명·조건 수치 | ⚠️ **예시값 — 기획 확정 필요** |

---

## 설계: 배지 종류는 DB가 아니라 코드에 있다

`badges` 테이블은 만들지 않았다. 배지의 이름·설명·조건은 `src/config/badgeCatalog.js`의
코드 상수이고, DB에는 **누가 무엇을 언제 받았는지**만(`child_badges`) 남는다.

레벨 임계값(`levelThresholds.js`)·미션 카탈로그(`missionCatalog.js`)와 같은 판단이다
([WEEK3_A_DESIGN.md](./WEEK3_A_DESIGN.md) 4절):

- 배지를 런타임에 조정할 관리자 UI가 없는 단계라, 테이블 + 시드 데이터를 늘리는 것보다
  리뷰 가능한 PR로 관리하는 편이 낫다.
- **조건 판정은 어차피 코드다.** `condition_type='streak'`을 테이블에 넣어도 그걸 해석해
  `wallet.streak_days >= 10`을 실행하는 건 코드다. 조건만 테이블로 빼면 로직과 데이터가 갈라진다.
- 시드 데이터 관리 부담이 없다 — 환경마다 INSERT를 챙기지 않아도 되고, 빠뜨려서
  목록이 비는 사고가 나지 않는다.

그래서 `child_badges.badge_code`는 FK가 아니라 VARCHAR이며, 유효성은 모델의 `isIn`으로 본다.
`daily_missions.mission_type` ↔ `MISSION_CATALOG`와 같은 관계다.

> **`badge_code`는 절대 바꾸지 말 것** — 이미 수여된 행의 의미가 달라진다.

---

## 배지 상태 3가지

자녀별 조회에서 각 배지는 아래 셋 중 하나다.

| status | 뜻 | 프론트 표시 |
|---|---|---|
| `earned` | 획득함 | 컬러 + 획득일 |
| `locked` | 아직 조건 미달 | 회색 (진행도 표시 가능) |
| `coming_soon` | **판정 기능이 아직 없음** | "곧 열려요" |

`locked`와 `coming_soon`을 나눈 이유: 전자는 노력하면 딸 수 있고, 후자는 백엔드가 아직
준비되지 않아 **아무리 해도 못 딴다**. 둘을 같게 표시하면 사용자 눈에는 버그다.

---

## 1. 전체 배지 카탈로그

```
GET /api/badges
```

자녀와 무관한 정적 목록. "어떤 배지들이 있는지" 보여주는 화면에서 쓴다.

### Response

**200 OK**
```json
{
  "success": true,
  "message": "배지 목록을 조회했습니다.",
  "data": {
    "badges": [
      {
        "badge_code": "attendance_first",
        "name": "첫 걸음",
        "description": "처음으로 출석했어요",
        "icon_key": "foot",
        "condition": { "type": "attendance_total", "value": 1 },
        "evaluable": true
      }
    ]
  }
}
```

- `icon_key`는 URL이 아니라 **키**다. 프론트가 이미지에 매핑한다 — 아이콘을 교체할 때
  백엔드 배포가 필요 없도록.
- `condition`을 노출하는 이유: 프론트가 "10일 중 3일" 같은 진행도를 그릴 수 있어야 해서.
- `evaluable: false`면 아직 판정할 수 없는 배지다.

---

## 2. 자녀의 배지 현황

```
GET /api/badges/:childId
```

획득한 배지와 못 한 배지를 **모두** 돌려준다. 못 딴 배지를 감추지 않는 이유는 잠긴 배지를
보여주는 것 자체가 동기부여이기 때문이다.

### Response

**200 OK**
```json
{
  "success": true,
  "message": "배지 현황을 조회했습니다.",
  "data": {
    "badges": [
      {
        "badge_code": "attendance_first",
        "name": "첫 걸음",
        "description": "처음으로 출석했어요",
        "icon_key": "foot",
        "condition": { "type": "attendance_total", "value": 1 },
        "status": "earned",
        "awarded_at": "2026-08-20T06:18:13.000Z"
      },
      {
        "badge_code": "story_10",
        "name": "이야기 친구",
        "description": "동화를 10편 읽었어요",
        "icon_key": "book",
        "condition": { "type": "story_read_total", "value": 10 },
        "status": "coming_soon",
        "awarded_at": null
      }
    ],
    "earned_count": 1,
    "total_count": 11
  }
}
```

**400** (childId 형식 오류) · **401** · **404**(소유하지 않은 자녀)

---

## 3. 배지는 언제 수여되는가

별도의 "수여 API"는 없다. **조건이 변할 만한 지점에서 서버가 자동으로 판정한다.**

현재 연동된 지점: `POST /api/attendance/check` (출석 체크)

출석 응답에 이번에 새로 받은 배지가 함께 온다.

```json
{
  "success": true,
  "message": "출석이 완료되었습니다.",
  "data": {
    "alreadyChecked": false,
    "attendanceDate": "2026-08-20",
    "streakDays": 1,
    "pointsEarned": 10,
    "badgesAwarded": ["attendance_first"]
  }
}
```

프론트는 `badgesAwarded`가 비어 있지 않으면 획득 축하 화면을 띄우면 된다.
**멱등하다** — 같은 날 다시 호출하면 `badgesAwarded: []`다.

### 배지 수여는 포인트를 주지 않는다

배지는 성취 표시일 뿐이다. 배지에도 포인트를 붙이면 같은 행동에 미션 보상과 배지 보상이
이중으로 나간다. 기획에서 배지 보상이 필요하다고 하면 `rewardService.addPoints`를
멱등키 `badge:{childProfileId}:{badge_code}`로 부르면 된다.

---

## 4. 개발자 B 연동 계약

동화·퀴즈·단어장 조건(`story_10`, `quiz_50`, `vocabulary_100`)은 지금 `evaluable: false`라
목록에만 보이고 판정되지 않는다. 데이터가 준비되면 아래 두 단계로 열린다.

**① 판정기 추가** — `src/services/badgeEvaluators.js`

```js
/** 읽은 동화 수. */
const story_read_total = async (childProfileId, { transaction } = {}) => {
  return StoryRead.count({ where: { child_profile_id: childProfileId }, transaction });
};
```

모든 판정기는 같은 시그니처를 지킨다. **현재 수치만 돌려주면 되고**, 조건값과 비교하는
일은 `badgeService`가 한다(같은 지표를 쓰는 배지가 여러 개라 지표는 타입당 한 번만 잰다).

**② 플래그 켜기** — `src/config/badgeCatalog.js`에서 해당 배지의 `evaluable`을 `true`로.

**③ 이벤트 지점에서 호출** — 동화 읽기·퀴즈 채점을 **커밋한 뒤**에 부른다.

```js
const badgeService = require('./badge.service');

// ... 동화 읽기 처리 트랜잭션 커밋 후
const badgesAwarded = await badgeService.evaluateQuietly(childProfileId);
return { ...result, badgesAwarded };
```

`evaluateQuietly`는 **실패해도 예외를 던지지 않는다.** 배지는 부가 기능이라 판정이 깨져도
본래 동작(동화 읽기·퀴즈 채점)을 되돌리면 안 되기 때문이다. 이번에 놓쳐도 다음 이벤트 때
조건을 다시 재므로 배지가 영영 누락되지는 않는다.

> **트랜잭션 안에서 부르지 말 것.** 배지 판정 실패가 본래 동작을 롤백시킨다.

---

## 5. 현재 배지 목록 (기획 확정 전 예시값)

| badge_code | 이름 | 조건 | 판정 |
|---|---|---|---|
| `attendance_first` | 첫 걸음 | 출석 1회 | ✅ |
| `attendance_30` | 개근왕 | 출석 30일 | ✅ |
| `streak_7` | 일주일 개근 | 연속 출석 7일 | ✅ |
| `streak_10` | 꾸준한 아이 | 연속 출석 10일 | ✅ |
| `points_100` | 포인트 수집가 | 포인트 100점 | ✅ |
| `points_1000` | 포인트 부자 | 포인트 1000점 | ✅ |
| `level_5` | 성장하는 아이 | 레벨 5 | ✅ |
| `mission_10` | 미션 해결사 | 미션 10회 완료 | ✅ |
| `story_10` | 이야기 친구 | 동화 10편 | ⏳ B 대기 |
| `quiz_50` | 퀴즈 박사 | 퀴즈 50개 정답 | ⏳ B 대기 |
| `vocabulary_100` | 단어 부자 | 단어 100개 | ⏳ B 대기 |

### 알려진 한계

- **`total_points`는 지금 "누적 획득량"과 같다.** 포인트 차감 기능이 없기 때문이다.
  나중에 포인트를 쓰는 기능이 생기면 잔액이 줄어도 배지를 회수하면 안 되므로,
  `reward_transactions`의 지급 합계를 세도록 판정기를 바꿔야 한다.
- **`streak_days`는 "현재" 연속일이지 최고 기록이 아니다.** 10일 연속 후 끊기고 배지를
  못 받은 상태였다면, 다시 10일을 채워야 한다. 최고 기록을 쓰려면 컬럼 추가가 필요하다.
