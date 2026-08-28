-- 0009_create_daily_missions.sql
--
-- 자녀별 하루치 데일리 미션 진행 상태 테이블. src/models/dailyMission.model.js에 대응.
-- 스케줄러가 없는 저장소라 미션 행은 그날 첫 접근 시점에 지연 생성된다
-- (docs/WEEK3_A_DESIGN.md 3-2절). UNIQUE(child_profile_id, mission_date, mission_type)가
-- 그 지연 생성이 동시에 일어나도 자녀/날짜/타입당 정확히 1행만 남도록 보장하며,
-- 중복 보상 지급의 근본 방어선이기도 하다.
--
-- mission_type/status는 ENUM 대신 VARCHAR + 애플리케이션 검증(Sequelize isIn)을 쓴다 —
-- 미션 종류나 상태 값이 추가돼도 ENUM 변경 마이그레이션이 필요 없게 하기 위함
-- (learning_level, email_verifications.purpose와 동일 컨벤션).
--
-- target_count/reward_points는 생성 시점의 카탈로그 값을 복사해 저장한다. 카탈로그
-- 수치를 나중에 조정해도 이미 진행 중인 미션의 목표·보상이 소급 변경되지 않게 하기 위함.
--
-- 신규 테이블이라 기존 데이터 마이그레이션 이슈는 없다.
--
-- Rollback:
--   DROP TABLE IF EXISTS `daily_missions`;

CREATE TABLE IF NOT EXISTS `daily_missions` (
  `daily_mission_id` BIGINT NOT NULL AUTO_INCREMENT,
  `child_profile_id` BIGINT NOT NULL,
  `mission_date` DATE NOT NULL,
  `mission_type` VARCHAR(30) NOT NULL,
  `target_count` INT NOT NULL,
  `progress_count` INT NOT NULL DEFAULT 0,
  `reward_points` INT NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `completed_at` DATETIME NULL,
  `rewarded_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`daily_mission_id`),
  UNIQUE KEY `uq_daily_missions_child_date_type` (`child_profile_id`, `mission_date`, `mission_type`),
  CONSTRAINT `fk_daily_missions_child_profile`
    FOREIGN KEY (`child_profile_id`) REFERENCES `child_profiles` (`child_profile_id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
