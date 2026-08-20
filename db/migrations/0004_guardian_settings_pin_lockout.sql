-- 0004_guardian_settings_pin_lockout.sql
--
-- 보호자 PIN 연속 오답 시 잠금 처리를 위한 컬럼 추가.
-- src/models/guardianSetting.model.js의 pin_failed_attempts / pin_locked_until 필드에 대응한다.
--
-- Rollback:
--   ALTER TABLE `guardian_settings` DROP COLUMN `pin_failed_attempts`;
--   ALTER TABLE `guardian_settings` DROP COLUMN `pin_locked_until`;

DELIMITER $$

DROP PROCEDURE IF EXISTS `_migration_0004_pin_lockout` $$

CREATE PROCEDURE `_migration_0004_pin_lockout`()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'guardian_settings'
      AND COLUMN_NAME = 'pin_failed_attempts'
  ) THEN
    ALTER TABLE `guardian_settings`
      ADD COLUMN `pin_failed_attempts` INT NOT NULL DEFAULT 0 AFTER `parent_pin_hash`;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'guardian_settings'
      AND COLUMN_NAME = 'pin_locked_until'
  ) THEN
    ALTER TABLE `guardian_settings`
      ADD COLUMN `pin_locked_until` DATETIME NULL AFTER `pin_failed_attempts`;
  END IF;
END $$

DELIMITER ;

CALL `_migration_0004_pin_lockout`();

DROP PROCEDURE IF EXISTS `_migration_0004_pin_lockout`;
