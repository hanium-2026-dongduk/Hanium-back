-- 0010_create_reward_wallets.sql
--
-- 자녀별 포인트 지갑(현재 잔액/레벨/연속출석일). src/models/rewardWallet.model.js에 대응.
--
-- 토큰(MN02)과 포인트(MP02)를 `points` 하나의 재화로 통합한 설계다
-- (docs/WEEK3_A_DESIGN.md 0절) — 프론트가 화면에 따라 라벨만 다르게 붙인다. ERD의
-- reward_wallets에는 point_balance/token_balance가 분리돼 있었으나, 요구사항에 토큰을
-- 소모한다는 정의가 없어 통합했다. 나중에 소모형 토큰이 필요해지면 `tokens` 컬럼을
-- 추가하는 순수 add 마이그레이션으로 되돌릴 수 있다.
--
-- UNIQUE(child_profile_id) — 자녀당 지갑은 정확히 하나. 지갑은 child_profiles 생성 시가
-- 아니라 rewardService가 최초 접근 시 지연 생성하므로, 동시 최초 접근 시 이 제약이
-- 중복 생성을 막고 실패한 쪽은 재조회로 같은 행에 합류한다.
--
-- CHECK (points >= 0) — MySQL 8.0.16+는 CHECK를 실제로 강제한다. 애플리케이션도
-- addPoints에서 양수만 가산하지만, 잔액이 음수가 되는 상태를 DB에서도 막는 안전망.
--
-- 신규 테이블이라 기존 데이터 마이그레이션 이슈는 없다.
--
-- Rollback:
--   DROP TABLE IF EXISTS `reward_wallets`;

CREATE TABLE IF NOT EXISTS `reward_wallets` (
  `wallet_id` BIGINT NOT NULL AUTO_INCREMENT,
  `child_profile_id` BIGINT NOT NULL,
  `points` INT NOT NULL DEFAULT 0,
  `level` INT NOT NULL DEFAULT 1,
  `streak_days` INT NOT NULL DEFAULT 0,
  `last_activity_date` DATE NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`wallet_id`),
  UNIQUE KEY `uq_reward_wallets_child` (`child_profile_id`),
  CONSTRAINT `chk_reward_wallets_points_non_negative` CHECK (`points` >= 0),
  CONSTRAINT `fk_reward_wallets_child_profile`
    FOREIGN KEY (`child_profile_id`) REFERENCES `child_profiles` (`child_profile_id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
