# DB Migrations

이 저장소는 아직 Sequelize CLI 같은 마이그레이션 러너를 사용하지 않습니다.
스키마를 변경할 때는 다음 규칙을 따릅니다.

1. 이 디렉터리에 `NNNN_설명.sql` 형식의 파일을 순번대로 추가한다. (예: `0001_...`, `0002_...`)
2. 각 SQL은 이미 적용된 환경에서 다시 실행해도 안전하도록 가능한 한 `IF NOT EXISTS` 등 방어 구문을 사용한다.
3. 로컬/개발 DB, 배포 서버 모두 같은 순서로 이 디렉터리의 SQL을 적용해 스키마를 동기화한다. 두 가지 방법이 있다:
   - **권장**: `npm run migrate` — `db/migrations/run.js`가 `.env`(또는 환경변수)의 DB 접속 정보로
     이 디렉터리의 `NNNN_*.sql` 파일을 파일명 순서대로 자동 적용한다.
   - 수동: `mysql` CLI가 설치되어 있다면 파일을 순서대로 직접 적용해도 된다.
     ```bash
     mysql -u <user> -p <database> < db/migrations/0001_add_attempts_to_email_verifications.sql
     ```
4. Sequelize 모델(`src/models/*.model.js`)의 컬럼 정의를 바꿀 때는 반드시 대응하는 마이그레이션 SQL을 이 디렉터리에 함께 추가한다.
   **관계(FK)를 정의할 때는 `onDelete`뿐 아니라 `onUpdate`도 명시한다** — Sequelize의 기본값이
   `CASCADE`라, 빼먹으면 `sync()`가 만드는 스키마와 마이그레이션이 만드는 스키마가 달라진다.
   개발 환경에서만 터지고 배포 환경에서는 안 보이는 종류의 어긋남이 되므로 찾기 어렵다.
   (실제로 `child_profiles.user_id`에서 이 문제가 있었다 — 0003 주석 참고)
   (모델만 바꾸고 실제 DB에 반영하지 않으면 배포 환경에서 컬럼 불일치로 쿼리가 실패한다.)
5. 각 마이그레이션 파일 상단에는 `-- Rollback:` 주석으로 되돌리는 SQL을 함께 남긴다. 자동 롤백 러너는 없으므로
   필요 시 해당 SQL을 수동으로 실행한다. **반드시 최신 파일부터 역순으로** 롤백해야 한다.

## 적용된 마이그레이션 (적용 순서)

| 파일 | 설명 | 비고 |
|------|------|------|
| `0001_add_attempts_to_email_verifications.sql` | `email_verifications.attempts` 컬럼 추가 (이메일 인증번호 무차별 대입 방지용 시도 횟수 카운터) | |
| `0002_add_purpose_to_email_verifications.sql` | `email_verifications.purpose` 컬럼 추가 (`signup`/`password_reset` 구분) + 조회용 인덱스 | 회원가입 인증코드와 비밀번호 재설정 인증코드가 교차 사용되지 않도록 분리 |
| `0003_child_profiles_single_active_constraint.sql` | 활성 프로필 중복 데이터 정리 UPDATE + `active_owner_id` 생성 컬럼 + UNIQUE 인덱스 | 유저당 활성(is_active) 자녀 프로필이 DB 레벨에서도 최대 1개로 강제됨. **MySQL 8.0+ 필요**(ROW_NUMBER() 사용) |
| `0004_guardian_settings_pin_lockout.sql` | `guardian_settings.pin_failed_attempts`, `pin_locked_until` 컬럼 추가 | 보호자 PIN 연속 오답 잠금용 |
| `0005_create_usage_daily_summaries.sql` | `usage_daily_summaries` 테이블 신규 생성 (자녀별 일일 사용 시간 서버 집계) | `child_profiles` FK, `ON DELETE CASCADE` |
| `0006_add_missing_user_foreign_keys.sql` | `child_profiles`/`guardian_settings`/`refresh_tokens`의 `user_id → users.user_id` FK 누락 시 추가 | 기존 DB에 orphan 행이 있으면 실패할 수 있음(의도된 동작, 아래 참고) |
| `0007_guardian_pin_version_and_reauth_lockout.sql` | `guardian_settings.pin_version`, `reauth_failed_attempts`, `reauth_locked_until` 컬럼 추가 | PIN 변경 시 기존 guardianToken 즉시 무효화 + 비밀번호 재인증(POST /guardian/reauth) DB 기반 잠금 |
| `0008_create_attendance_logs.sql` | `attendance_logs` 테이블 신규 생성 (자녀별 일일 출석) | `UNIQUE(child_profile_id, attendance_date)`로 하루 1회 강제. `child_profiles` FK, `ON DELETE CASCADE` |
| `0009_create_daily_missions.sql` | `daily_missions` 테이블 신규 생성 (자녀별 하루치 데일리 미션 진행 상태) | `UNIQUE(child_profile_id, mission_date, mission_type)`. 스케줄러 없이 지연 생성 |
| `0010_create_reward_wallets.sql` | `reward_wallets` 테이블 신규 생성 (포인트 잔액/레벨/연속출석일) | `UNIQUE(child_profile_id)` + `CHECK(points >= 0)`. **MySQL 8.0.16+ 필요**(CHECK 강제) |
| `0011_create_reward_transactions.sql` | `reward_transactions` 테이블 신규 생성 (포인트 지급 원장) | `UNIQUE(child_profile_id, idempotency_key)`로 중복 지급 차단 + `CHECK(points > 0)` |

## 적용 시 주의사항

- **0003**: 이전 버전 코드는 프로필 생성 시 항상 `is_active=true`로 만들어, 한 유저가 활성 프로필을 2개
  이상 가진 상태가 이미 존재할 수 있다. 이 마이그레이션은 UNIQUE 인덱스를 걸기 전에 그런 유저의
  프로필 중 가장 최근 생성된 것만 남기고 나머지를 비활성화하는 정리 UPDATE를 자동으로 먼저 실행한다.
- **0008~0011**: 전부 신규 테이블 생성이라 기존 데이터에 대한 변환이 없고, `CREATE TABLE IF NOT EXISTS`만으로
  재실행 안전하다. 다만 **0010은 MySQL 8.0.16 미만에서는 `CHECK` 제약이 무시된다**(문법 오류는 나지 않고
  조용히 파싱만 됨) — 그 경우 잔액 음수 방지는 애플리케이션(`rewardService.addPoints`)만이 담당하게 된다.
- **0006**: `users`에 존재하지 않는 `user_id`를 참조하는 행(orphan)이 있으면 FK 추가가 실패한다.
  이는 의도된 동작이다 — 데이터 정합성 문제를 조용히 덮지 않고 표면화한다. 실패 시
  `information_schema`로 orphan 행을 먼저 찾아 정리한 뒤 재실행한다.
- 모든 마이그레이션은 재실행해도 안전하다(idempotent) — 이미 적용된 환경에서 `npm run migrate`를
  다시 실행해도 오류 없이 통과한다.

## 검증 방법

`tests/smoke/migration.smoke.js`가 이 디렉터리의 마이그레이션을 실제 MySQL에 적용하는 것을 검증한다:
가상의 "Week 1까지의" 구버전 스키마를 만든 뒤 `db/migrations/run.js`로 0002~0007을 적용하고,
`information_schema`로 결과 컬럼/인덱스/제약이 기대대로 생겼는지 확인하고, 다시 한 번 실행해
idempotent함을 확인한다.
