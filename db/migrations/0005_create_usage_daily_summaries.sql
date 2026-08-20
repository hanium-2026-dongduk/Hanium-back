-- 0005_create_usage_daily_summaries.sql
--
-- 자녀 프로필별 "하루(Asia/Seoul 캘린더 기준) 누적 사용 시간" 집계 테이블.
-- src/models/usageDailySummary.model.js에 대응. heartbeat(POST /api/usage/heartbeat)마다
-- 서버가 계산한 경과 시간만큼만 누적되며, UNIQUE(child_profile_id, usage_date)로
-- 자녀/날짜별 행이 정확히 하나만 존재하도록 보장한다. child_profiles가 삭제되면
-- 해당 자녀의 사용 이력도 함께 삭제한다(ON DELETE CASCADE).
--
-- Rollback:
--   DROP TABLE IF EXISTS `usage_daily_summaries`;

CREATE TABLE IF NOT EXISTS `usage_daily_summaries` (
  `usage_summary_id` BIGINT NOT NULL AUTO_INCREMENT,
  `child_profile_id` BIGINT NOT NULL,
  `usage_date` DATE NOT NULL,
  `accumulated_seconds` INT NOT NULL DEFAULT 0,
  `last_heartbeat_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`usage_summary_id`),
  UNIQUE KEY `uq_usage_daily_summaries_child_date` (`child_profile_id`, `usage_date`),
  CONSTRAINT `fk_usage_daily_summaries_child_profile`
    FOREIGN KEY (`child_profile_id`) REFERENCES `child_profiles` (`child_profile_id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
