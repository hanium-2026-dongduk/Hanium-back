const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendance.controller');
const { authenticate } = require('../middlewares/auth');

// 모든 라우트에 인증 미들웨어 적용
router.use(authenticate);

// POST /api/attendance/check - 출석 체크 (그날 첫 체크 201, 재요청 200)
router.post('/check', attendanceController.checkValidation, attendanceController.check);

// GET /api/attendance/:childId?month=YYYY-MM - 월간 출석 현황
router.get('/:childId', attendanceController.monthlyValidation, attendanceController.getMonthly);

module.exports = router;
