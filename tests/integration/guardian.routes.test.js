jest.mock('../../src/services/guardian.service');

const request = require('supertest');
const guardianService = require('../../src/services/guardian.service');
const {
  generateAccessToken,
  generateGuardianToken,
  generateRefreshToken,
  generateReauthToken,
} = require('../../src/utils/jwt');
const app = require('../../src/app');

const userId = 1;
const token = generateAccessToken({ user_id: userId, email: 'a@b.com', role: 'parent' });
const auth = (req) => req.set('Authorization', `Bearer ${token}`);

describe('/api/guardian', () => {
  beforeEach(() => {
    guardianService.isGuardianTokenValid.mockReset();
  });

  describe('POST /pin/verify', () => {
    test('PIN hash는 응답 어디에도 포함되지 않는다', async () => {
      guardianService.verifyPin.mockResolvedValue({
        verified: true,
        guardianToken: 'guardian.jwt.token',
        expiresIn: '10m',
      });

      const res = await auth(request(app).post('/api/guardian/pin/verify').send({ pin: '1234' }));

      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toMatch(/hash/i);
      expect(res.body.data.guardianToken).toBe('guardian.jwt.token');
    });

    test('잠금(429) 상태를 그대로 전달한다', async () => {
      const err = new Error('PIN 시도 횟수를 초과하여 잠겼습니다. 잠시 후 다시 시도해주세요.');
      err.statusCode = 429;
      guardianService.verifyPin.mockRejectedValue(err);

      const res = await auth(request(app).post('/api/guardian/pin/verify').send({ pin: '0000' }));

      expect(res.status).toBe(429);
    });
  });

  describe('POST /reauth (비밀번호 재인증)', () => {
    test('password가 없으면 400이고 서비스는 호출되지 않는다', async () => {
      const res = await auth(request(app).post('/api/guardian/reauth').send({}));

      expect(res.status).toBe(400);
      expect(guardianService.requestReauth).not.toHaveBeenCalled();
    });

    test('올바른 비밀번호면 reauthToken을 반환한다', async () => {
      guardianService.requestReauth.mockResolvedValue({ reauthToken: 'reauth.jwt.token', expiresIn: '10m' });

      const res = await auth(request(app).post('/api/guardian/reauth').send({ password: 'account-pw' }));

      expect(res.status).toBe(200);
      expect(guardianService.requestReauth).toHaveBeenCalledWith(userId, 'account-pw');
      expect(res.body.data.reauthToken).toBe('reauth.jwt.token');
    });

    test('틀린 비밀번호(401)를 그대로 전달한다', async () => {
      const err = new Error('비밀번호가 일치하지 않습니다.');
      err.statusCode = 401;
      guardianService.requestReauth.mockRejectedValue(err);

      const res = await auth(request(app).post('/api/guardian/reauth').send({ password: 'wrong' }));

      expect(res.status).toBe(401);
    });

    test('잠금(429)을 그대로 전달한다', async () => {
      const err = new Error('비밀번호 확인 시도 횟수를 초과하여 잠겼습니다. 잠시 후 다시 시도해주세요.');
      err.statusCode = 429;
      guardianService.requestReauth.mockRejectedValue(err);

      const res = await auth(request(app).post('/api/guardian/reauth').send({ password: 'wrong' }));

      expect(res.status).toBe(429);
    });
  });

  describe('GET /settings', () => {
    test('parent_pin_hash가 응답에 포함되지 않는다', async () => {
      guardianService.getSettings.mockResolvedValue({
        setting_id: 1,
        user_id: userId,
        daily_usage_limit_minutes: 60,
        push_enabled: true,
        has_pin: true,
      });

      const res = await auth(request(app).get('/api/guardian/settings'));

      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toMatch(/pin_hash/i);
    });
  });

  describe('PUT /settings (보호자 전용 게이트 — isGuardianTokenValid에 위임)', () => {
    test('X-Guardian-Token 헤더가 없으면 isGuardianTokenValid(undefined, userId)로 호출되고, false면 403', async () => {
      guardianService.isGuardianTokenValid.mockResolvedValue(false);

      const res = await auth(
        request(app).put('/api/guardian/settings').send({ daily_usage_limit_minutes: 30 })
      );

      expect(guardianService.isGuardianTokenValid).toHaveBeenCalledWith(undefined, userId);
      expect(res.status).toBe(403);
      expect(guardianService.updateSettings).not.toHaveBeenCalled();
    });

    test('isGuardianTokenValid가 false면(무효/변조/버전불일치/타인토큰 등 사유 불문) 403', async () => {
      guardianService.isGuardianTokenValid.mockResolvedValue(false);

      const res = await auth(
        request(app)
          .put('/api/guardian/settings')
          .set('X-Guardian-Token', 'whatever-token')
          .send({ daily_usage_limit_minutes: 30 })
      );

      expect(guardianService.isGuardianTokenValid).toHaveBeenCalledWith('whatever-token', userId);
      expect(res.status).toBe(403);
      expect(guardianService.updateSettings).not.toHaveBeenCalled();
    });

    test('isGuardianTokenValid가 true면 통과해 서비스를 호출한다', async () => {
      guardianService.isGuardianTokenValid.mockResolvedValue(true);
      guardianService.updateSettings.mockResolvedValue({ daily_usage_limit_minutes: 30 });

      const res = await auth(
        request(app)
          .put('/api/guardian/settings')
          .set('X-Guardian-Token', 'valid-token')
          .send({ daily_usage_limit_minutes: 30 })
      );

      expect(res.status).toBe(200);
      expect(guardianService.updateSettings).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ daily_usage_limit_minutes: 30 })
      );
    });
  });

  describe('PUT /pin (PIN 설정/변경 — currentPin/password 완전 제거, guardianToken/reauthToken만 허용)', () => {
    test('X-Guardian-Token, X-Reauth-Token 헤더를 그대로 서비스에 전달한다 (password 필드는 더 이상 없음)', async () => {
      guardianService.setPin.mockResolvedValue({ message: 'PIN이 설정되었습니다.' });

      const res = await auth(
        request(app)
          .put('/api/guardian/pin')
          .set('X-Guardian-Token', 'some.guardian.token')
          .set('X-Reauth-Token', 'some.reauth.token')
          .send({ pin: '4321' })
      );

      expect(res.status).toBe(200);
      expect(guardianService.setPin).toHaveBeenCalledWith(userId, {
        pin: '4321',
        guardianToken: 'some.guardian.token',
        reauthToken: 'some.reauth.token',
      });
    });

    test('헤더가 없으면 guardianToken/reauthToken 모두 undefined로 전달된다', async () => {
      guardianService.setPin.mockResolvedValue({ message: 'PIN이 설정되었습니다.' });

      const res = await auth(request(app).put('/api/guardian/pin').send({ pin: '4321' }));

      expect(res.status).toBe(200);
      expect(guardianService.setPin).toHaveBeenCalledWith(userId, {
        pin: '4321',
        guardianToken: undefined,
        reauthToken: undefined,
      });
    });

    test('body에 password/currentPin을 보내도 서비스로 전달되지 않는다 (더 이상 지원하지 않는 필드)', async () => {
      guardianService.setPin.mockResolvedValue({ message: 'PIN이 설정되었습니다.' });

      const res = await auth(
        request(app)
          .put('/api/guardian/pin')
          .send({ pin: '4321', currentPin: '1111', password: 'account-pw' })
      );

      expect(res.status).toBe(200);
      expect(guardianService.setPin).toHaveBeenCalledWith(userId, {
        pin: '4321',
        guardianToken: undefined,
        reauthToken: undefined,
      });
    });

    test('서비스가 재인증 실패(401)를 던지면(access token만으로는 최초 설정도 불가) 그대로 전달한다', async () => {
      const err = new Error(
        'PIN을 설정/변경하려면 보호자 인증(PIN 확인) 또는 비밀번호 재인증(POST /api/guardian/reauth)이 필요합니다.'
      );
      err.statusCode = 401;
      guardianService.setPin.mockRejectedValue(err);

      const res = await auth(request(app).put('/api/guardian/pin').send({ pin: '4321' }));

      expect(res.status).toBe(401);
    });
  });

  describe('토큰 타입 분리 — Authorization: Bearer 오용 차단 (authenticate 미들웨어, 실제 jwt 검증)', () => {
    test('guardianToken을 Authorization: Bearer로 사용하면 401', async () => {
      const guardianToken = generateGuardianToken({ user_id: userId, pin_version: 0 });

      const res = await request(app)
        .get('/api/guardian/settings')
        .set('Authorization', `Bearer ${guardianToken}`);

      expect(res.status).toBe(401);
    });

    test('refresh token을 Authorization: Bearer로 사용하면 401', async () => {
      const refreshToken = generateRefreshToken({ user_id: userId });

      const res = await request(app)
        .get('/api/guardian/settings')
        .set('Authorization', `Bearer ${refreshToken}`);

      expect(res.status).toBe(401);
    });

    test('reauthToken을 Authorization: Bearer로 사용하면 401', async () => {
      const reauthToken = generateReauthToken({ user_id: userId });

      const res = await request(app)
        .get('/api/guardian/settings')
        .set('Authorization', `Bearer ${reauthToken}`);

      expect(res.status).toBe(401);
    });
  });

  test('인증 토큰이 없으면 401', async () => {
    const res = await request(app).get('/api/guardian/settings');
    expect(res.status).toBe(401);
  });
});
