-- 기존 캐릭터에는 소유자 정보가 없으므로 NULL로 남긴다. 공용 PRESET만 계속 노출하고,
-- 기존 CUSTOM/RANDOM은 소유자를 확인해 별도로 배정하기 전까지 API에서 숨긴다.
-- Rollback:
--   ALTER TABLE `characters` DROP FOREIGN KEY `fk_characters_child_profile`;
--   ALTER TABLE `characters` DROP INDEX `idx_characters_child_profile`;
--   ALTER TABLE `characters` DROP COLUMN `child_profile_id`;

DELIMITER $$

DROP PROCEDURE IF EXISTS `_migration_0031_scope_characters` $$

CREATE PROCEDURE `_migration_0031_scope_characters`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'characters' AND COLUMN_NAME = 'child_profile_id'
  ) THEN
    ALTER TABLE `characters` ADD COLUMN `child_profile_id` BIGINT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'characters' AND INDEX_NAME = 'idx_characters_child_profile'
  ) THEN
    ALTER TABLE `characters` ADD INDEX `idx_characters_child_profile` (`child_profile_id`);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'characters'
      AND COLUMN_NAME = 'child_profile_id' AND REFERENCED_TABLE_NAME = 'child_profiles'
  ) THEN
    ALTER TABLE `characters`
      ADD CONSTRAINT `fk_characters_child_profile`
      FOREIGN KEY (`child_profile_id`) REFERENCES `child_profiles` (`child_profile_id`)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$

DELIMITER ;

CALL `_migration_0031_scope_characters`();
DROP PROCEDURE IF EXISTS `_migration_0031_scope_characters`;
