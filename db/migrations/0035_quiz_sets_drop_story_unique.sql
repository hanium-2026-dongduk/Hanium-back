-- 0035: quiz_sets의 uq_story(story_id) UNIQUE 제약 제거.
--
-- 0034에서 story_id를 nullable로 바꿨지만 원래 UNIQUE KEY(uq_story)는 그대로
-- 남아있었다. story_id가 NULL인 행끼리는 InnoDB가 서로 다른 값으로 취급해
-- 단어장 기반 퀴즈(story_id NULL)는 문제가 없지만, storyId를 좁혀서 받는
-- 단어장 기반 퀴즈(generateFromVocabulary({ storyId }))는 story_id를 채워서
-- INSERT하기 때문에, 그 동화에 이미 story 기반 퀴즈가 있으면(=story_id가 이미
-- uq_story에 존재) 중복 키 에러(ER_DUP_ENTRY)로 실패한다.
--
-- 이제는 한 story_id에 여러 quiz_sets(예: story 기반 1개 + 단어장 기반 여러 개)가
-- 있을 수 있으므로 story_id 유일성을 DB 레벨에서 강제하지 않는다. story 기반
-- 재사용(findOrCreate)은 애플리케이션에서 source_type='story' 조건까지 맞춰
-- 조회하도록 quizGeneration.service.js에서 처리한다.
--
-- Rollback:
--   ALTER TABLE `quiz_sets` ADD UNIQUE KEY `uq_story` (`story_id`);
--   (주의: 단어장 기반 퀴즈가 이미 story_id를 채운 채로 여러 개 있으면 롤백이 실패한다)

DELIMITER $$

DROP PROCEDURE IF EXISTS `_migration_0035_quiz_sets_drop_story_unique` $$

CREATE PROCEDURE `_migration_0035_quiz_sets_drop_story_unique`()
BEGIN
  -- fk_quiz_set_story(story_id -> stories.story_id)가 story_id 위의 인덱스를
  -- 항상 필요로 해서, uq_story가 그 유일한 인덱스인 상태에서 바로 DROP하면
  -- "Cannot drop index 'uq_story': needed in a foreign key constraint" 에러가 난다.
  -- 그래서 순서를 바꿔 먼저 대체 인덱스(idx_quiz_sets_story)를 추가해 FK가 그걸
  -- 쓸 수 있게 한 다음, uq_story를 제거한다.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quiz_sets' AND INDEX_NAME = 'idx_quiz_sets_story'
  ) THEN
    ALTER TABLE `quiz_sets` ADD INDEX `idx_quiz_sets_story` (`story_id`);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quiz_sets' AND INDEX_NAME = 'uq_story'
  ) THEN
    ALTER TABLE `quiz_sets` DROP INDEX `uq_story`;
  END IF;
END $$

DELIMITER ;

CALL `_migration_0035_quiz_sets_drop_story_unique`();
DROP PROCEDURE IF EXISTS `_migration_0035_quiz_sets_drop_story_unique`;