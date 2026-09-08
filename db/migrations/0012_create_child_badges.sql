-- 0012_create_child_badges.sql
--
-- 자녀가 획득한 배지 (RW04_ACH_02, MP02_RWD_03). src/models/childBadge.model.js에 대응.
--
-- 배지 "종류"(이름·설명·조건)는 DB 테이블이 아니라 src/config/badgeCatalog.js의 코드
-- 상수다 — 레벨 임계값(levelThresholds.js)·미션 카탈로그(missionCatalog.js)와 같은 논리로,
-- 배지를 런타임에 조정할 관리자 UI가 없는 단계에서는 테이블+시드 데이터를 늘리는 것보다
-- 리뷰 가능한 PR로 관리하는 편이 낫다고 판단했다(docs/WEEK3_A_DESIGN.md 4절).
-- 조건 판정은 어차피 코드로 해야 하므로, 조건만 테이블에 두면 로직과 데이터가 갈라진다.
--
-- 그래서 `badge_code`는 badges 테이블을 가리키는 FK가 아니라 VARCHAR이며, 유효한 코드인지는
-- 애플리케이션(모델의 isIn)에서 검증한다. daily_missions.mission_type과 동일한 컨벤션이다.
--
-- UNIQUE(child_profile_id, badge_code) — 같은 배지를 두 번 받을 수 없다. 배지 판정이
-- 출석 체크·미션 보상 등 여러 경로에서 동시에 돌아도 이 제약이 중복 수여를 막는다.
-- (reward_transactions의 idempotency_key와 같은 역할)
--
-- 신규 테이블이라 기존 데이터 마이그레이션 이슈는 없다.
--
-- Rollback:
--   DROP TABLE IF EXISTS `child_badges`;

CREATE TABLE IF NOT EXISTS `child_badges` (
  `child_badge_id` BIGINT NOT NULL AUTO_INCREMENT,
  `child_profile_id` BIGINT NOT NULL,
  `badge_code` VARCHAR(40) NOT NULL,
  `awarded_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`child_badge_id`),
  UNIQUE KEY `uq_child_badges_child_code` (`child_profile_id`, `badge_code`),
  CONSTRAINT `fk_child_badges_child_profile`
    FOREIGN KEY (`child_profile_id`) REFERENCES `child_profiles` (`child_profile_id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
