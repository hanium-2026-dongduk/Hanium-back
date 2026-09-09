# 칭찬 스티커 API 스펙

> Base URL: `{SERVER_URL}/api`
> Content-Type: `application/json`
> **모든 엔드포인트는 인증 필요** — `Authorization: Bearer {accessToken}` (없으면 401)

대상 요구사항: **PD04_STK_01**(칭찬 스티커 전송, High), **MP05_STK_01**(수신 스티커 목록 조회).

---

## 구현 상태

| 항목 | 상태 |
|---|---|
| `sticker_sends` 스키마 | ✅ 마이그레이션 `0013` |
| 스티커 카탈로그 (`src/config/stickerCatalog.js`) | ✅ 6종 |
| API 3종 | ✅ 구현 완료 |
| 스티커 종류·문구 | ⚠️ **예시값 — 기획·디자인 확정 필요** |

---

## 설계: 스티커 종류는 DB가 아니라 코드에 있다

`praise_stickers` 테이블은 만들지 않았다. 스티커의 이름·아이콘은
`src/config/stickerCatalog.js`의 코드 상수이고, DB에는 **누가 누구에게 무엇을 언제 보냈는지만**
(`sticker_sends`) 남는다. 배지([API_SPEC_BADGE.md](./API_SPEC_BADGE.md))와 같은 판단이다.

그래서 `sticker_sends.sticker_code`는 FK가 아니라 VARCHAR이며, 유효성은 모델의 `isIn`으로 본다.

> **`sticker_code`는 절대 바꾸지 말 것** — 이미 발송된 행의 의미가 달라진다.
> 카탈로그에서 스티커를 지워도 **과거 기록은 목록에서 사라지지 않는다** — 이름을 찾지 못하면
> 코드를 그대로 이름 자리에 넣는다. 아이가 받은 칭찬이 카탈로그 변경으로 없어지면 안 되기 때문이다.

### 배지와 다른 점: 멱등하지 않다

`child_badges`에는 `UNIQUE(child_profile_id, badge_code)`가 있지만 `sticker_sends`에는 없다.
**같은 스티커를 여러 번 보내는 것이 정상**이기 때문이다 — 배지는 "한 번 달성하는 것",
스티커는 "계속 주고받는 것"이다.

그래서 네트워크 재시도로 중복 발송될 수 있다. 스티커는 중복돼도 해로운 부작용이 없어
(포인트가 나가지 않는다) 멱등키를 두지 않았다. 발송 버튼 연타가 문제가 되면 프론트에서
버튼을 잠그거나, 나중에 짧은 쿨다운을 서버에 두면 된다.

---

## 1. 보낼 수 있는 스티커 목록

```
GET /api/stickers
```

보호자가 무엇을 보낼지 고르는 화면에서 쓴다.

### Response

**200 OK**
```json
{
  "success": true,
  "message": "스티커 목록을 조회했습니다.",
  "data": {
    "stickers": [
      { "sticker_code": "well_done", "name": "잘했어요", "icon_key": "thumbs_up" },
      { "sticker_code": "awesome", "name": "최고예요", "icon_key": "star" }
    ]
  }
}
```

`icon_key`는 URL이 아니라 **키**다. 프론트가 이미지에 매핑한다 — 아이콘을 교체할 때
백엔드 배포가 필요 없도록.

---

## 2. 칭찬 스티커 발송 (PD04_STK_01)

```
POST /api/stickers/send
```

### Request Body
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| child_profile_id | int | O | 양의 정수. **요청자 소유가 아니면 404** |
| sticker_code | string | O | 카탈로그에 있는 코드. 아니면 400 |
| message | string | X | 함께 보내는 한마디. 최대 200자. 공백만 있으면 없는 것으로 본다 |

### Response

**201 Created**
```json
{
  "success": true,
  "message": "칭찬 스티커를 보냈습니다.",
  "data": {
    "sticker": {
      "sticker_send_id": 1,
      "sticker_code": "well_done",
      "name": "잘했어요",
      "icon_key": "thumbs_up",
      "message": "오늘 정말 잘했어!",
      "sent_at": "2026-08-20T06:40:00.000Z"
    }
  }
}
```

**400** (알 수 없는 스티커 / 한마디 초과 / child_profile_id 형식) · **401** ·
**404** (소유하지 않은 자녀)

---

## 3. 받은 스티커 목록 (MP05_STK_01)

```
GET /api/stickers/received/:childId?page=1&limit=20
```

최신순. `limit` 기본값 20, 최대 100(초과 시 400).

### Response

**200 OK**
```json
{
  "success": true,
  "message": "받은 스티커를 조회했습니다.",
  "data": {
    "items": [
      {
        "sticker_send_id": 3,
        "sticker_code": "well_done",
        "name": "잘했어요",
        "icon_key": "thumbs_up",
        "message": null,
        "sent_at": "2026-08-20T06:40:02.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "totalCount": 3, "totalPages": 1 }
  }
}
```

**400** · **401** · **404**(소유하지 않은 자녀)

정렬은 `sent_at DESC, sticker_send_id DESC`다. 같은 초에 여러 건이 들어와도 페이지 경계에서
항목이 중복/누락되지 않도록 PK를 보조 정렬키로 쓴다.

---

## 4. 삭제 정책

| 대상 | 동작 |
|---|---|
| 자녀 프로필 삭제 | **CASCADE** — 받은 스티커도 함께 삭제된다 |
| 보낸 보호자 계정 삭제 | **RESTRICT** — 막힌다 |

보호자 쪽을 RESTRICT로 둔 이유는 아이가 받은 칭찬 기록이 계정 삭제로 조용히 사라지는 것을
막기 위해서다. 계정 삭제 기능을 만들 때 이 기록을 어떻게 할지(익명화 등) 별도로 정해야 한다.
(이 저장소에는 아직 계정 삭제 API가 없다)

---

## 5. 현재 스티커 목록 (기획 확정 전 예시값)

| sticker_code | 이름 | icon_key |
|---|---|---|
| `well_done` | 잘했어요 | thumbs_up |
| `awesome` | 최고예요 | star |
| `proud` | 자랑스러워요 | heart |
| `keep_going` | 조금만 더! | muscle |
| `thank_you` | 고마워요 | clover |
| `love_you` | 사랑해요 | hug |

### 아직 없는 것

- **읽음 표시가 없다.** "새 스티커 N개" 배지를 띄우려면 `read_at` 컬럼과 읽음 처리 API가
  필요하다. 요구사항(MP05_STK_01)이 "목록 조회"까지만 정의하고 있어 넣지 않았다.
- **발송 빈도 제한이 없다.** 한 보호자가 하루에 몇 개까지 보낼 수 있는지 기획에 정의가 없다.
