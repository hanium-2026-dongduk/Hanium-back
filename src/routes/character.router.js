const express = require('express');
const router = express.Router();
const { Character } = require('../models');

// 1. 캐릭터 목록 조회 API (GET /api/characters)
router.get('/', async (req, res, next) => {
  try {
    const characters = await Character.findAll();
    res.status(200).json({
      success: true,
      data: characters
    });
  } catch (error) {
    next(error);
  }
});

// 2. 캐릭터 생성 API (POST /api/characters)
router.post('/', async (req, res, next) => {
  try {
    const { name, personality, description, imageUrl, type } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: "캐릭터 이름은 필수입니다." });
    }

    const newCharacter = await Character.create({
      name,
      personality: personality || "밝음",
      description: description || "",
      image_url: imageUrl || null,
      type: type || "CUSTOM",
    });

    res.status(201).json({
      success: true,
      message: "캐릭터가 생성되었습니다.",
      data: newCharacter
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;