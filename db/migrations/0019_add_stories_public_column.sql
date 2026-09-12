DELIMITER $$

DROP PROCEDURE IF EXISTS `_migration_0019_add_is_public` $$

CREATE PROCEDURE `_migration_0019_add_is_public`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stories' AND COLUMN_NAME = 'is_public'
  ) THEN
    ALTER TABLE `stories` ADD COLUMN `is_public` BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$

DELIMITER ;

CALL `_migration_0019_add_is_public`();
DROP PROCEDURE IF EXISTS `_migration_0019_add_is_public`;

-- Rollback: ALTER TABLE `stories` DROP COLUMN `is_public`;