const express = require('express');
const router = express.Router();

// 임시 메모리 데이터베이스 (DB 연결 전 테스트용)
let characters = [
  {
    id: 1,
    name: "아기곰 피코",
    personality: "용감함, 호기심 많음",
    description: "노란 멜빵바지를 입은 아기곰",
    imageUrl: "/images/pico.png",
    type: "PRESET"
  }
];

// 1. 캐릭터 목록 조회 API (GET /api/characters)
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    data: characters
  });
});

// 2. 캐릭터 생성 API (POST /api/characters)
router.post('/', (req, res) => {
  const { name, personality, description, imageUrl, type } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, message: "캐릭터 이름은 필수입니다." });
  }

  const newCharacter = {
    id: characters.length + 1,
    name,
    personality: personality || "밝음",
    description: description || "",
    imageUrl: imageUrl || null,
    type: type || "CUSTOM",
    createdAt: new Date()
  };

  characters.push(newCharacter);

  res.status(201).json({
    success: true,
    message: "캐릭터가 생성되었습니다.",
    data: newCharacter
  });
});

module.exports = router;
module.exports.characters = characters; // 다른 라우터에서 조회할 수 있도록 노출