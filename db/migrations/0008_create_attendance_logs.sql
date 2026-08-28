-- 0008_create_attendance_logs.sql
--
-- 자녀별 일일 출석 기록 테이블. src/models/attendanceLog.model.js에 대응.
-- UNIQUE(child_profile_id, attendance_date)가 "자녀별 출석은 하루 한 번"을 DB 레벨에서
-- 강제한다 — 동시 출석 요청이 여러 개 도착해도 실제 기록(과 포인트 지급)은 정확히 한 번만
-- 일어난다. 이 복합 인덱스가 child_profile_id 선두 조회(월간 출석 조회)도 커버하므로 별도
-- 인덱스는 두지 않는다. child_profiles가 삭제되면 출석 이력도 함께 삭제한다.
--
-- 생성 후 수정되지 않는 불변 로그이므로 updated_at 컬럼이 없다(refresh_tokens와 동일).
--
-- 신규 테이블이라 기존 데이터 마이그레이션 이슈는 없다.
--
-- Rollback:
--   DROP TABLE IF EXISTS `attendance_logs`;

CREATE TABLE IF NOT EXISTS `attendance_logs` (
  `attendance_log_id` BIGINT NOT NULL AUTO_INCREMENT,
  `child_profile_id` BIGINT NOT NULL,
  `attendance_date` DATE NOT NULL,
  `checked_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`attendance_log_id`),
  UNIQUE KEY `uq_attendance_logs_child_date` (`child_profile_id`, `attendance_date`),
  CONSTRAINT `fk_attendance_logs_child_profile`
    FOREIGN KEY (`child_profile_id`) REFERENCES `child_profiles` (`child_profile_id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
