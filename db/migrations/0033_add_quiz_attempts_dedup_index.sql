-- 0033: 퀴즈 제출 중복 방지(네트워크 재시도 대응)를 위한 조회 인덱스를 추가한다.
-- submitAttempt()가 (child_profile_id, quiz_set_id, submitted_at) 범위로
-- "최근 N초 이내 동일 답안 제출 여부"를 조회하므로 이 인덱스가 필요하다.
-- Rollback:
--   DROP INDEX `idx_quiz_attempts_dedup` ON `quiz_attempts`;

DELIMITER $$

DROP PROCEDURE IF EXISTS `_migration_0033_quiz_attempts_dedup_index` $$

CREATE PROCEDURE `_migration_0033_quiz_attempts_dedup_index`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'quiz_attempts'
      AND INDEX_NAME = 'idx_quiz_attempts_dedup'
  ) THEN
    ALTER TABLE `quiz_attempts`
      ADD INDEX `idx_quiz_attempts_dedup` (`child_profile_id`, `quiz_set_id`, `submitted_at`);
  END IF;
END $$

DELIMITER ;

CALL `_migration_0033_quiz_attempts_dedup_index`();
DROP PROCEDURE IF EXISTS `_migration_0033_quiz_attempts_dedup_index`;