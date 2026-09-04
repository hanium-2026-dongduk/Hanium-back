const express = require('express');
const router = express.Router();

const presets = {
  backgrounds: [
    { id: "forest", name: "신비로운 별빛 숲" },
    { id: "ocean", name: "깊은 바닷속 궁전" },
    { id: "castle", name: "하늘 위 장난감 성" }
  ],
  mainEvents: [
    { id: "treasure", name: "사라진 무지개 열매 찾기" },
    { id: "friend", name: "길 잃은 아기 용 도와주기" },
    { id: "star", name: "밤하늘의 별빛 조각 모으기" }
  ]
};

router.get('/presets', (req, res) => {
  res.status(200).json({ success: true, data: presets });
});

module.exports = router;
module.exports.presets = presets; // story.router에서 조회용