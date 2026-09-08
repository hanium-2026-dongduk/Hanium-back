-- 0013_create_sticker_sends.sql
--
-- 보호자가 자녀에게 보낸 칭찬 스티커 (PD04_STK_01, MP05_STK_01).
-- src/models/stickerSend.model.js에 대응.
--
-- 스티커 "종류"(이름·아이콘)는 DB 테이블(`praise_stickers`)이 아니라
-- src/config/stickerCatalog.js의 코드 상수다 — 배지 카탈로그(0012)와 같은 판단이다
-- (docs/WEEK3_A_DESIGN.md 4절). 그래서 `sticker_code`는 FK가 아니라 VARCHAR이고,
-- 유효성은 애플리케이션(모델의 isIn)에서 본다.
--
-- child_badges와 달리 UNIQUE 제약이 없다 — 같은 스티커를 여러 번 보내는 것이 정상이다.
-- 배지는 "한 번 달성", 스티커는 "계속 주고받는 것"이라는 차이.
--
-- sender_user_id의 FK는 ON DELETE RESTRICT다. child_profiles.user_id와 같은 이유는
-- 아니고(생성 컬럼 의존 없음), 보호자 계정이 지워질 때 아이가 받은 칭찬 기록이 함께
-- 사라지는 것을 막기 위해서다. 계정 삭제 기능이 생기면 이 기록을 어떻게 할지
-- (익명화 등) 별도로 정해야 한다.
--
-- 인덱스 (child_profile_id, sent_at) — 자녀별 최신순 조회가 유일한 읽기 패턴이다.
--
-- 신규 테이블이라 기존 데이터 마이그레이션 이슈는 없다.
--
-- Rollback:
--   DROP TABLE IF EXISTS `sticker_sends`;

CREATE TABLE IF NOT EXISTS `sticker_sends` (
  `sticker_send_id` BIGINT NOT NULL AUTO_INCREMENT,
  `child_profile_id` BIGINT NOT NULL,
  `sender_user_id` BIGINT NOT NULL,
  `sticker_code` VARCHAR(40) NOT NULL,
  `message` VARCHAR(200) NULL,
  `sent_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`sticker_send_id`),
  KEY `idx_sticker_sends_child_sent` (`child_profile_id`, `sent_at`),
  CONSTRAINT `fk_sticker_sends_child_profile`
    FOREIGN KEY (`child_profile_id`) REFERENCES `child_profiles` (`child_profile_id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_sticker_sends_sender`
    FOREIGN KEY (`sender_user_id`) REFERENCES `users` (`user_id`)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
