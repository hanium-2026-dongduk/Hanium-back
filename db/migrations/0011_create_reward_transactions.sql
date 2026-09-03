-- 0011_create_reward_transactions.sql
--
-- 포인트 지급 원장. src/models/rewardTransaction.model.js에 대응.
--
-- reward_wallets는 "현재 잔액" 하나만 들고 있어서 (1) RW03의 날짜/유형별 획득 이력 조회도,
-- (2) "이 보상 이벤트를 이미 처리했는가"의 판단도 불가능하다. 이 테이블이 둘 다 담당한다.
--
-- UNIQUE(child_profile_id, idempotency_key) — 중복 지급 방지의 실제 강제 지점.
--   애플리케이션은 지갑 행을 잠근 뒤 키 존재를 먼저 확인하지만, 그 확인과 INSERT 사이의
--   경쟁(TOCTOU)까지 막는 최후 안전망이 이 제약이다.
-- INDEX(child_profile_id, created_at) — GET /rewards/:childId/history의 날짜 역순
--   페이지네이션 조회용.
--
-- balance_after는 이 거래 직후의 잔액 스냅샷이다. 이력 전체를 재계산하지 않고도 특정
-- 시점의 잔액을 조회할 수 있게 한다.
--
-- 원장이므로 생성 후 수정·삭제하지 않는다(updated_at 없음).
-- points에 CHECK(points > 0) — 이번 설계는 지급만 다룬다. 차감/환수가 필요해지면 이
-- 제약과 reward_wallets의 CHECK(points>=0)를 함께 재검토해야 한다.
--
-- 신규 테이블이라 기존 데이터 마이그레이션 이슈는 없다.
--
-- Rollback:
--   DROP TABLE IF EXISTS `reward_transactions`;

CREATE TABLE IF NOT EXISTS `reward_transactions` (
  `reward_transaction_id` BIGINT NOT NULL AUTO_INCREMENT,
  `child_profile_id` BIGINT NOT NULL,
  `points` INT NOT NULL,
  `reason` VARCHAR(50) NOT NULL,
  `idempotency_key` VARCHAR(150) NOT NULL,
  `balance_after` INT NOT NULL,
  `metadata` JSON NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`reward_transaction_id`),
  UNIQUE KEY `uq_reward_transactions_child_idem` (`child_profile_id`, `idempotency_key`),
  KEY `ix_reward_transactions_child_created` (`child_profile_id`, `created_at`),
  CONSTRAINT `chk_reward_transactions_points_positive` CHECK (`points` > 0),
  CONSTRAINT `fk_reward_transactions_child_profile`
    FOREIGN KEY (`child_profile_id`) REFERENCES `child_profiles` (`child_profile_id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
