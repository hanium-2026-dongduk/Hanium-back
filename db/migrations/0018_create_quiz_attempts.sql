SET @exist := (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'quiz_attempts'
);

SET @sql := IF(@exist = 0,
  'CREATE TABLE quiz_attempts (
    quiz_attempt_id INT AUTO_INCREMENT PRIMARY KEY,
    child_profile_id INT NOT NULL,
    quiz_set_id INT NOT NULL,
    total_questions INT NOT NULL,
    correct_count INT NOT NULL,
    score INT NOT NULL,
    answers JSON NOT NULL,
    submitted_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL,
    CONSTRAINT fk_attempt_child
      FOREIGN KEY (child_profile_id) REFERENCES child_profiles(child_profile_id)
      ON DELETE CASCADE,
    CONSTRAINT fk_attempt_quizset
      FOREIGN KEY (quiz_set_id) REFERENCES quiz_sets(quiz_set_id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Rollback: DROP TABLE IF EXISTS quiz_attempts;