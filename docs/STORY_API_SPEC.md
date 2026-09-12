
```markdown
# 📄 AI 동화 생성 및 조회 API 명세서 (Week 2)

## 1. 동화 생성 API
- **URL**: `POST /api/stories`
- **Content-Type**: `application/json`
- **설명**: 선택된 캐릭터, 배경, 사건 정보를 바탕으로 Gemini/Imagen/TTS를 거쳐 AI 동화를 생성합니다.

### Request Body
```json
{
  "childProfileId": 1,
  "characterId": 1,
  "backgroundId": "forest",      // 프리셋 배경 ID (직접 입력 시 생략 가능)
  "background": "신비로운 별빛 숲", // 배경 직접 입력 (backgroundId가 없으면 필수)
  "mainEventId": "treasure",     // 프리셋 사건 ID (직접 입력 시 생략 가능)
  "mainEvent": "보물 찾기",       // 사건 직접 입력 (mainEventId가 없으면 필수)
  "childAge": 6                  // 자녀 연령 (선택, 기본값: 6)
}

```

### Response (`201 Created`)

```json
{
  "success": true,
  "message": "동화가 생성되었습니다.",
  "data": {
    "title": "Pico's Forest Adventure",
    "character": "아기곰 피코",
    "setting": {
      "background": "신비로운 별빛 숲",
      "mainEvent": "보물 찾기"
    },
    "pages": [
      {
        "pageNumber": 1,
        "content": "Once upon a time, Pico went into the starry forest.",
        "imageUrl": "/images/page1.jpg",
        "audioUrl": "/audio/audio_17200000_abc123.wav"
      },
      {
        "pageNumber": 2,
        "content": "Pico found a glowing key near the old oak tree.",
        "imageUrl": "/images/page2.jpg",
        "audioUrl": "/audio/audio_17200000_def456.wav"
      }
    ],
    "choices": [
      "Open the wooden box with the key",
      "Look for another clue in the cave"
    ]
  }
}

```

---

## 2. 동화 상세 조회 API

* **URL**: `GET /api/stories/:id`
* **설명**: 저장된 동화 단건의 전체 페이지(텍스트, 삽화 이미지 URL, TTS 음성 URL)를 조회합니다.

### Response (`200 OK`)

```json
{
  "success": true,
  "data": {
    "storyId": 1,
    "title": "Toto's Adventure",
    "character": "아기곰 피코",
    "setting": {
      "background": "신비로운 별빛 숲",
      "mainEvent": "보물 찾기"
    },
    "pages": [
      {
        "pageNumber": 1,
        "content": "Once upon a time, there was a brave rabbit named Toto.",
        "imageUrl": "/images/sample1.png",
        "audioUrl": "/audio/sample1.wav"
      }
    ],
    "choices": [
      "Go into the forest",
      "Return home"
    ]
  }
}

```

### Error Response (`404 Not Found`)

```json
{
  "success": false,
  "message": "존재하지 않는 동화입니다."
}

```

