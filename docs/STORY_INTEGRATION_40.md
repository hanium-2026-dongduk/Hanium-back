# 동화 연동 보완 (#40, 1차)

## 캐릭터 API

두 경로 모두 Bearer access token이 필요하다. 자녀 프로필은 로그인한 보호자의 것이어야 하며, 다른 보호자의 ID는 404를 반환한다.

| 요청 | 입력 | 동작 |
| --- | --- | --- |
| `GET /api/characters?child_profile_id=11` | 필수 쿼리 `child_profile_id` | 공용 `PRESET`과 해당 자녀의 캐릭터만 반환 |
| `POST /api/characters` | 필수 body `child_profile_id`, `name`; 선택 `personality`, `description`, `imageUrl` | 해당 자녀의 `CUSTOM` 캐릭터 생성 |

`POST`에 `type`을 보내더라도 생성되는 캐릭터는 항상 `CUSTOM`이다. `POST /api/stories`도 공용 프리셋 또는 요청한 `childProfileId`의 캐릭터만 허용한다. 기존 DB의 `CUSTOM`/`RANDOM` 캐릭터에는 소유자 정보가 없으므로 자동으로 특정 자녀에게 배정하지 않는다. 운영자가 실제 소유자를 확인해 `characters.child_profile_id`를 채우기 전까지 목록·새 동화 생성에서 제외된다. 기존 동화 조회는 영향을 받지 않는다.

## 생성 미디어 URL

생성 응답의 `imageUrl`, `audioUrl`은 각각 `/images/...`, `/audio/...` 형식의 **상대 경로**다. 프론트는 API 호스트를 앞에 붙여 요청한다. 생성기가 파일을 쓰는 저장소 루트 `public/` 디렉터리를 서버가 그대로 제공한다.

## 목록 페이지네이션

`GET /api/stories`, `GET /api/stories/explore`, `GET /api/quizzes/attempts`의 `page`와 `limit`는 1 이상의 정수다(`limit` 최대 100). 기본값은 1과 20이다. `GET /api/stories?favorite=false`는 즐겨찾기로 제한하지 않는다.

동화 생성 타임아웃·중복 생성 방지와 상세 응답 필드 개선은 #40의 후속 작업이다.
