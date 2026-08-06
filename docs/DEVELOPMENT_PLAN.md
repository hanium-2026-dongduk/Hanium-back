# Magic Book 백엔드 개발 일정 (5주)

> 작성일: 2026-07-23 (수정: 2026-07-23)
> 프로젝트: Magic Book (어린이 AI 동화 생성 서비스)
> 백엔드 인원: 2명

---

## 요구사항 매핑

| 요구사항 ID | 기능 | 백엔드 담당 | 비고 |
|-------------|------|-------------|------|
| AU01 | 로그인 | A | ✅ 구현 완료 (JWT + refresh token) |
| AU02 | 회원가입 | A | ✅ 구현 완료 (이메일 인증 포함) |
| AU03 | ID·PW 찾기 | A | 이메일로 계정 찾기 + 비밀번호 재설정 |
| AU04 | 프로필 관리 (선택·생성·수정·삭제) | A | 자녀 프로필 CRUD + 활성 프로필 전환 |
| MN01 | 핵심 기능 위젯 (3버튼) | B | 대시보드 요약 API (동화/퀴즈/단어장 현황) |
| MN02 | 토큰 표시 | A | 토큰/포인트 잔액 조회 API |

---

## 역할 분배

| | 개발자 A (인프라 + 인증 + 보호자 + 보상) | 개발자 B (AI + 동화 + 퀴즈) |
|---|---|---|
| **테이블** | users, child_profiles, guardian_settings, reward_wallets, badges, child_badges, praise_stickers, sticker_sends, attendance_logs, daily_missions | stories, characters, story_characters, story_settings, story_pages, story_page_illustrations, story_page_tts, story_favorites, vocabulary_entries, quiz_sets, quiz_questions, quiz_options, quiz_attempts |
| **테이블 수** | 10개 | 13개 |
| **난이도** | 중 (CRUD 위주 + 인프라) | 상 (AI 파이프라인 + 복잡 트랜잭션) |
| **외부 연동** | 이메일(nodemailer), AWS | Gemini, 이미지 생성, TTS |

---

## Week 1 — 인증 완성 + AI 연동 기반

| 날짜 | 개발자 A | 개발자 B |
|------|----------|----------|
| **Mon** | `users` 모델 정의 + 회원가입 API | Gemini API 연동 모듈 (프롬프트 → 텍스트 응답) |
| **Tue** | 이메일 인증번호 발송 API (nodemailer) | 이미지 생성 API 연동 모듈 |
| **Wed** | 이메일 인증번호 검증 + 만료 로직 | TTS API 연동 모듈 |
| **Thu** | JWT 로그인/로그아웃 API + auth 미들웨어 | AI 모듈 통합 테스트 + 에러 핸들링/retry |
| **Fri** | Refresh token + bcrypt 해싱 완성 | `stories`, `story_pages` 모델 정의 |

### 산출물
- A: 회원가입 → 이메일 인증 → JWT 로그인 전체 플로우 (AU01, AU02)
- B: Gemini + 이미지 + TTS 연동 모듈 3종 완성

### 합의 포인트
- **Fri**: `users` 모델 확정 + `req.user` 인터페이스 합의

---

## Week 2 — ID/PW 찾기 + 프로필 관리 + 동화 생성 핵심

| 날짜 | 개발자 A | 개발자 B |
|------|----------|----------|
| **Mon** | `child_profiles` 모델 + 생성 API (AU04) | `characters` 모델 + 캐릭터 생성/조회 API |
| **Tue** | 자녀 프로필 조회/수정/삭제 + 활성 프로필 전환 API (AU04) | `story_characters`, `story_settings` 모델 정의 |
| **Wed** | 이메일로 계정 찾기 API + 비밀번호 재설정 API (AU03) | 동화 생성 API 구현 (키워드+캐릭터+설정 → Gemini) |
| **Thu** | `guardian_settings` 모델 + PIN 설정/검증 API | 동화 생성 API 완성 (pages + illustrations + tts 트랜잭션 저장) |
| **Fri** | 일일 사용 제한 시간 설정/조회 + 차감 미들웨어 | `story_page_illustrations`, `story_page_tts` 모델 + 동화 상세 조회 API |

### 산출물
- A: 자녀 프로필 CRUD + 프로필 전환 + ID/PW 찾기 + 보호자 PIN + 시간 제한 (AU03, AU04)
- B: 키워드 → AI 동화 생성 → 다단계 DB 저장 → 상세 조회 파이프라인

### 합의 포인트
- **Fri**: 동화 생성 응답 포맷 리뷰 (프론트와도 공유)

---

## Week 3 — 동화 부가기능 + 출석/미션/보상 + 토큰 표시

| 날짜 | 개발자 A | 개발자 B |
|------|----------|----------|
| **Mon** | `attendance_logs` 모델 + 출석 체크 API | `story_favorites` 모델 + 즐겨찾기 등록/해제 API |
| **Tue** | `daily_missions` 모델 + 미션 목록 조회 API | 동화 목록 조회 (내 책장, 페이지네이션) + 동화 삭제 API |
| **Wed** | 미션 달성 여부 판정 로직 | `vocabulary_entries` 모델 + 단어장 저장/조회/삭제 API |
| **Thu** | `reward_wallets` 모델 + 포인트 적립 서비스 + 토큰 잔액 조회 API (MN02) | `quiz_sets`, `quiz_questions`, `quiz_options` 모델 정의 |
| **Fri** | 레벨업 로직 + streak_days 갱신 | 퀴즈 자동 생성 API (동화 기반 → Gemini → 구조화 저장) |

### 산출물
- A: 출석 + 미션 + 포인트 적립 + 레벨업 + 토큰 잔액 조회 (MN02)
- B: 즐겨찾기 + 단어장 + 퀴즈 자동 생성

### 합의 포인트
- **Thu**: 포인트 적립 서비스 인터페이스 합의
  ```javascript
  rewardService.addPoints(childProfileId, points, reason)
  rewardService.checkLevelUp(childProfileId)
  ```

---

## Week 4 — 배지/스티커 + 퀴즈 채점 + 대시보드 + 배포

| 날짜 | 개발자 A | 개발자 B |
|------|----------|----------|
| **Mon** | `badges`, `child_badges` 모델 + 배지 목록/수여 API | `quiz_attempts` 모델 + 퀴즈 제출/채점 API |
| **Tue** | 배지 달성 조건 자동 판정 로직 | 퀴즈 정답 시 → `rewardService.addPoints()` 연동 |
| **Wed** | `praise_stickers`, `sticker_sends` 모델 + 스티커 발송/조회 API | 대시보드 요약 API — 동화/퀴즈/단어장 현황 (MN01) |
| **Thu** | AWS EC2 세팅 + PM2 배포 | 동화 생성 실패 케이스 핸들링 (AI timeout, 재시도) |
| **Fri** | 도메인 연결 + SSL (Let's Encrypt) + Nginx | 전체 API 응답 포맷 통일 + validation 추가 |

### 산출물
- A: 배지 + 스티커 완성 + 서버 첫 배포
- B: 퀴즈 채점 + 보상 연동 + 대시보드 API (MN01)

---

## Week 5 — CI/CD + 통합 테스트 + 안정화

| 날짜 | 개발자 A | 개발자 B |
|------|----------|----------|
| **Mon** | CI/CD (GitHub Actions → EC2 자동 배포) | 배지 트리거 연동 (퀴즈 N회 정답 → 배지 수여 요청) |
| **Tue** | API 문서화 (Swagger 전체 엔드포인트) | 미션 완료 시 자동 포인트 적립 연동 |
| **Wed** | Rate limiting + helmet + 보안 헤더 | 동화 공개/비공개 설정 + 공개 동화 탐색 API |
| **Thu** | 전체 통합 테스트 + 프론트 연동 지원 | 전체 통합 테스트 + 프론트 연동 지원 |
| **Fri** | 최종 배포 + DB 백업 자동화 + 모니터링 | E2E 시나리오 검증 + 성능 체크 |

### 산출물
- A: CI/CD + Swagger + 보안 + 프로덕션 안정화
- B: 전체 도메인 로직 연동 완성 + E2E 검증

---

## 전체 API 엔드포인트 (~45개)

### 개발자 A (~22개)

```
# 인증 (AU01, AU02)
POST   /api/auth/signup
POST   /api/auth/email/send
POST   /api/auth/email/verify
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh

# ID/PW 찾기 (AU03)
# (재설계) 요구사항 정의서 v3.0의 AU03에는 "이름으로 이메일 찾기"가 정의되어 있지 않고,
# 로그인 ID가 곧 이메일이라 별도 ID 찾기 기능 자체가 필요하지 않다. 이메일 기반
# 비밀번호 재설정 하나로 통합했다. 자세한 내용: docs/API_SPEC_AUTH.md 7절
POST   /api/auth/password/reset-request  ← 비밀번호 재설정 이메일 발송
PUT    /api/auth/password/reset      ← 비밀번호 재설정 완료
DELETE /api/auth/account

# 프로필 관리 (AU04)
POST   /api/children
GET    /api/children
GET    /api/children/:id
PUT    /api/children/:id
DELETE /api/children/:id
PATCH  /api/children/:id/activate    ← NEW: 활성 프로필 전환

# 보호자 설정
PUT    /api/guardian/pin
POST   /api/guardian/pin/verify
PUT    /api/guardian/settings

# 출석/미션
POST   /api/attendance/check
GET    /api/attendance/:childId
GET    /api/missions
GET    /api/missions/progress/:childId

# 보상/토큰 (MN02)
GET    /api/rewards/:childId         ← 토큰/포인트/레벨 전체 조회
GET    /api/rewards/:childId/summary ← NEW: 메인화면용 간단 잔액 조회

# 배지/스티커
GET    /api/badges
GET    /api/badges/:childId
POST   /api/stickers/send
GET    /api/stickers/received/:childId
```

### 개발자 B (~23개)

```
# 캐릭터
POST   /api/characters
GET    /api/characters/:childId

# 동화 생성/관리
POST   /api/stories/generate
GET    /api/stories/:childId
GET    /api/stories/:storyId/detail
DELETE /api/stories/:storyId
PUT    /api/stories/:storyId/public

# 즐겨찾기
POST   /api/stories/:storyId/favorite
DELETE /api/stories/:storyId/favorite
GET    /api/stories/favorites/:childId
GET    /api/stories/explore

# 단어장
POST   /api/vocabulary
GET    /api/vocabulary/:childId
DELETE /api/vocabulary/:id

# 퀴즈
POST   /api/quizzes/generate/:storyId
GET    /api/quizzes/:quizSetId
POST   /api/quizzes/:quizSetId/submit
GET    /api/quizzes/attempts/:childId
GET    /api/quizzes/attempts/:attemptId/detail

# 대시보드 (MN01)
GET    /api/dashboard/:childId       ← NEW: 핵심 기능 위젯용 요약 데이터
```

---

## 핵심 의존성 타임라인

```
Week 1 Fri ─── users 모델 + auth 미들웨어 확정 (AU01, AU02 완료)
                 │
Week 2 Mon ─── child_profiles 확정 (AU04) ──→ B의 모든 테이블 FK 참조 가능
                 │
Week 2 Wed ─── ID/PW 찾기 완성 (AU03)
                 │
Week 3 Thu ─── rewardService + 토큰 조회 확정 (MN02) ──→ B가 Week 4에 연동
                 │
Week 4 Tue ─── B가 rewardService.addPoints() 호출 연동
                 │
Week 4 Wed ─── 대시보드 API 완성 (MN01)
                 │
Week 5 Mon ─── B가 배지 트리거 요청 연동
```

---

## 필수 설치 패키지

| 패키지 | 담당 | 용도 |
|--------|------|------|
| `bcrypt` | A | password_hash, parent_pin_hash |
| `jsonwebtoken` | A | JWT 발급/검증 |
| `nodemailer` | A | 이메일 인증번호 + 비밀번호 재설정 메일 |
| `swagger-jsdoc` + `swagger-ui-express` | A | API 문서 |
| `helmet` | A | 보안 헤더 |
| `express-rate-limit` | A | API 속도 제한 |
| `axios` | B | 외부 AI API 호출 |
| `@aws-sdk/client-s3` | B | 이미지/오디오 S3 저장 |
| `uuid` | B | 파일명 고유값 생성 |
| `express-validator` | 공통 | request validation |

---

## 총 소요 기간

| 구분 | 기간 |
|------|------|
| 핵심 개발 | 5주 (25 작업일) |
| 버퍼 (버그 수정, 프론트 연동) | +3~5일 |
| **총합** | **약 6주** |

---

## 비고

- 하루 유효 작업 시간 4~6시간 기준
- DB 스키마(ERD)는 설계 완료 상태
- 프로젝트 초기 세팅(Express + Sequelize + MySQL) 완료 상태
- 프론트엔드와의 API 응답 포맷은 Week 2 Fri에 1차 합의 권장
- Week 1 (AU01, AU02) 구현 완료 상태 (2026-07-23 기준)
