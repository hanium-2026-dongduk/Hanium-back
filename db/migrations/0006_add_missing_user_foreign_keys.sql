-- 0006_add_missing_user_foreign_keys.sql
--
-- child_profiles / guardian_settings / refresh_tokens는 Sequelize 연관관계
-- (hasMany/hasOne, onDelete:'CASCADE')로는 선언돼 있지만, 이 저장소에는 테이블을 처음
-- 만든 초기 세팅 스크립트가 커밋되어 있지 않아 실제 DB에 FK 제약이 걸려 있는지
-- 보장할 수 없었다. 정합성 점검 차원에서 누락된 경우에만 추가한다.
--
-- 주의 1: users에 존재하지 않는 user_id를 참조하는 orphan 행이 이미 있다면(정상적인
-- 흐름에서는 발생하지 않지만, 수동으로 데이터를 만졌다면 가능) 아래 ALTER는 실패한다.
-- 이는 의도된 동작이다 — 데이터 정합성 문제를 조용히 덮지 않고 표면화해야 한다.
-- 실패 시 information_schema로 orphan 행을 먼저 찾아 정리한 뒤 재실행한다.
--
-- 주의 2: child_profiles.user_id는 0003에서 추가한 STORED 생성 컬럼(active_owner_id)이
-- 참조하는 베이스 컬럼이다. InnoDB는 "생성 컬럼이 의존하는 컬럼"에 대해 ON DELETE/UPDATE
-- CASCADE(또는 SET NULL)를 건 FK를 만드는 것을 허용하지 않는다(에러 1215 Cannot add foreign
-- key constraint). 그래서 child_profiles → users FK만 CASCADE 대신 RESTRICT로 건다.
-- 이 저장소에는 아직 "계정 삭제" API가 없어(Week 2 범위 아님) 실질적 영향은 없지만,
-- 나중에 계정 삭제 기능을 만들 때는 자녀 프로필을 먼저(또는 같은 트랜잭션에서 함께)
-- 삭제해야 한다는 점을 문서화해둔다. guardian_settings/refresh_tokens는 이런 생성
-- 컬럼 의존성이 없으므로 그대로 CASCADE를 사용한다.
--
-- Rollback:
--   ALTER TABLE `child_profiles` DROP FOREIGN KEY `fk_child_profiles_user`;
--   ALTER TABLE `guardian_settings` DROP FOREIGN KEY `fk_guardian_settings_user`;
--   ALTER TABLE `refresh_tokens` DROP FOREIGN KEY `fk_refresh_tokens_user`;

DELIMITER $$

DROP PROCEDURE IF EXISTS `_migration_0006_fk_child_profiles` $$

CREATE PROCEDURE `_migration_0006_fk_child_profiles`()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'child_profiles'
      AND COLUMN_NAME = 'user_id'
      AND REFERENCED_TABLE_NAME = 'users'
  ) THEN
    -- ON DELETE CASCADE는 사용하지 않는다 — 위 "주의 2" 참고
    ALTER TABLE `child_profiles`
      ADD CONSTRAINT `fk_child_profiles_user`
      FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT;
  END IF;
END $$

DELIMITER ;

CALL `_migration_0006_fk_child_profiles`();
DROP PROCEDURE IF EXISTS `_migration_0006_fk_child_profiles`;

DELIMITER $$

DROP PROCEDURE IF EXISTS `_migration_0006_fk_guardian_settings` $$

CREATE PROCEDURE `_migration_0006_fk_guardian_settings`()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'guardian_settings'
      AND COLUMN_NAME = 'user_id'
      AND REFERENCED_TABLE_NAME = 'users'
  ) THEN
    ALTER TABLE `guardian_settings`
      ADD CONSTRAINT `fk_guardian_settings_user`
      FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE;
  END IF;
END $$

DELIMITER ;

CALL `_migration_0006_fk_guardian_settings`();
DROP PROCEDURE IF EXISTS `_migration_0006_fk_guardian_settings`;

DELIMITER $$

DROP PROCEDURE IF EXISTS `_migration_0006_fk_refresh_tokens` $$

CREATE PROCEDURE `_migration_0006_fk_refresh_tokens`()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'refresh_tokens'
      AND COLUMN_NAME = 'user_id'
      AND REFERENCED_TABLE_NAME = 'users'
  ) THEN
    ALTER TABLE `refresh_tokens`
      ADD CONSTRAINT `fk_refresh_tokens_user`
      FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE;
  END IF;
END $$

DELIMITER ;

CALL `_migration_0006_fk_refresh_tokens`();
DROP PROCEDURE IF EXISTS `_migration_0006_fk_refresh_tokens`;
