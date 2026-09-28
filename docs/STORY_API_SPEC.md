# 동화 생성 및 상세 조회 API

모든 응답은 `{ "success": true, "message": "...", "data": { ... } }` 형태다. 아래 예시에는 핵심 `data`만 적었다. 인증이 필요한 요청에는 보호자 액세스 토큰을 `Authorization: Bearer <token>`으로 전달한다.

## 생성 요청: `POST /api/stories`

```json
{
  "childProfileId": 1,
  "characterId": 2,
  "backgroundId": "forest",
  "mainEventId": "treasure",
  "childAge": 6
}
```

`backgroundId` 대신 직접 입력한 `background`, `mainEventId` 대신 직접 입력한 `mainEvent`를 보낼 수 있다. 직접 입력값은 각 1~255자다. `childAge`를 생략하면 6을 사용한다. 캐릭터는 공용 프리셋이거나 해당 자녀의 캐릭터여야 한다.

`Idempotency-Key` 헤더를 보내면 비동기로 접수하고 **202 Accepted**를 즉시 반환한다. 키는 요청마다 새로 만든 1~100자의 영문·숫자·`_ . : -` 조합을 사용한다. 네트워크 오류나 타임아웃으로 동일 요청을 재전송할 때는 **같은 키**를 사용한다.

```http
POST /api/stories
Authorization: Bearer <token>
Idempotency-Key: 8b108faa-86aa-4f64-b332-9339771e05ca
Content-Type: application/json
```

```json
{
  "jobId": 42,
  "status": "pending",
  "storyId": null
}
```

`Location` 헤더에도 `/api/stories/generations/42`가 담긴다. 같은 보호자 계정에서 같은 키와 같은 입력으로 재요청하면 기존 작업을 반환한다. 같은 키로 다른 입력을 보내면 409다. 요청이 실패 상태가 된 뒤 새 동화를 생성하려면 새 키로 요청한다. 헤더를 생략하면 기존 동기 API가 그대로 동작하여 생성 완료 시 **201 Created**와 `storyId`, `title`, `character`, `setting`, `pages`, `choices`를 반환한다. 오래 걸리는 생성 작업에는 비동기 방식을 사용해야 클라이언트의 응답 시간 제한을 피할 수 있다.

## 생성 상태 조회: `GET /api/stories/generations/:jobId`

같은 보호자 계정만 작업을 조회할 수 있다. 응답은 **200 OK**이고 `data`는 다음과 같다.

```json
{
  "jobId": 42,
  "status": "completed",
  "storyId": 15
}
```

`status`는 `pending`, `processing`, `completed`, `failed` 중 하나다. `pending`/`processing` 중에는 `storyId`가 `null`이다. `failed`에는 사용자에게 표시할 `errorMessage`가 추가된다. 완료될 때까지 몇 초 간격으로 조회하고, `completed`이면 받은 `storyId`로 상세 API를 호출한다. 화면 이탈 후 재진입 시에도 같은 키로 생성 요청을 재전송하면 기존 `jobId`를 다시 얻을 수 있다.

## 상세 조회: `GET /api/stories/:id?child_profile_id=1`

**200 OK** 응답의 `data`:

```json
{
  "storyId": 15,
  "title": "숲속 모험",
  "character": "토리",
  "setting": { "background": "숲", "mainEvent": "보물 찾기" },
  "coverImageUrl": "/images/cover.png",
  "pages": [
    {
      "pageNumber": 1,
      "content": "토리는 숲으로 떠났어요.",
      "imageUrl": "/images/cover.png",
      "audioUrl": "/audio/page1.wav"
    }
  ],
  "choices": ["계속 걷기", "돌아가기"]
}
```

`coverImageUrl`은 첫 페이지 삽화 URL이며, 삽화가 없으면 `null`이다. 선택지가 저장되기 전 생성된 동화는 `choices: []`로 반환한다. 동화가 없거나 요청 자녀에게 공개되지 않았으면 404다.
