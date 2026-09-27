-- 0032: 생성된 동화의 선택지를 보존하고 비동기 생성 작업을 DB에 기록한다.
-- Rollback:
--   DROP TABLE IF EXISTS `story_generation_jobs`;
--   ALTER TABLE `stories` DROP COLUMN `choices_json`;

DELIMITER $$

DROP PROCEDURE IF EXISTS `_migration_0032_story_choices` $$

CREATE PROCEDURE `_migration_0032_story_choices`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stories' AND COLUMN_NAME = 'choices_json'
  ) THEN
    ALTER TABLE `stories` ADD COLUMN `choices_json` JSON NULL;
  END IF;
END $$

DELIMITER ;

CALL `_migration_0032_story_choices`();
DROP PROCEDURE IF EXISTS `_migration_0032_story_choices`;

CREATE TABLE IF NOT EXISTS `story_generation_jobs` (
  `job_id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `child_profile_id` BIGINT NOT NULL,
  `request_id` VARCHAR(100) NOT NULL,
  `request_hash` CHAR(64) NOT NULL,
  `input_json` JSON NOT NULL,
  `status` ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  `claim_token` CHAR(36) NULL,
  `lease_until` DATETIME NULL,
  `attempt_count` INT NOT NULL DEFAULT 0,
  `story_id` BIGINT NULL,
  `error_message` VARCHAR(255) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`job_id`),
  UNIQUE KEY `uq_story_generation_user_request` (`user_id`, `request_id`),
  KEY `idx_story_generation_claim` (`status`, `lease_until`, `created_at`),
  KEY `idx_story_generation_child` (`child_profile_id`),
  KEY `idx_story_generation_story` (`story_id`),
  CONSTRAINT `fk_story_generation_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_story_generation_child` FOREIGN KEY (`child_profile_id`) REFERENCES `child_profiles` (`child_profile_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_story_generation_story` FOREIGN KEY (`story_id`) REFERENCES `stories` (`story_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
