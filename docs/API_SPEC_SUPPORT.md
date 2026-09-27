# 고객지원 API (이슈 #37)

모든 경로는 `/api` 아래에 있으며 Bearer access token이 필요합니다. 응답은 기존 `{ success, message, data }` 형식을 따릅니다. 목록의 `data`는 `{ items, pagination }`이고, `page` 기본값은 1, `limit` 기본값은 20(최대 100)입니다. 실제 필드별 계약은 `/api-docs`와 `/api-docs.json`에 있습니다.

| 화면 | 경로 | 동작 |
| --- | --- | --- |
| CS01 공지 | `GET /notices`, `GET /notices/:id`, `POST /notices/:id/read` | 게시된 공지 조회, 계정별 읽음 처리 |
| CS02 이벤트 | `GET /events?status=ongoing\|ended`, `GET /events/:id` | 시작된 공개 이벤트 조회 |
| CS03 FAQ | `GET /faqs?keyword=`, `GET /faqs/recommended` | 공개 FAQ 검색과 추천 목록 |
| CS04 문의 | `POST /inquiries`, `GET /inquiries`, `GET /inquiries/:id` | `{ "title": "...", "content": "..." }` 등록, 내 문의와 답변 조회 |

공지 읽음 기록은 자녀 프로필이 아닌 보호자 계정(`user_id`)에 붙습니다. 읽음 처리를 다시 호출해도 최초 `read_at`을 유지합니다. 공지는 `is_published=1`이고 `published_at`이 현재보다 과거일 때만 보입니다. 이벤트도 `is_published=1`이고 시작 시각이 지난 것만 보이며, 종료 시각이 지나면 `ended`입니다. FAQ는 `is_published=1`인 항목만 노출합니다.

문의에는 작성자의 `user_id`가 서버에서 기록됩니다. 목록과 상세는 이 ID로 제한하며 다른 계정의 문의를 요청하면 404를 반환합니다. 답변이 없으면 `status=pending`, 답변이 있으면 `status=answered`입니다.

## 운영 데이터 입력

관리자 UI가 생기기 전에는 운영자가 DB에서 공지·이벤트·FAQ를 입력하고 문의에 답변합니다. 임의의 공지나 이벤트 문구가 사용자에게 노출되지 않도록 자동 시드는 넣지 않았습니다. 신규 배포 직후 목록은 빈 배열로 시작합니다. 콘텐츠를 공개할 때 아래처럼 게시 여부와 날짜를 함께 입력합니다.

```sql
INSERT INTO notices (title, content, is_published, published_at, created_at, updated_at)
VALUES ('실제 공지 제목', '검토된 공지 본문', TRUE, UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP());

INSERT INTO events (title, content, starts_at, ends_at, is_published, created_at, updated_at)
VALUES ('실제 이벤트 제목', '검토된 이벤트 본문', '2026-10-01 00:00:00', '2026-10-31 23:59:59', TRUE, UTC_TIMESTAMP(), UTC_TIMESTAMP());

INSERT INTO faqs (question, answer, is_recommended, is_published, display_order, created_at, updated_at)
VALUES ('검토된 질문', '검토된 답변', TRUE, TRUE, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP());

UPDATE inquiries
SET answer = '검토된 답변', answered_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP()
WHERE inquiry_id = 1 AND answer IS NULL;
```

위 예시의 날짜는 UTC 기준입니다. 운영 데이터의 날짜도 DB 세션의 시각 기준에 맞춰 입력해야 합니다. 문의 답변 시 `answer`와 `answered_at`을 함께 채웁니다. 해당 계정의 문의만 조회할 수 있으므로 답변용 관리자 API는 현재 제공하지 않습니다.
