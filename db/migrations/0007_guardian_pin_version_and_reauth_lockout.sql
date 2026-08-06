-- 0007_guardian_pin_version_and_reauth_lockout.sql
--
-- 2차 보안 리뷰 반영:
--   1) guardian_settings.pin_version — PIN이 설정/변경될 때마다 증가하는 값. 발급된
--      guardianToken(JWT)에 발급 시점의 pin_version을 함께 실어두고, 이후 그 토큰을
--      쓸 때 DB의 현재 값과 비교한다. stateless JWT인 guardianToken을 PIN 변경 시점에
--      즉시 무효화하기 위한 장치(그렇지 않으면 최대 10분간 옛 PIN 기준으로 발급된
--      토큰이 계속 유효했다).
--   2) guardian_settings.reauth_failed_attempts / reauth_locked_until — 계정 비밀번호
--      재인증 전용 엔드포인트(POST /api/guardian/reauth)의 DB 기반 실패 횟수/잠금.
--      메모리 Map이 아니라 DB에 저장해 프로세스 재시작/다중 인스턴스에서도 잠금이
--      유지되도록 한다. src/models/guardianSetting.model.js에 대응.
--
-- Rollback:
--   ALTER TABLE `guardian_settings` DROP COLUMN `pin_version`;
--   ALTER TABLE `guardian_settings` DROP COLUMN `reauth_failed_attempts`;
--   ALTER TABLE `guardian_settings` DROP COLUMN `reauth_locked_until`;

DELIMITER $$

DROP PROCEDURE IF EXISTS `_migration_0007_guardian_columns` $$

CREATE PROCEDURE `_migration_0007_guardian_columns`()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'guardian_settings'
      AND COLUMN_NAME = 'pin_version'
  ) THEN
    ALTER TABLE `guardian_settings`
      ADD COLUMN `pin_version` INT NOT NULL DEFAULT 0 AFTER `pin_locked_until`;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'guardian_settings'
      AND COLUMN_NAME = 'reauth_failed_attempts'
  ) THEN
    ALTER TABLE `guardian_settings`
      ADD COLUMN `reauth_failed_attempts` INT NOT NULL DEFAULT 0 AFTER `pin_version`;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'guardian_settings'
      AND COLUMN_NAME = 'reauth_locked_until'
  ) THEN
    ALTER TABLE `guardian_settings`
      ADD COLUMN `reauth_locked_until` DATETIME NULL AFTER `reauth_failed_attempts`;
  END IF;
END $$

DELIMITER ;

CALL `_migration_0007_guardian_columns`();

DROP PROCEDURE IF EXISTS `_migration_0007_guardian_columns`;
