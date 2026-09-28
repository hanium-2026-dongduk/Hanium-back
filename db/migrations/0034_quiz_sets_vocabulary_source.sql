-- 0034: 퀴즈를 스토리 없이(단어장 기반)도 생성할 수 있도록 quiz_sets를 확장한다.
-- source_type='vocabulary'인 경우 story_id가 없을 수 있어 nullable로 바꾸고,
-- 소유권 확인이 story JOIN에 의존하지 않도록 child_profile_id를 직접 둔다.
-- DB 레벨 NOT NULL은 걸지 않고 애플리케이션(quizGeneration.service.js)에서 생성 시점에
-- 항상 채워 넣는다(story 기반/단어장 기반 둘 다).
-- Rollback:
--   ALTER TABLE `quiz_sets` DROP FOREIGN KEY `fk_quiz_set_child`;
--   ALTER TABLE `quiz_sets` DROP INDEX `idx_quiz_sets_child_source`;
--   ALTER TABLE `quiz_sets` DROP COLUMN `child_profile_id`;
--   ALTER TABLE `quiz_sets` MODIFY COLUMN `story_id` BIGINT NOT NULL;

DELIMITER $$

DROP PROCEDURE IF EXISTS `_migration_0034_quiz_sets_vocab_source` $$

CREATE PROCEDURE `_migration_0034_quiz_sets_vocab_source`()
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quiz_sets'
      AND COLUMN_NAME = 'story_id' AND IS_NULLABLE = 'NO'
  ) THEN
    ALTER TABLE `quiz_sets` MODIFY COLUMN `story_id` BIGINT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quiz_sets' AND COLUMN_NAME = 'child_profile_id'
  ) THEN
    ALTER TABLE `quiz_sets` ADD COLUMN `child_profile_id` BIGINT NULL AFTER `story_id`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quiz_sets' AND INDEX_NAME = 'idx_quiz_sets_child_source'
  ) THEN
    ALTER TABLE `quiz_sets` ADD INDEX `idx_quiz_sets_child_source` (`child_profile_id`, `source_type`);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quiz_sets' AND CONSTRAINT_NAME = 'fk_quiz_set_child'
  ) THEN
    ALTER TABLE `quiz_sets`
      ADD CONSTRAINT `fk_quiz_set_child` FOREIGN KEY (`child_profile_id`) REFERENCES `child_profiles`(`child_profile_id`) ON DELETE CASCADE;
  END IF;
END $$

DELIMITER ;

CALL `_migration_0034_quiz_sets_vocab_source`();
DROP PROCEDURE IF EXISTS `_migration_0034_quiz_sets_vocab_source`;

-- 기존(story 기반) 행 백필: story_id는 있는데 child_profile_id가 비어있는 경우만.
UPDATE `quiz_sets` qs
  JOIN `stories` s ON s.story_id = qs.story_id
   SET qs.child_profile_id = s.child_profile_id
 WHERE qs.child_profile_id IS NULL AND qs.story_id IS NOT NULL;