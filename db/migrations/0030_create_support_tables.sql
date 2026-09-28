-- Customer support content is entered through the database until an admin UI exists.
-- Rollback (in reverse dependency order):
--   DROP TABLE IF EXISTS `inquiries`, `notice_reads`, `faqs`, `events`, `notices`;

CREATE TABLE IF NOT EXISTS `notices` (
  `notice_id` BIGINT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(200) NOT NULL,
  `content` TEXT NOT NULL,
  `is_published` BOOLEAN NOT NULL DEFAULT FALSE,
  `published_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`notice_id`),
  KEY `idx_notices_visible` (`is_published`, `published_at`, `notice_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `notice_reads` (
  `notice_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `read_at` DATETIME NOT NULL,
  PRIMARY KEY (`notice_id`, `user_id`),
  KEY `idx_notice_reads_user` (`user_id`),
  CONSTRAINT `fk_notice_reads_notice` FOREIGN KEY (`notice_id`) REFERENCES `notices` (`notice_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_notice_reads_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `events` (
  `event_id` BIGINT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(200) NOT NULL,
  `content` TEXT NOT NULL,
  `starts_at` DATETIME NOT NULL,
  `ends_at` DATETIME NOT NULL,
  `is_published` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`event_id`),
  KEY `idx_events_visible` (`is_published`, `starts_at`, `ends_at`),
  CONSTRAINT `chk_events_date_order` CHECK (`ends_at` > `starts_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `faqs` (
  `faq_id` BIGINT NOT NULL AUTO_INCREMENT,
  `question` VARCHAR(300) NOT NULL,
  `answer` TEXT NOT NULL,
  `is_recommended` BOOLEAN NOT NULL DEFAULT FALSE,
  `is_published` BOOLEAN NOT NULL DEFAULT FALSE,
  `display_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`faq_id`),
  KEY `idx_faqs_visible_order` (`is_published`, `display_order`, `faq_id`),
  KEY `idx_faqs_recommended` (`is_published`, `is_recommended`, `display_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `inquiries` (
  `inquiry_id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `content` TEXT NOT NULL,
  `answer` TEXT NULL,
  `answered_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`inquiry_id`),
  KEY `idx_inquiries_user_created` (`user_id`, `created_at`, `inquiry_id`),
  CONSTRAINT `fk_inquiries_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
