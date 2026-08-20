-- 0001_add_attempts_to_email_verifications.sql
--
-- 이메일 인증번호(email_verifications) 무차별 대입 방지를 위한 시도 횟수 카운터 추가.
-- src/models/emailVerification.model.js 의 `attempts` 필드에 대응한다.
--
-- MySQL 8.0.29 미만에서도 안전하게 재실행할 수 있도록 information_schema로
-- 컬럼 존재 여부를 확인한 뒤에만 ALTER TABLE을 실행한다.

DELIMITER $$

DROP PROCEDURE IF EXISTS `_migration_0001_add_attempts` $$

CREATE PROCEDURE `_migration_0001_add_attempts`()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'email_verifications'
      AND COLUMN_NAME = 'attempts'
  ) THEN
    ALTER TABLE `email_verifications`
      ADD COLUMN `attempts` INT NOT NULL DEFAULT 0 AFTER `code`;
  END IF;
END $$

DELIMITER ;

CALL `_migration_0001_add_attempts`();

DROP PROCEDURE IF EXISTS `_migration_0001_add_attempts`;
