# 📖 Magic Book - Backend Server

Magic Book 서비스의 백엔드 API 서버 저장소입니다.

## 🛠️ Tech Stack (기술 스택)
- **Runtime:** Node.js
- **Framework:** Express
- **Database:** AWS RDS (MySQL)

## 📂 폴더 구조
```
src/
  config/       # 환경 변수, DB 연결 설정
  controllers/  # 요청 처리 로직
  routes/       # 라우터
  models/       # Sequelize 모델
  middlewares/  # 공통 미들웨어 (에러 핸들러 등)
  app.js        # Express 앱 설정
  server.js     # 서버 진입점
```

## 🚀 시작하기 (How to Start)
```bash
# 의존성 라이브러리 설치
npm install

# .env 파일 생성 (.env.example 참고)
cp .env.example .env

# 개발 서버 실행 (nodemon)
npm run dev

# 프로덕션 서버 실행
npm start
```

## ✅ 상태 확인
서버 실행 후 `GET /api/health` 요청 시 `{ "status": "ok" }` 응답을 받으면 정상입니다.


# Commit Message Convention
- 형식: `{이모지} {TYPE}: [{FE/BE}] {설명} (선택 사항: #{이슈번호})`
  - 예시: `✨ FEAT: [FE] 로그인 API 연동 (#12)`

| **이모지** | **타입** | **사용 상황** |
| :---: | :--- | :--- |
| ✨ | **FEAT** | 새로운 기능 추가 |
| 🐛 | **FIX** | 버그 수정 |
| 📝 | **DOCS** | 문서 수정 (README, 노션 링크, 수행계획서 등) |
| 🎨 | **STYLE** | 코드 포맷팅, UI 디자인 수정 (로직 변경 없음) |
| ♻️ | **REFACTOR** | 코드 리팩토링 (성능 개선, 가독성 향상) |
| ✅ | **TEST** | 테스트 코드 추가 및 수정 |
| 📂 | **CHORE** | 빌드 업무, 패키지 매니저, .gitignore 수정 |
| 💬 | **COMMENT** | 주석 추가 및 변경 |
| 🌱 | **BUILD** | 빌드 관련 파일 수정 (예: Gradle) |
| ⏪ | **REVERT** | 이전 커밋 되돌리기 |