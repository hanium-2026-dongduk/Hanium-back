jest.mock('../../src/services/attendance.service');

const request = require('supertest');
const attendanceService = require('../../src/services/attendance.service');
const { generateAccessToken } = require('../../src/utils/jwt');
const app = require('../../src/app');

const token = generateAccessToken({ user_id: 1, email: 'a@b.com', role: 'parent' });
const auth = (req) => req.set('Authorization', `Bearer ${token}`);

describe('/api/attendance', () => {
  describe('POST /check', () => {
    test('인증 없이 호출하면 401', async () => {
      const res = await request(app).post('/api/attendance/check').send({ child_profile_id: 1 });

      expect(res.status).toBe(401);
      expect(attendanceService.checkIn).not.toHaveBeenCalled();
    });

    test('child_profile_id가 없으면 400이고 서비스는 호출되지 않는다', async () => {
      const res = await auth(request(app).post('/api/attendance/check').send({}));

      expect(res.status).toBe(400);
      expect(attendanceService.checkIn).not.toHaveBeenCalled();
    });

    test('그날 첫 출석은 201로 응답한다', async () => {
      attendanceService.checkIn.mockResolvedValue({
        alreadyChecked: false,
        attendanceDate: '2026-08-12',
        streakDays: 3,
        pointsEarned: 30,
      });

      const res = await auth(request(app).post('/api/attendance/check').send({ child_profile_id: 1 }));

      expect(res.status).toBe(201);
      expect(attendanceService.checkIn).toHaveBeenCalledWith(1, 1);
      expect(res.body.data).toMatchObject({ alreadyChecked: false, streakDays: 3, pointsEarned: 30 });
    });

    test('같은 날 재요청은 오류가 아니라 200으로 응답한다', async () => {
      attendanceService.checkIn.mockResolvedValue({
        alreadyChecked: true,
        attendanceDate: '2026-08-12',
        streakDays: 3,
        pointsEarned: 0,
      });

      const res = await auth(request(app).post('/api/attendance/check').send({ child_profile_id: 1 }));

      expect(res.status).toBe(200);
      expect(res.body.data.pointsEarned).toBe(0);
    });

    test('다른 유저의 자녀 프로필이면 서비스가 던진 404를 그대로 전달한다', async () => {
      const err = new Error('자녀 프로필을 찾을 수 없습니다.');
      err.statusCode = 404;
      attendanceService.checkIn.mockRejectedValue(err);

      const res = await auth(request(app).post('/api/attendance/check').send({ child_profile_id: 999 }));

      expect(res.status).toBe(404);
    });
  });

  describe('GET /:childId', () => {
    test('childId가 양의 정수가 아니면 400', async () => {
      const res = await auth(request(app).get('/api/attendance/abc'));

      expect(res.status).toBe(400);
      expect(attendanceService.getMonthly).not.toHaveBeenCalled();
    });

    test('month 형식이 잘못되면 400이고 서비스는 호출되지 않는다', async () => {
      const res = await auth(request(app).get('/api/attendance/1?month=2026-13'));

      expect(res.status).toBe(400);
      expect(attendanceService.getMonthly).not.toHaveBeenCalled();
    });

    test('month를 생략하면 서비스에 undefined로 전달한다(서비스가 이번 달로 처리)', async () => {
      attendanceService.getMonthly.mockResolvedValue({ month: '2026-08', attendedDates: [] });

      const res = await auth(request(app).get('/api/attendance/1'));

      expect(res.status).toBe(200);
      expect(attendanceService.getMonthly).toHaveBeenCalledWith(1, 1, { month: undefined });
    });

    test('month를 넘기면 그대로 서비스에 전달한다', async () => {
      attendanceService.getMonthly.mockResolvedValue({
        childProfileId: 1,
        month: '2026-06',
        attendedDates: ['2026-06-01'],
        attendedCount: 1,
        denominator: 30,
        attendanceRate: 3.3,
        currentStreak: 1,
      });

      const res = await auth(request(app).get('/api/attendance/1?month=2026-06'));

      expect(res.status).toBe(200);
      expect(attendanceService.getMonthly).toHaveBeenCalledWith(1, 1, { month: '2026-06' });
      expect(res.body.data.attendanceRate).toBe(3.3);
    });
  });
});
