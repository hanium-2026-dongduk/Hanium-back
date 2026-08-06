-- 0002_add_purpose_to_email_verifications.sql
--
-- email_verifications에 purpose 컬럼을 추가해 "회원가입 인증"과 "비밀번호 재설정 인증"이
-- 서로 다른 흐름임을 DB 레벨에서도 구분한다. src/models/emailVerification.model.js의
-- `purpose` 필드에 대응한다. 기존 행은 전부 회원가입 인증이었으므로 기본값 'signup'을 준다
-- (기존 데이터가 있는 DB에도 안전하게 적용 가능).
--
-- Rollback:
--   ALTER TABLE `email_verifications` DROP INDEX `idx_email_verifications_email_purpose`;
--   ALTER TABLE `email_verifications` DROP COLUMN `purpose`;

DELIMITER $$

DROP PROCEDURE IF EXISTS `_migration_0002_add_purpose_column` $$

CREATE PROCEDURE `_migration_0002_add_purpose_column`()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'email_verifications'
      AND COLUMN_NAME = 'purpose'
  ) THEN
    ALTER TABLE `email_verifications`
      ADD COLUMN `purpose` VARCHAR(20) NOT NULL DEFAULT 'signup' AFTER `code`;
  END IF;
END $$

DELIMITER ;

CALL `_migration_0002_add_purpose_column`();

DROP PROCEDURE IF EXISTS `_migration_0002_add_purpose_column`;

DELIMITER $$

DROP PROCEDURE IF EXISTS `_migration_0002_add_purpose_index` $$

CREATE PROCEDURE `_migration_0002_add_purpose_index`()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'email_verifications'
      AND INDEX_NAME = 'idx_email_verifications_email_purpose'
  ) THEN
    ALTER TABLE `email_verifications`
      ADD INDEX `idx_email_verifications_email_purpose` (`email`, `purpose`, `is_verified`);
  END IF;
END $$

DELIMITER ;

CALL `_migration_0002_add_purpose_index`();

DROP PROCEDURE IF EXISTS `_migration_0002_add_purpose_index`;
