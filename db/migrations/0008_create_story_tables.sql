-- 0008_create_story_tables.sql
--
-- 동화 생성 기능(SG01~SG04)을 위한 테이블 신규 생성:
--   1) characters — 동화 주인공 캐릭터 (PRESET/CUSTOM/RANDOM)
--   2) stories — 생성된 동화 1건 (자녀 프로필, 캐릭터, 배경/사건, 연령 기준)
--   3) story_pages — 동화의 페이지별 본문
--   4) story_page_illustrations — 페이지별 삽화 (story_pages와 1:1)
--   5) story_page_tts — 페이지별 TTS 오디오 (story_pages와 1:1)
--
-- 삽화/TTS를 story_pages에 컬럼으로 합치지 않고 별도 테이블로 분리한 이유:
-- 이미지·오디오 생성이 각각 독립적으로 재시도/재생성될 수 있어(Gemini API
-- 503 등으로 인한 부분 재생성), 페이지 본문과 미디어의 생명주기를 분리해
-- 관리하기 위함.
--
-- Rollback:
--   DROP TABLE IF EXISTS `story_page_tts`;
--   DROP TABLE IF EXISTS `story_page_illustrations`;
--   DROP TABLE IF EXISTS `story_pages`;
--   DROP TABLE IF EXISTS `stories`;
--   DROP TABLE IF EXISTS `characters`;

CREATE TABLE IF NOT EXISTS `characters` (
  `character_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `personality` VARCHAR(255) NOT NULL DEFAULT '밝음',
  `description` VARCHAR(255) NULL,
  `image_url` VARCHAR(255) NULL,
  `type` ENUM('PRESET', 'CUSTOM', 'RANDOM') NOT NULL DEFAULT 'CUSTOM',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `stories` (
  `story_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `child_profile_id` BIGINT NOT NULL,
  `character_id` BIGINT NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `background` VARCHAR(255) NOT NULL,
  `main_event` VARCHAR(255) NOT NULL,
  `child_age` INT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_stories_character`
    FOREIGN KEY (`character_id`) REFERENCES `characters`(`character_id`)
    ON DELETE RESTRICT,
  CONSTRAINT `fk_stories_child_profile`
    FOREIGN KEY (`child_profile_id`) REFERENCES `child_profiles`(`child_profile_id`)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `story_pages` (
  `story_page_id` INT AUTO_INCREMENT PRIMARY KEY,
  `story_id` INT NOT NULL,
  `page_number` INT NOT NULL,
  `content` TEXT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_story_pages_story`
    FOREIGN KEY (`story_id`) REFERENCES `stories`(`story_id`)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `story_page_illustrations` (
  `illustration_id` INT AUTO_INCREMENT PRIMARY KEY,
  `story_page_id` INT NOT NULL,
  `image_url` VARCHAR(255) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_story_page_illustrations_page`
    FOREIGN KEY (`story_page_id`) REFERENCES `story_pages`(`story_page_id`)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `story_page_tts` (
  `tts_id` INT AUTO_INCREMENT PRIMARY KEY,
  `story_page_id` INT NOT NULL,
  `audio_url` VARCHAR(255) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_story_page_tts_page`
    FOREIGN KEY (`story_page_id`) REFERENCES `story_pages`(`story_page_id`)
    ON DELETE CASCADE
);