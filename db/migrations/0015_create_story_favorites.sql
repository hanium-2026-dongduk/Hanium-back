-- Migration: create story_favorites
SET @exist := (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'story_favorites'
);

SET @sql := IF(@exist = 0,
  'CREATE TABLE story_favorites (
    story_favorite_id INT AUTO_INCREMENT PRIMARY KEY,
    child_profile_id INT NOT NULL,
    story_id INT NOT NULL,
    created_at DATETIME NOT NULL,
    UNIQUE KEY uq_child_story (child_profile_id, story_id),
    CONSTRAINT fk_story_favorites_child
      FOREIGN KEY (child_profile_id) REFERENCES child_profiles(child_profile_id)
      ON DELETE CASCADE,
    CONSTRAINT fk_story_favorites_story
      FOREIGN KEY (story_id) REFERENCES stories(story_id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Rollback: DROP TABLE IF EXISTS story_favorites;