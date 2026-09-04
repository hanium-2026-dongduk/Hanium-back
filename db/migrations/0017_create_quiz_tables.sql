SET @exist1 := (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'quiz_sets');
SET @sql1 := IF(@exist1 = 0,
  'CREATE TABLE quiz_sets (
    quiz_set_id INT AUTO_INCREMENT PRIMARY KEY,
    story_id INT NOT NULL,
    source_type VARCHAR(20) NOT NULL DEFAULT ''story'',
    status VARCHAR(20) NOT NULL DEFAULT ''pending'',
    generated_at DATETIME NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uq_story (story_id),
    CONSTRAINT fk_quiz_set_story FOREIGN KEY (story_id) REFERENCES stories(story_id) ON DELETE CASCADE
  ) ENGINE=InnoDB',
  'SELECT 1'
);
PREPARE stmt1 FROM @sql1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

SET @exist2 := (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'quiz_questions');
SET @sql2 := IF(@exist2 = 0,
  'CREATE TABLE quiz_questions (
    quiz_question_id INT AUTO_INCREMENT PRIMARY KEY,
    quiz_set_id INT NOT NULL,
    question_order INT NOT NULL,
    question_text TEXT NOT NULL,
    question_type VARCHAR(20) NOT NULL DEFAULT ''multiple_choice'',
    created_at DATETIME NOT NULL,
    UNIQUE KEY uq_set_order (quiz_set_id, question_order),
    CONSTRAINT fk_quiz_question_set FOREIGN KEY (quiz_set_id) REFERENCES quiz_sets(quiz_set_id) ON DELETE CASCADE
  ) ENGINE=InnoDB',
  'SELECT 1'
);
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

SET @exist3 := (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'quiz_options');
SET @sql3 := IF(@exist3 = 0,
  'CREATE TABLE quiz_options (
    quiz_option_id INT AUTO_INCREMENT PRIMARY KEY,
    quiz_question_id INT NOT NULL,
    option_order INT NOT NULL,
    option_text TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME NOT NULL,
    UNIQUE KEY uq_question_order (quiz_question_id, option_order),
    CONSTRAINT fk_quiz_option_question FOREIGN KEY (quiz_question_id) REFERENCES quiz_questions(quiz_question_id) ON DELETE CASCADE
  ) ENGINE=InnoDB',
  'SELECT 1'
);
PREPARE stmt3 FROM @sql3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

-- Rollback: DROP TABLE IF EXISTS quiz_options, quiz_questions, quiz_sets;