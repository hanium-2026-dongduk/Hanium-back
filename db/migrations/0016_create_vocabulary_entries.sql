SET @exist := (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'vocabulary_entries'
);

SET @sql := IF(@exist = 0,
  'CREATE TABLE vocabulary_entries (
    vocabulary_entry_id INT AUTO_INCREMENT PRIMARY KEY,
    child_profile_id INT NOT NULL,
    story_id INT NULL,
    english_word VARCHAR(100) NOT NULL,
    korean_meaning VARCHAR(255) NOT NULL,
    example_sentence TEXT NULL,
    is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME NOT NULL,
    CONSTRAINT fk_vocab_child
      FOREIGN KEY (child_profile_id) REFERENCES child_profiles(child_profile_id)
      ON DELETE CASCADE,
    CONSTRAINT fk_vocab_story
      FOREIGN KEY (story_id) REFERENCES stories(story_id)
      ON DELETE SET NULL
  ) ENGINE=InnoDB',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Rollback: DROP TABLE IF EXISTS vocabulary_entries;