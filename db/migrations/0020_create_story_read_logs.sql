SET @exist := (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'story_read_logs'
);

SET @sql := IF(@exist = 0,
  'CREATE TABLE story_read_logs (
    story_read_log_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    child_profile_id BIGINT NOT NULL,
    story_id BIGINT NOT NULL,
    created_at DATETIME NOT NULL,
    UNIQUE KEY uq_child_story_read (child_profile_id, story_id),
    CONSTRAINT fk_story_read_child
      FOREIGN KEY (child_profile_id) REFERENCES child_profiles(child_profile_id)
      ON DELETE CASCADE,
    CONSTRAINT fk_story_read_story
      FOREIGN KEY (story_id) REFERENCES stories(story_id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Rollback: DROP TABLE IF EXISTS story_read_logs;