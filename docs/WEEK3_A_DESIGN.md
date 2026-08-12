# Week 3 개발자 A 설계 문서 — 출석 / 미션 / 보상(포인트·레벨)

> **상태: 설계안 (리뷰 대기, 미구현)**. 이 문서는 모델·API·서비스 인터페이스 설계만 다루며,
> 실제 소스/모델/마이그레이션은 아직 생성하지 않았다. 개발자 B 소유 파일(스토리/퀴즈/단어장)은
> 이번 설계에서 참조만 하고 수정하지 않는다.
>
> 기준 문서: `docs/DEVELOPMENT_PLAN.md`(Week 3 개발자 A 행), `docs/04_요구사항정의서_v3.0_최신통합.xlsx`
> 대상 요구사항: MN02, MN03, MN04, MP02, MP03(월간 출석률만), PD02(월간 출석률만), RW01~RW04

---

## 0. 사전 결정: 토큰/포인트 통합

**기본안(채택): 토큰과 포인트를 `points` 하나의 재화로 통합한다.** DB/백엔드 필드명은 전부
`points`를 쓰고, 프론트엔드가 화면에 따라 "토큰"(메인 화면) 또는 "포인트"(마이페이지)로
다르게 라벨링한다.

### 근거

요구사항 문서 전체를 검색한 결과:
- "토큰"이 게임 재화 의미로 쓰인 곳은 **`MN02_TOKEN_01` 단 하나**뿐이다("현재 사용자가
  보유한 토큰... 표시"). 그 외 "토큰" 언급은 전부 JWT 인증 토큰(AU01, SC03)이라 무관하다.
- "토큰을 소모/차감한다"는 문구는 요구사항 어디에도 없다. 즉 AI 생성 비용 과금처럼 별도
  소모형 재화가 필요하다는 근거가 요구사항에는 없다.
- 반대로 RW01~RW04, MP02는 전부 "포인트"라는 용어만 쓰고, 지급·누적·레벨·히스토리를
  일관되게 "포인트" 하나로 설명한다.
- 따라서 MN02의 "토큰"은 MP02의 "포인트"를 메인 화면에서 부르는 다른 이름일 가능성이 높고,
  요구사항 레벨에서는 통합안과 상충하지 않는다.

### 기존 ERD와의 충돌 (보고)

`ERD/ERD_User.pdf`의 `reward_wallets`에는 `point_balance`와 `token_balance`가 **별도
컬럼**으로 설계되어 있다. 이 설계는 그 ERD와 다르다.

- **충돌 성격**: `reward_wallets`는 아직 DB에 생성된 적이 없는 테이블이라(Week 3에 처음
  만들어짐) 기존 데이터 마이그레이션 문제는 없다. 순수하게 "문서상 설계 방향의 차이"다.
- **대안 B(ERD 그대로)**: `points`(누적/레벨용, 소모 불가)와 `tokens`(AI 생성 등에 소모
  가능, 별도 차감 API 필요)를 분리 유지. AI 동화 생성 서비스 특성상 향후 "토큰 소모형
  과금"이 실제로 도입될 가능성은 실무적으로 낮지 않다 — 이 경우 대안 B가 맞다.
- **권장**: 사용자 지시 및 위 근거에 따라 **기본안(통합)으로 진행**하되, 이 결정은 기획/PM
  확인이 필요한 사항으로 8절에 다시 명시한다. 나중에 소모형 토큰이 필요해지면
  `reward_wallets`에 `tokens` 컬럼을 추가하는 것은 (기존 `points` 데이터를 건드리지 않는)
  순수 추가 마이그레이션이라 되돌리기 어려운 결정은 아니다.

---

## 1. 요구사항 매핑

| 요구사항 | 내용 | 이번 설계 범위 |
|---|---|---|
| MN02_TOKEN_01 | 메인 화면 보유 토큰(=포인트) 표시 | `GET /api/rewards/:childId/summary` |
| MN03_MISSION_01 | 오늘의 미션 확인 버튼 → 상세 이동 | `GET /api/missions/progress/:childId` |
| MN04_ATTEND_01 | 출석 현황 확인 버튼 → 출석 화면 이동 | `GET /api/attendance/:childId` |
| MP02_RWD_01 | 보유 포인트 확인 | `GET /api/rewards/:childId` |
| MP02_RWD_02 | 현재 레벨 확인 | `GET /api/rewards/:childId` |
| MP02_RWD_04 | 보상 내역 화면 진입 | `GET /api/rewards/:childId/history` |
| MP03_STAT_01(부분) / PD02_STAT_01 | 이번 달 출석 일수·출석률 | `GET /api/attendance/:childId?month=` |
| RW01_POINT_01 | 학습 완료(동화/단어/퀴즈) 포인트 | `missionService.recordProgress` → `rewardService.addPoints` |
| RW01_POINT_02 | 데일리 미션 달성 보상 | `daily_missions` 상태 전이 + `addPoints` |
| RW02_STREAK_01 | 연속 학습일 관리 + 보너스 | `reward_wallets.streak_days` (출석 체크 트리거) |
| RW03_HISTORY_01 | 포인트 획득 기록(날짜/유형별) | `reward_transactions` + `GET /history` |
| RW04_ACH_01 | 누적 포인트 기반 레벨 | `rewardService.checkLevelUp` |

**명시적으로 이번 설계 범위 밖**(Dev B 데이터 의존 또는 이번 주 대상 아님):
- MP02_RWD_03(배지), RW04_ACH_02(배지) — Week 4.
- MP03_STAT_02~04, PD02_STAT_02~03(읽은 동화 수, 퀴즈 정답률 등) — Dev B의 스토리/퀴즈
  테이블에 의존. 이번 설계는 "월간 출석률"만 다룬다(사용자 지시대로).
- MP03_STAT_03(누적 학습 시간)은 Week 2 `usage_daily_summaries`로 이미 계산 가능하지만,
  이번 4개 모델 설계 범위에 포함되지 않아 API는 별도 제안하지 않는다(필요하면 후속 설계).

---

## 2. 권장 스키마

공통 컨벤션(Week 1·2와 동일하게 유지):
- PK는 `BIGINT AUTO_INCREMENT`, FK도 `BIGINT`.
- enum성 값은 MySQL `ENUM` 대신 `STRING` + Sequelize `validate: { isIn: [[...]] }`
  (`learning_level`, `EmailVerification.purpose`와 동일 컨벤션 — 값 추가 시 ENUM 마이그레이션
  불필요).
- 자녀 소유 데이터는 `child_profiles`에 `ON DELETE CASCADE` (Week 2 `usage_daily_summaries`
  선례와 동일 — child_profiles→users처럼 생성 컬럼 제약이 걸릴 이유가 없으므로 CASCADE 가능).
- 각 마이그레이션은 `db/migrations/0001`~`0007`과 동일하게 `information_schema` 가드 +
  idempotent 재실행 + `-- Rollback:` 주석 컨벤션을 따른다. **전부 신규 테이블이라 기존 데이터
  마이그레이션 이슈는 없음** — `CREATE TABLE IF NOT EXISTS`로 충분.

### 2-1. `attendance_logs`

| 컬럼 | 타입 | 제약 |
|---|---|---|
| attendance_log_id | BIGINT | PK, AUTO_INCREMENT |
| child_profile_id | BIGINT | NOT NULL, FK → child_profiles.child_profile_id, ON DELETE CASCADE |
| attendance_date | DATE | NOT NULL (Asia/Seoul 캘린더 날짜) |
| checked_at | DATETIME | NOT NULL (서버 처리 시각, 감사용) |
| created_at | DATETIME | NOT NULL |

- **UNIQUE(child_profile_id, attendance_date)** — "자녀별 출석은 하루 한 번만 기록"을 DB
  레벨에서 강제하는 핵심 제약. 이 복합 인덱스가 `child_profile_id` 기준 조회도 커버하므로
  별도 인덱스는 불필요.
- `updated_at` 없음 — 생성 후 수정되지 않는 불변 로그(`refresh_tokens`, `email_verifications`와
  동일 패턴).
- 생성 주체: `attendanceService.checkIn()`만. 갱신 주체 없음(불변).
- 신규 테이블 — 기존 데이터 마이그레이션 없음. Rollback: `DROP TABLE IF EXISTS`.
- 예정 파일: `db/migrations/0008_create_attendance_logs.sql`.

### 2-2. `daily_missions`

| 컬럼 | 타입 | 제약 |
|---|---|---|
| daily_mission_id | BIGINT | PK, AUTO_INCREMENT |
| child_profile_id | BIGINT | NOT NULL, FK → child_profiles, ON DELETE CASCADE |
| mission_date | DATE | NOT NULL (Asia/Seoul) |
| mission_type | VARCHAR(30) | NOT NULL, `isIn: ['story_read','word_clicked','quiz_answered','attendance']` |
| target_count | INT | NOT NULL |
| progress_count | INT | NOT NULL, DEFAULT 0 |
| reward_points | INT | NOT NULL |
| status | VARCHAR(20) | NOT NULL, DEFAULT `'pending'`, `isIn: ['pending','completed','rewarded']` |
| completed_at | DATETIME | NULL |
| rewarded_at | DATETIME | NULL |
| created_at, updated_at | DATETIME | NOT NULL |

- **UNIQUE(child_profile_id, mission_date, mission_type)** — 자녀당 하루에 미션 타입별로
  정확히 1행만 존재. 중복 생성/중복 보상의 근본 방어선.
- 상태 전이: `pending →(progress_count ≥ target_count)→ completed →(addPoints 성공)→ rewarded`.
  `completed`와 `rewarded`를 분리한 이유: "진행도 달성"과 "포인트 실제 지급"은 별개
  트랜잭션 단계일 수 있어(재시도 시 어디까지 됐는지 구분 필요), 둘을 합치면 재시도 시
  이미 완료됐는지 판단할 근거가 흐려진다.
- 생성 주체: `missionService`가 **지연 생성(lazy generation)** — 아래 3-2절 참고.
- 갱신 주체: `missionService.recordProgress()`만 (progress_count/status/completed_at/rewarded_at).
- 신규 테이블 — 기존 데이터 마이그레이션 없음. Rollback: `DROP TABLE IF EXISTS`.
- 예정 파일: `db/migrations/0009_create_daily_missions.sql`.

**미션 카탈로그(코드 상수, DB 테이블 아님)** — 근거는 4-3절 레벨 정책과 동일 논리로 5절에서
다시 설명:

```js
// src/config/missionCatalog.js (예정, 미구현)
const MISSION_CATALOG = [
  { mission_type: 'attendance',    target_count: 1, reward_points: 10 },
  { mission_type: 'story_read',    target_count: 1, reward_points: 20 },
  { mission_type: 'word_clicked',  target_count: 5, reward_points: 15 },
  { mission_type: 'quiz_answered', target_count: 1, reward_points: 20 },
];
```
> 수치는 예시이며 기획 확정 필요(8절).

### 2-3. `reward_wallets`

| 컬럼 | 타입 | 제약 |
|---|---|---|
| wallet_id | BIGINT | PK, AUTO_INCREMENT |
| child_profile_id | BIGINT | NOT NULL, **UNIQUE**, FK → child_profiles, ON DELETE CASCADE |
| points | INT | NOT NULL, DEFAULT 0, **CHECK (points >= 0)** |
| level | INT | NOT NULL, DEFAULT 1 |
| streak_days | INT | NOT NULL, DEFAULT 0 |
| last_activity_date | DATE | NULL (마지막으로 streak가 갱신된 Asia/Seoul 날짜) |
| created_at, updated_at | DATETIME | NOT NULL |

- MySQL 8.0.16+는 `CHECK` 제약을 실제로 강제한다(이 저장소는 이미 MySQL 8 전제, 0003의
  `ROW_NUMBER()` 사용으로 확인됨) — "포인트 잔액은 음수가 될 수 없음"의 DB 레벨 안전망.
  애플리케이션 레벨(아래 `addPoints`)에서도 항상 양수만 가감하므로 이중 방어.
  **이번 설계는 "지급"만 다루고 "차감/환수" API는 포함하지 않는다** — 8절 결정사항 참고.
- `last_activity_date`: RW02 연속 학습일 계산에 필요. 출석 체크 시 이 값과 "어제 날짜"를
  비교해 streak 증가/리셋을 결정(3-3절).
- 생성 주체: **지연 생성** — `rewardService`가 `addPoints`/`checkLevelUp`/조회 API 최초
  호출 시 `getOrCreate` 패턴(`guardian.service.js`와 동일 컨벤션)으로 생성. Week 2의
  `childService.create()`는 건드리지 않는다(이미 배포·테스트된 코드를 이번 설계에서
  수정하지 않기 위함).
- 신규 테이블 — 기존 데이터 마이그레이션 없음. Rollback: `DROP TABLE IF EXISTS`.
- 예정 파일: `db/migrations/0010_create_reward_wallets.sql`.

### 2-4. `reward_transactions` (신규 제안 — 목록에 없었지만 필요)

**필요성 검토 결과: 필요함.** 근거:
1. RW03("포인트 획득 기록을 날짜/유형별로 조회")은 `reward_wallets.points`라는 현재 잔액
   하나만으로는 구현 불가능하다 — 이력 자체가 없다. 이력을 남기는 테이블이 필수다.
2. "같은 보상 이벤트가 재시도돼도 중복 지급되지 않음"을 만족하려면, 이미 처리한 이벤트인지
   판단할 근거가 잔액 컬럼만으로는 없다 — `idempotency_key`를 저장할 곳이 필요하다.
3. 감사/디버깅("왜 포인트가 이렇게 늘었지?")에도 원장이 필수.

| 컬럼 | 타입 | 제약 |
|---|---|---|
| reward_transaction_id | BIGINT | PK, AUTO_INCREMENT |
| child_profile_id | BIGINT | NOT NULL, FK → child_profiles, ON DELETE CASCADE |
| points | INT | NOT NULL, **CHECK (points > 0)** (이번 설계는 지급 이력만) |
| reason | VARCHAR(50) | NOT NULL, `isIn: ['attendance','streak_bonus','mission_reward','story_read','word_clicked','quiz_answered', ...]` (Dev B 확장 여지, 6절 참고) |
| idempotency_key | VARCHAR(150) | NOT NULL |
| balance_after | INT | NOT NULL (이 거래 직후 잔액 스냅샷 — 이력 재계산 없이 특정 시점 잔액 조회 가능) |
| metadata | JSON | NULL (예: `{"mission_type":"story_read","mission_date":"2026-08-06"}`) |
| created_at | DATETIME | NOT NULL |

- **UNIQUE(child_profile_id, idempotency_key)** — 중복 지급 방지의 실제 강제 지점.
- **INDEX(child_profile_id, created_at)** — `GET /rewards/:childId/history`의 날짜순
  페이지네이션 조회 최적화.
- `updated_at` 없음 — 원장은 불변.
- 생성 주체: `rewardService.addPoints()`만. 갱신/삭제 없음.
- 신규 테이블 — 기존 데이터 마이그레이션 없음. Rollback: `DROP TABLE IF EXISTS`.
- 예정 파일: `db/migrations/0011_create_reward_transactions.sql`.

---

## 3. 무결성·동시성 정책 (요청 항목별 대응)

Week 2에서 이미 검증된 패턴(실제 동시 요청 스모크 테스트 통과 이력 있음)을 그대로 재사용한다.

| 요구 조건 | 메커니즘 | 재사용하는 기존 패턴 |
|---|---|---|
| 자녀별 출석 하루 한 번 | `UNIQUE(child_profile_id, attendance_date)` | — |
| Asia/Seoul 날짜 기준 | 모든 서비스가 동일한 날짜 함수 사용 | `usage.service.js`의 `getSeoulDateString()` (5절에서 공용화 제안) |
| 동시 출석 요청 시 1회만 성공 | 행 잠금(`FOR UPDATE`) 후 조회 → 없으면 INSERT → 유니크 충돌 시 재조회 | `usage.service.js`의 `findOrCreateSummary` (Week2 실제 데드락 발견 후 재시도 로직 추가된 이력 있음 — 5절에서 재사용 제안) |
| 출석 재요청 idempotent | 이미 존재하는 행을 찾으면 `alreadyChecked:true`로 **같은 응답 형태** 반환, 재지급 없음 | `guardian.service.js` PIN 잠금의 "같은 결과 반환" 패턴과 동일 사상 |
| 포인트 잔액 음수 불가 | DB `CHECK(points>=0)` + `addPoints`는 양수만 처리 + 지갑 행 잠금으로 잔액 갱신 직렬화 | — |
| 포인트 지급+원장 기록 = 1 transaction | `addPoints` 내부에서 `wallet.save()`와 `RewardTransaction.create()`를 같은 `t`로 실행 | Week1 `authService.signup`(User 생성+인증기록 소멸을 1 트랜잭션)과 동일 사상 |
| 같은 보상 이벤트 재시도해도 중복 지급 안 됨 | 지갑 행 잠금 **이후** `idempotency_key` 존재 확인 → 있으면 무지급 반환, 없으면 지급+기록. `UNIQUE(child_profile_id, idempotency_key)`가 최후 안전망 | `authService.signup`의 unique 제약 안전망(TOCTOU 대비)과 동일 사상 |
| 레벨은 누적 포인트 기준 | `checkLevelUp`이 `wallet.points`로부터 순수 함수로 재계산(별도 누적 카운터 없음) | — |
| 미션 완료 보상 1회만 | `status` 3단계 전이 + `addPoints`의 `idempotencyKey = 'mission:{daily_mission_id}'` 이중 방어 | — |
| 다른 사용자 자녀 데이터 접근 차단 | 모든 자녀 스코프 API가 `childService.getById(req.user.user_id, childId)` 호출(미소유/미존재 시 404) | Week2 `child.service.js` 확립 패턴 그대로 재사용 |
| 활성 프로필 여부와 API 사용 정책 | **소유권만 검증하고 활성(is_active) 여부는 검사하지 않는다** — 비활성 자녀의 출석/보상 이력도 조회·기록 가능 | Week2 `usage.service.js`(heartbeat)와 동일 정책, 일관성 유지 |

### 3-1. 동시성 시나리오 상세: `addPoints` 동시 호출

두 요청이 같은 `childProfileId`에 동시에 `addPoints`를 호출하면:
1. 둘 다 지갑 행에 `SELECT ... FOR UPDATE`를 시도 — 하나만 잠금을 얻고 나머지는 대기.
2. 먼저 잠금을 얻은 트랜잭션이 `idempotency_key` 확인 → 없음 → 잔액 갱신 + 원장 INSERT → 커밋.
3. 대기하던 트랜잭션이 잠금을 얻음 → 이제는 (a) 다른 `idempotency_key`라면 정상적으로
   추가 지급, (b) 같은 `idempotency_key`라면 방금 커밋된 행을 보고 무지급 반환.

이는 Week2 `usage_daily_summaries`(heartbeat 누적)와 `guardian_settings`(PIN 실패 카운터)에서
**이미 동시 HTTP 요청으로 실측 검증된 패턴**이다(각각 5개/8개 동시 요청 테스트 통과 이력).

### 3-2. 미션 지연 생성(lazy generation) 방식

이 저장소에는 스케줄러(cron 등)가 없다. Week 2의 "그날 첫 heartbeat가 요약 행을 생성"과
동일하게, **미션도 그날 첫 접근 시점에 생성**한다:
- `GET /api/missions/progress/:childId` 또는 `missionService.recordProgress()`가 오늘자
  미션 행이 없으면 `MISSION_CATALOG`의 4종을 전부 생성(단건 INSERT 4회, 각각
  `UNIQUE(child_profile_id, mission_date, mission_type)`로 보호되는 find-or-create-재시도
  패턴).
- **대안(채택 안 함)**: 자정에 배치로 전체 자녀에 대해 미리 생성. 별도 스케줄러 인프라
  도입이 필요해 이번 주 범위를 벗어난다고 판단. 필요해지면 8절에 후속 과제로 기록.
- **날짜 변경 처리**: 자정(KST)이 지나면 다음 접근 시 새 `mission_date`의 행이 새로
  생성된다. 어제자 행은 삭제/마감 처리 없이 그대로 이력으로 남는다(Week2
  `usage_daily_summaries`의 "이전 날짜 기록은 그대로 남는다" 정책과 동일).

### 3-3. Streak(연속 학습일) 계산

`attendanceService.checkIn()`이 트리거:
```
어제 = today - 1일 (Asia/Seoul)
if wallet.last_activity_date == 어제:      streak_days += 1
else if wallet.last_activity_date == 오늘:  변경 없음 (이미 오늘 처리됨 — idempotent 경로에서는 도달 안 함)
else:                                       streak_days = 1  (연속 끊김 또는 첫 출석)
wallet.last_activity_date = 오늘
```
> "RW02가 '매일 학습 시'라고 되어 있는데 출석 체크만으로 충분한가"는 8절 결정사항.

---

## 4. 레벨 정책

### 옵션 비교

| | A. 수식 기반(예: `level = floor(points/100)+1`) | **B. 코드 상수 배열(누적 임계값 리스트)** | C. DB 테이블(`level_thresholds`) |
|---|---|---|---|
| 저장 공간 | 없음 | 없음(코드) | 테이블 1개 |
| 레벨별 세밀 조정 | 어려움(공식 하나로 전체 지배) | **쉬움(레벨마다 값 독립 지정)** | 쉬움 |
| 변경 시 필요 작업 | 코드 수정+배포 | 코드 수정+배포 | 관리자가 DB row만 수정(배포 불필요) |
| 이번 프로젝트 적합성 | 초반 레벨/후반 레벨 난이도를 다르게 주기 어려움 | **적합** | 관리자 UI가 없어 실익 적음, 5번째 테이블 추가는 이번 지시 범위(4개+검토1) 밖 |

### 권장안: **B (코드 상수 배열)**

```js
// src/config/levelThresholds.js (예정, 미구현)
// index i = level (i+1)의 누적 필요 포인트
const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5200];
// level 1: 0점~, level 2: 100점~, level 3: 300점~ ...

function computeLevelFromPoints(points) {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i += 1) {
    if (points >= LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  return level;
}
```

**근거**: 이 프로젝트는 레벨을 런타임에 관리자가 조정할 UI/필요가 없는 2인 5주 MVP다.
DB 테이블(옵션 C)은 "값을 배포 없이 바꿀 수 있다"는 이점이 있지만 지금 그 이점을 쓸 주체가
없고, 테이블 하나(+ CRUD 없음)만 늘어난다. 코드 상수는 리뷰 가능한 PR로 레벨 밸런스를
관리할 수 있어 오히려 이 단계에 더 적합하다고 판단. 값 자체(임계값 수치)는 기획 확정
필요(8절).

---

## 5. 서비스 인터페이스

### 5-1. `rewardService` (`src/services/reward.service.js`, 예정)

```js
/**
 * 포인트 지급 + 원장 기록을 하나의 트랜잭션으로 처리한다.
 * idempotencyKey가 이미 존재하면(재시도) 지급 없이 기존 결과를 반환한다.
 *
 * @param {object} params
 * @param {number} params.childProfileId
 * @param {number} params.points - 양수만 허용(이번 설계는 지급만 다룸)
 * @param {string} params.reason - 'attendance' | 'streak_bonus' | 'mission_reward' | ... (reason 카탈로그, 6절)
 * @param {string} params.idempotencyKey - 호출자가 보장하는 고유 키. 형식 컨벤션: `{domain}:{source_id}`
 * @param {object} [params.metadata] - JSON에 그대로 저장되는 부가 정보
 * @param {import('sequelize').Transaction} [params.transaction] - 있으면 재사용, 없으면 자체 트랜잭션 시작
 * @returns {Promise<{ alreadyProcessed: boolean, wallet, transaction: RewardTransaction }>}
 */
async function addPoints({ childProfileId, points, reason, idempotencyKey, metadata, transaction }) {}

/**
 * 현재 포인트로 레벨을 재계산하고, 상승했으면 반영한다. addPoints를 자동으로 호출하지
 * 않는다 — 호출자가 addPoints 이후 명시적으로, 같은 transaction으로 호출해야 한다.
 *
 * @param {number} childProfileId
 * @param {object} [options]
 * @param {import('sequelize').Transaction} [options.transaction]
 * @returns {Promise<{ leveledUp: boolean, oldLevel?: number, newLevel?: number }>}
 */
async function checkLevelUp(childProfileId, { transaction } = {}) {}

// 조회용 보조 함수 (API 레이어가 사용)
async function getOrCreateWallet(childProfileId) {}                 // GET /rewards/:childId 기반
async function getSummary(childProfileId) {}                        // GET /rewards/:childId/summary 기반
async function getHistory(childProfileId, { page, limit, reason, from, to }) {} // GET /rewards/:childId/history 기반
```

### 5-2. `missionService` (`src/services/mission.service.js`, 예정)

```js
/**
 * 미션 진행도를 올리고, 목표 달성 시 완료 처리 + 포인트 지급까지 한 트랜잭션에서 수행한다.
 * 오늘자 미션 행이 없으면 먼저 지연 생성한다(3-2절).
 *
 * @param {object} params
 * @param {number} params.childProfileId
 * @param {string} params.eventType - mission_type과 동일한 값 집합('story_read' 등)
 * @param {number} [params.amount=1] - progress_count 증가량
 * @param {string} [params.eventId] - 원본 이벤트 식별자. 현재 설계는 이 값으로 진행도 증가
 *   자체의 이벤트 단위 중복 제거를 하지 않는다(8절 결정사항 — 호출자가 이벤트당 정확히
 *   1회 호출할 책임을 짐). 완료 시 지급되는 포인트의 idempotencyKey에는 daily_mission_id를
 *   쓰므로(eventId 아님) 포인트 중복 지급 자체는 이 값과 무관하게 항상 방지된다.
 * @param {import('sequelize').Transaction} [params.transaction]
 * @returns {Promise<{ updated: boolean, mission }>}
 */
async function recordProgress({ childProfileId, eventType, amount = 1, eventId, transaction }) {}

// 조회용 보조 함수
async function getCatalog() {}                       // GET /api/missions 기반 (정적 카탈로그)
async function getTodayProgress(childProfileId) {}    // GET /api/missions/progress/:childId 기반
```

### 5-3. `attendanceService` (`src/services/attendance.service.js`, 예정, 보조)

명시적으로 요청되진 않았지만 `addPoints`+`checkLevelUp`+`recordProgress`를 하나의
트랜잭션으로 묶는 조합 지점이 필요해 함께 설계한다.

```js
/**
 * 출석 체크. 소유권 검증 → 오늘자 로그 find-or-create(idempotent) → (최초 성공 시)
 * streak 갱신 + 출석 포인트 지급 + (마일스톤이면) streak 보너스 지급 + 레벨업 확인 +
 * 'attendance' 미션 진행도 갱신을 전부 한 트랜잭션에서 수행한다.
 *
 * @param {number} userId - 소유권 검증용
 * @param {number} childProfileId
 * @returns {Promise<{ alreadyChecked: boolean, attendanceDate: string, streakDays: number }>}
 */
async function checkIn(userId, childProfileId) {}

async function getMonthly(userId, childProfileId, { month } = {}) {} // GET /api/attendance/:childId 기반
```

### 5-4. 외부 트랜잭션 전달 / 중첩 트랜잭션 정책

**정책: SAVEPOINT 기반 진짜 중첩은 쓰지 않는다.** 모든 서비스 함수는 `transaction`을
선택 인자로 받고:
- 전달받으면 **그 트랜잭션을 그대로 재사용**한다(새 트랜잭션도 SAVEPOINT도 열지 않음).
- 전달받지 않으면 자신이 최상위 `sequelize.transaction()`을 연다.

```js
const run = async (t) => { /* ... 실제 로직, 전부 t로 실행 ... */ };
return transaction ? run(transaction) : sequelize.transaction(run);
```

**이유**: Sequelize에서 `sequelize.transaction()`을 이미 열린 트랜잭션 **밖에서** 다시
호출하면 완전히 별개의 트랜잭션이 열려 서로의 잠금과 무관하게 동작한다(교착·부분 커밋
위험). `{ transaction: parent }`를 명시해 SAVEPOINT로 중첩하는 것도 가능은 하지만, 이
프로젝트에는 "부모는 롤백해도 자식은 유지"할 필요가 있는 시나리오가 없어 불필요한
복잡도라고 판단했다. 그래서 **"항상 하나의 최상위 트랜잭션으로 합류한다"**는 단순한
규칙 하나로 통일한다.

**개발자 B가 지켜야 할 계약**: 퀴즈 채점처럼 자체 트랜잭션 안에서 `addPoints`/
`recordProgress`를 호출할 때는 반드시 자신의 `transaction`을 넘겨야 한다. 넘기지 않으면
"퀴즈 결과 저장은 성공했는데 포인트 지급은 실패"처럼 두 트랜잭션이 따로 커밋/롤백되는
불일치가 생길 수 있다.

### 5-5. 제안하는 소규모 리팩터링 (이번 설계 실행 시 함께 권장)

1. `usage.service.js`의 `getSeoulDateString()`을 `src/utils/dateUtils.js`로 옮겨
   attendance/mission 서비스와 공유(현재는 "사용시간" 서비스가 날짜 유틸을 소유하고 있어
   무관한 도메인이 거기 의존하게 됨).
2. `usage.service.js`의 `runWithDeadlockRetry()`(Week2에서 heartbeat 동시 생성 데드락을
   실제로 겪고 추가한 재시도 로직)를 `src/utils/dbRetry.js`로 옮겨 `attendanceService.checkIn`,
   `rewardService.addPoints`(지갑 최초 생성 시 동일한 종류의 INSERT 경쟁 가능)에도 적용.
   Week2에서 이미 실증된 실패 시나리오라 선제 적용을 권장.

---

## 6. 개발자 B에게 전달할 연동 계약

| 항목 | 내용 |
|---|---|
| 호출 모듈 | `require('../services/reward.service')`, `require('../services/mission.service')` (경로 예정) |
| 퀴즈 정답 시 | `missionService.recordProgress({ childProfileId, eventType: 'quiz_answered', amount: 1, eventId: `quiz_attempt:${attemptId}`, transaction: t })` — 자신의 채점 트랜잭션 `t`를 반드시 전달 |
| 동화 완독 시 | `missionService.recordProgress({ childProfileId, eventType: 'story_read', amount: 1, eventId: `story_read:${storyId}:${childProfileId}`, transaction: t })` |
| 단어 클릭 시 | `missionService.recordProgress({ childProfileId, eventType: 'word_clicked', amount: 1, eventId: `word_click:${vocabularyEntryId}`, transaction: t })` |
| 퀴즈 정답 포인트를 직접 지급하고 싶을 때 | `rewardService.addPoints({ childProfileId, points, reason: 'quiz_answered', idempotencyKey: `quiz_attempt:${attemptId}`, transaction: t })` — `recordProgress`가 미션 완료분 포인트는 알아서 지급하므로, "미션과 별개로 퀴즈 자체 정답 포인트"가 필요할 때만 이렇게 별도 호출 |
| idempotencyKey 컨벤션 | `{domain}:{그 도메인에서의 고유 PK}` 형식 권장(예: `quiz_attempt:123`). **같은 child + 같은 key로 두 번 호출해도 두 번째는 무지급으로 안전하게 처리됨**을 보장하므로, 재시도/중복 이벤트 걱정 없이 호출해도 된다. |
| reason 카탈로그 확장 | `reward_transactions.reason`은 `STRING`이라 마이그레이션 없이 새 값 추가 가능(단 서비스 코드의 `isIn` 화이트리스트에는 추가 필요) — Dev B가 새 reason이 필요하면 이 화이트리스트에 추가 요청 |
| 절대 하지 말아야 할 것 | `reward_wallets.points`를 직접 UPDATE하지 말 것(잔액 음수 방지·원장 정합성이 깨짐). 반드시 `rewardService.addPoints()`를 통할 것 |

---

## 7. API 계약

공통: 모든 엔드포인트는 `Authorization: Bearer {accessToken}` 필요(없으면 401). 자녀
스코프 엔드포인트는 전부 `childService.getById(req.user.user_id, childId)`로 소유권을
검증하며, 미소유/미존재 시 **404**(403 아님 — Week2와 동일하게 "존재 여부 자체를 숨김").
`:childId`/`child_profile_id`는 양의 정수 검증(Week2 `param('id').isInt({min:1})` 패턴
재사용). **활성 프로필 여부는 검사하지 않는다**(3절 표 참고).

### 7-1. `POST /api/attendance/check`

- Body: `{ "child_profile_id": 1 }`
- 응답(최초, 그날 첫 체크): **201**
  ```json
  { "success": true, "message": "출석이 기록되었습니다.",
    "data": { "attendanceDate": "2026-08-06", "alreadyChecked": false, "streakDays": 4, "pointsEarned": 10 } }
  ```
- 응답(같은 날 재요청, idempotent): **200**, 동일한 필드 구조에 `"alreadyChecked": true, "pointsEarned": 0`.
- 오류: 400(child_profile_id 누락/형식), 401, 404(미소유).

### 7-2. `GET /api/attendance/:childId?month=YYYY-MM`

- `month` 생략 시 오늘(Asia/Seoul) 기준 당월.
- **월간 출석률 계산**: `attendedDays / denominator * 100`(소수 1자리 반올림).
  `denominator`는 **조회 대상 월이 이미 지난 달이면 해당 월의 전체 일수, 진행 중인
  이번 달이면 오늘까지 경과 일수**(예: 8월 6일에 조회하면 분모 6) — 월 중간에 출석률이
  부당하게 낮아 보이지 않도록 하는 정책. **이 계산 방식은 기획 확인 필요(8절)**.
- 응답 **200**:
  ```json
  { "success": true,
    "data": { "childProfileId": 1, "month": "2026-08",
      "attendedDates": ["2026-08-01","2026-08-03","2026-08-06"],
      "attendedCount": 3, "denominator": 6, "attendanceRate": 50.0,
      "currentStreak": 4 } }
  ```
- 오류: 400(month 형식 오류), 401, 404.

### 7-3. `GET /api/missions`

- 자녀 비종속 — 정적 카탈로그 조회(인증은 필요, 소유권 검증 없음).
- 응답 **200**:
  ```json
  { "success": true, "data": { "missions": [
    { "missionType": "attendance", "targetCount": 1, "rewardPoints": 10 },
    { "missionType": "story_read", "targetCount": 1, "rewardPoints": 20 },
    { "missionType": "word_clicked", "targetCount": 5, "rewardPoints": 15 },
    { "missionType": "quiz_answered", "targetCount": 1, "rewardPoints": 20 }
  ] } }
  ```

### 7-4. `GET /api/missions/progress/:childId`

- 오늘자 미션 행이 없으면 **이 호출이 생성한다**(부작용 있는 GET — Week2 heartbeat와
  동일한 선례, 3-2절에 근거 명시).
- 응답 **200**:
  ```json
  { "success": true, "data": { "missionDate": "2026-08-06", "missions": [
    { "missionType": "attendance", "targetCount": 1, "progressCount": 1, "rewardPoints": 10, "status": "rewarded" },
    { "missionType": "story_read", "targetCount": 1, "progressCount": 0, "rewardPoints": 20, "status": "pending" }
  ] } }
  ```
- 오류: 400, 401, 404.

### 7-5. `GET /api/rewards/:childId`

- 응답 **200**:
  ```json
  { "success": true, "data": { "childProfileId": 1, "points": 340, "level": 3,
    "streakDays": 4, "levelProgress": { "currentLevelFloor": 300, "nextLevelAt": 600, "pointsToNextLevel": 260 } } }
  ```

### 7-6. `GET /api/rewards/:childId/summary` (MN02, 메인 화면용 경량 응답)

- 응답 **200**: `{ "success": true, "data": { "points": 340 } }` — 프론트가 "토큰"으로 라벨링.

### 7-7. `GET /api/rewards/:childId/history` (RW03)

- Query: `page`(기본 1), `limit`(기본 20, 최대 100), `reason`(선택, 필터), `from`/`to`(선택,
  YYYY-MM-DD, `created_at` 범위 필터).
- 응답 **200**:
  ```json
  { "success": true, "data": {
    "items": [
      { "points": 10, "reason": "attendance", "balanceAfter": 340, "createdAt": "2026-08-06T00:10:00.000Z",
        "metadata": { "attendanceDate": "2026-08-06" } }
    ],
    "pagination": { "page": 1, "limit": 20, "totalCount": 57, "totalPages": 3 }
  } }
  ```
- 오류: 400(page/limit 범위 오류), 401, 404.

---

## 8. 결정이 필요한 사항 (임의 구현하지 않고 남겨둠)

1. **토큰/포인트 완전 통합 여부** (0절) — 기획 확인 필요. AI 생성 비용을 별도 재화로
   과금할 계획이 있다면 지금 분리하는 것이 나중에 재화를 쪼개는 것보다 쉽다.
2. **미션 카탈로그의 정확한 target_count/reward_points 값** (2-2절) — 예시 수치일 뿐.
3. **레벨 임계값 수치** (4절) — 예시 배열일 뿐.
4. **월간 출석률 분모 정책**(진행 중인 달은 경과일 기준 vs 항상 그 달 전체 일수) — 7-2절
   권장안 확인 필요.
5. **RW02 "연속 학습일"을 출석 체크만으로 정의할지, 실제 학습 활동(동화/퀴즈)까지 반영할지**
   — 이번 설계는 출석 체크 기준(가장 단순·명확)으로 잡았으나, Dev B의 스토리/퀴즈 활동과
   연동하려면 `missionService.recordProgress`에도 streak 갱신을 연결하는 후속 설계가 필요.
6. **미션 progress_count 증가 자체의 이벤트 단위 idempotency**(5-2절 `eventId`) — 현재는
   "호출자가 이벤트당 1회 호출"을 전제로 미구현. 포인트 중복 지급 자체는 별도 메커니즘으로
   막혀 있어(mission_id 기반 idempotencyKey) 최악의 경우도 "진행도가 실제보다 살짝 빨리
   찬다" 수준의 경미한 이슈다. 필요시 경량 이벤트 로그 테이블 추가로 보강 가능.
7. **포인트 차감/환수(어뷰징 롤백) API 필요 여부** — 이번 설계 범위 밖. 필요해지면
   `reward_transactions.points`에 음수를 허용하는 정책과 `reward_wallets.points`의
   `CHECK(points>=0)` 재검토가 필요.
8. **`docs/DEVELOPMENT_PLAN.md` 수정 제안**(적용은 보류, 제안만): "합의 포인트"에 적힌
   `rewardService.addPoints(childProfileId, points, reason)`(위치 인자)를 이 문서의
   객체 인자 시그니처(`idempotencyKey`/`metadata`/`transaction` 포함)로 갱신 제안 —
   중복 지급 방지·트랜잭션 합류 요구사항을 만족하려면 확장이 필요하다고 판단.

---

## 9. 구현 순서 제안 (설계 승인 후)

DEVELOPMENT_PLAN.md의 Mon~Fri 순서를 유지하되, 서비스 의존관계상 아래 순서를 권장:

1. `reward_wallets` 모델·마이그레이션 + `rewardService.addPoints`/`checkLevelUp`
   (다른 모든 것이 이 위에 쌓임 — 먼저 확정)
2. `attendance_logs` 모델·마이그레이션 + `attendanceService.checkIn`(+ `addPoints`/
   `checkLevelUp` 연동) + `POST /attendance/check`, `GET /attendance/:childId`
3. `daily_missions` 모델·마이그레이션 + `missionService.recordProgress`(+ `addPoints`
   연동) + `GET /missions`, `GET /missions/progress/:childId`
4. `reward_transactions` 모델·마이그레이션(1과 함께 만드는 것도 가능 — `addPoints`가
   처음부터 원장을 쓰므로) + `GET /rewards/:childId`, `/summary`, `/history`
5. `missionService.recordProgress`에 `'attendance'` 이벤트 연동을 `attendanceService.checkIn`
   안에서 호출하도록 배선(2·3 완료 후)

### 테스트 계획 (Week1·2와 동일 3중 구조)

- **단위(jest, mock)**: 각 서비스의 정상/실패/동시성(직렬화 트랜잭션 mock) 케이스 —
  `guardian.service.test.js`의 잠금 동시성 테스트 패턴 재사용.
- **통합(supertest, 서비스 mock)**: 라우트 validation/소유권/상태코드 배선.
- **실DB 스모크**: 동시 출석 요청 N개 → 정확히 1개만 실질 지급, 동시 `addPoints`
  같은 idempotencyKey N개 → 잔액 1회분만 반영, 레벨업 경계값, 월간 출석률 계산 — Week2
  `week2.smoke.js`에 이어 `week3.smoke.js`로 별도 파일 제안(기존 파일 미변경 원칙 유지).

---

## 부록: 미채택 대안 요약

- 레벨: DB 테이블(옵션 C) 대신 코드 상수 채택(4절).
- 토큰/포인트: 분리 유지(대안 B) 대신 통합 채택(0절), 단 ERD와의 불일치는 명시적으로 보고.
- 미션 생성: 배치/스케줄러 대신 지연 생성 채택(3-2절).
- 트랜잭션: SAVEPOINT 기반 진짜 중첩 대신 "항상 최상위 트랜잭션에 합류" 단일 정책 채택(5-4절).
