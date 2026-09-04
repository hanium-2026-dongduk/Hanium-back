-- 0003_child_profiles_single_active_constraint.sql
--
-- "한 유저에게 활성(is_active=true) 자녀 프로필은 최대 1개"라는 규칙을 애플리케이션
-- 레벨(서비스의 트랜잭션+행잠금)뿐 아니라 DB 레벨에서도 강제한다. 생성 컬럼
-- `active_owner_id`는 is_active가 true일 때만 user_id 값을, 아니면 NULL을 갖는다.
-- MySQL UNIQUE 인덱스는 NULL을 여러 개 허용하므로("비활성 프로필은 몇 개든 OK"),
-- 결과적으로 "같은 user_id가 active_owner_id에 두 번 이상 나타날 수 없다"만 강제된다.
--
-- 주의(기존 데이터 마이그레이션): 이 마이그레이션 이전 버전의 코드는 프로필을 새로
-- 만들 때마다 is_active=true로 생성해, 한 유저가 활성 프로필을 2개 이상 가진 상태가
-- 이미 존재할 수 있다. UNIQUE 인덱스를 걸기 전에 그런 유저는 가장 최근 생성된
-- 프로필만 남기고 나머지를 비활성화하는 정리 UPDATE를 먼저 실행한다(ROW_NUMBER()
-- 사용 — MySQL 8.0 이상 필요, 이 저장소의 대상 DB는 MySQL 8이므로 문제 없음).
--
-- Rollback:
--   ALTER TABLE `child_profiles` DROP INDEX `uq_child_profiles_active_owner`;
--   ALTER TABLE `child_profiles` DROP COLUMN `active_owner_id`;
--   -- (정리 UPDATE로 비활성화된 프로필의 is_active는 되돌리지 않는다 — 원래 상태 자체가
--   --  버그였으므로 롤백 대상이 아니다.)

UPDATE `child_profiles` cp
JOIN (
  SELECT `child_profile_id`
  FROM (
    SELECT
      `child_profile_id`,
      ROW_NUMBER() OVER (
        PARTITION BY `user_id`
        ORDER BY `created_at` DESC, `child_profile_id` DESC
      ) AS rn
    FROM `child_profiles`
    WHERE `is_active` = 1
  ) ranked
  WHERE ranked.rn > 1
) dup ON cp.`child_profile_id` = dup.`child_profile_id`
SET cp.`is_active` = 0;

DELIMITER $$

-- 생성 컬럼을 붙이기 전에, 그 컬럼이 의존할 `user_id`에 걸린 FK가 호환되는지 정리한다.
--
-- InnoDB는 STORED 생성 컬럼이 의존하는 컬럼에 CASCADE/SET NULL FK를 허용하지 않는다.
-- 그런데 `sequelize.sync()`는 onUpdate 기본값이 CASCADE라 `ON UPDATE CASCADE`로 FK를
-- 만든다. 그 위에 이 마이그레이션을 적용하면 아래 ADD COLUMN이 ERROR 1215로 실패한다
-- (마이그레이션으로 만든 스키마에서는 0006이 RESTRICT로 걸어 문제가 없어, 신규 로컬
-- 세팅에서만 터지는 어긋남이었다).
--
-- 여기서 호환되지 않는 FK를 떼어내면 뒤이어 도는 0006이 RESTRICT로 다시 걸어준다.
-- 제약 이름이 환경마다 다르므로(sync는 `child_profiles_ibfk_1`) 이름을 조회해서 지운다.
--
-- 모델 쪽도 `onUpdate: 'RESTRICT'`를 명시해 두었으므로, 앞으로 sync()가 만드는 스키마는
-- 처음부터 호환된다. 이 절차는 그 이전에 만들어진 DB를 위한 것이다.
DROP PROCEDURE IF EXISTS `_migration_0003_drop_incompatible_fk` $$

CREATE PROCEDURE `_migration_0003_drop_incompatible_fk`()
BEGIN
  DECLARE fk_name VARCHAR(64) DEFAULT NULL;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET fk_name = NULL;

  SELECT rc.CONSTRAINT_NAME INTO fk_name
  FROM information_schema.REFERENTIAL_CONSTRAINTS rc
  JOIN information_schema.KEY_COLUMN_USAGE kcu
    ON kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
   AND kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
   AND kcu.TABLE_NAME = rc.TABLE_NAME
  WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
    AND rc.TABLE_NAME = 'child_profiles'
    AND kcu.COLUMN_NAME = 'user_id'
    AND (rc.UPDATE_RULE IN ('CASCADE', 'SET NULL')
      OR rc.DELETE_RULE IN ('CASCADE', 'SET NULL'))
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    SET @drop_fk_sql = CONCAT('ALTER TABLE `child_profiles` DROP FOREIGN KEY `', fk_name, '`');
    PREPARE drop_fk_stmt FROM @drop_fk_sql;
    EXECUTE drop_fk_stmt;
    DEALLOCATE PREPARE drop_fk_stmt;
  END IF;
END $$

DELIMITER ;

CALL `_migration_0003_drop_incompatible_fk`();

DROP PROCEDURE IF EXISTS `_migration_0003_drop_incompatible_fk`;

DELIMITER $$

DROP PROCEDURE IF EXISTS `_migration_0003_active_owner_column` $$

CREATE PROCEDURE `_migration_0003_active_owner_column`()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'child_profiles'
      AND COLUMN_NAME = 'active_owner_id'
  ) THEN
    ALTER TABLE `child_profiles`
      ADD COLUMN `active_owner_id` BIGINT
        GENERATED ALWAYS AS (IF(`is_active` = 1, `user_id`, NULL)) STORED;
  END IF;
END $$

DELIMITER ;

CALL `_migration_0003_active_owner_column`();

DROP PROCEDURE IF EXISTS `_migration_0003_active_owner_column`;

DELIMITER $$

DROP PROCEDURE IF EXISTS `_migration_0003_active_owner_index` $$

CREATE PROCEDURE `_migration_0003_active_owner_index`()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'child_profiles'
      AND INDEX_NAME = 'uq_child_profiles_active_owner'
  ) THEN
    ALTER TABLE `child_profiles`
      ADD UNIQUE INDEX `uq_child_profiles_active_owner` (`active_owner_id`);
  END IF;
END $$

DELIMITER ;

CALL `_migration_0003_active_owner_index`();

DROP PROCEDURE IF EXISTS `_migration_0003_active_owner_index`;
