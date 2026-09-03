# 인증 플로우 스모크 테스트 (실제 MySQL 대상)

`npm test`(Jest)는 전부 목(mock) 기반이라 DB 없이도 빠르게 돈다. 반면 이 스크립트들은
**실제 MySQL**에 연결해 서비스 전체(라우트 → 컨트롤러 → 서비스 → 실제 쿼리)를 end-to-end로
검증한다. 이메일 발송만 스텁으로 대체하고(실제 메일은 보내지 않음), 나머지는 전부 실제
코드 경로를 탄다.

네 개의 스크립트가 있다:

| 스크립트 | 대상 | 확인하는 것 |
|----------|------|--------------|
| `npm run smoke` (`auth.smoke.js`) | Week 1 (회원가입/로그인/refresh) | 회원가입 → 이메일 인증 → 로그인 → refresh(rotation) → 동시 refresh 요청 |
| `npm run smoke:week2` (`week2.smoke.js`) | Week 2 (자녀 프로필/AU03/PIN/사용시간) | 소유권 검증, 활성 프로필 단일성(동시성 포함), 비밀번호 재설정 purpose 분리/재사용 차단/refresh 폐기, PIN 잠금/hash 비노출, heartbeat 누적·한도·헤더조작무시·날짜롤오버·동시성 |
| `npm run smoke:week3` (`week3.smoke.js`) | Week 3 (출석/미션/리워드) | 출석 멱등성·동시성, 연속 출석일 계산과 마일스톤 보너스, 미션 지연 생성(동시 요청 포함), 완료 미션 재지급 차단, 멱등키 기반 중복 지급 차단, 레벨 자동 산정, 이력 페이지네이션/필터, 소유권 격리, 프로필 삭제 시 CASCADE |
| `npm run smoke:migration` (`migration.smoke.js`) | `db/migrations/*.sql` | 구버전 스키마에 마이그레이션이 실제로 안전하게 적용되는지, idempotent한지, FK가 실제로 CASCADE/RESTRICT대로 동작하는지 |

## 실행 방법

스모크 테스트 전용의 **빈 데이터베이스**를 준비한 뒤 실행한다.

```bash
DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=hanium_smoke DB_USER=root DB_PASSWORD= npm run smoke
DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=hanium_smoke DB_USER=root DB_PASSWORD= npm run smoke:week2
DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=hanium_smoke DB_USER=root DB_PASSWORD= npm run smoke:week3
# migration.smoke.js는 DB_NAME을 스스로 'hanium_migration_check'로 고정해서 쓴다(위 DB_NAME과 무관)
DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD= npm run smoke:migration
```

## 주의

- 지정한 `DB_NAME`에 대해 `sequelize.sync({ force: true })`를 실행해 **테이블을 전부 지우고 새로
  만든다.** 절대 개발/운영 DB를 가리키게 하지 말고, 이 테스트만을 위한 빈 DB(또는 매번 새로 만드는
  임시 DB)를 사용해야 한다.
- **이 프로젝트의 실제 DB는 AWS RDS(팀원이 구축, 공유 인스턴스)다. 이 스크립트를 RDS에 대고
  실행하지 말 것.** 스모크 테스트는 항상 로컬에서 그때그때 띄우고 버리는 일회용 MySQL(Docker
  컨테이너 또는 포터블 바이너리)만 대상으로 한다.
- Week 2(자녀 프로필 등) 테이블도 `sync()` 대상에 포함되므로 해당 모델에 정의된 스키마 그대로
  생성된다. 이 스크립트는 그 로직을 수정하지 않고 배선(인증 미들웨어 통과 여부)만 확인한다.
- CI에 아직 통합되어 있지 않다. 로컬에 MySQL이 없다면 아래처럼 Docker로 즉석에서 띄우거나(권장),
  `db/migrations/README.md`를 참고해 포터블 MySQL 바이너리로 직접 띄울 수 있다.

  ```bash
  docker run --rm -e MYSQL_ALLOW_EMPTY_PASSWORD=yes -p 3306:3306 --name hanium-smoke-db mysql:8
  # (다른 터미널에서) 준비되면
  DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=hanium_smoke DB_USER=root DB_PASSWORD= npm run smoke
  # 끝나면
  docker stop hanium-smoke-db
  ```
