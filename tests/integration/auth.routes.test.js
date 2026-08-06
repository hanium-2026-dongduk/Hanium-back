jest.mock('../../src/services/auth.service');

const request = require('supertest');
const authService = require('../../src/services/auth.service');
const { generateAccessToken } = require('../../src/utils/jwt');
const app = require('../../src/app');

describe('POST /api/auth/signup', () => {
  test('입력값이 유효하지 않으면 400과 함께 서비스가 호출되지 않는다', async () => {
    const res = await request(app).post('/api/auth/signup').send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(authService.signup).not.toHaveBeenCalled();
  });

  test('유효한 입력이면 서비스 결과를 201로 반환한다', async () => {
    authService.signup.mockResolvedValue({ user_id: 1, email: 'user@example.com' });

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'user@example.com', password: 'abcd1234!' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('user@example.com');
  });

  test('서비스에서 statusCode가 있는 에러를 던지면 그대로 응답한다', async () => {
    const err = new Error('이미 사용 중인 이메일입니다.');
    err.statusCode = 409;
    authService.signup.mockRejectedValue(err);

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'user@example.com', password: 'abcd1234!' });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('이미 사용 중인 이메일입니다.');
  });
});

describe('비밀번호 정책 (SC01_PWD_01: 영문+숫자+특수문자, 8자 이상)', () => {
  test('회원가입: 특수문자가 없는 비밀번호는 400이고 서비스는 호출되지 않는다', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'user@example.com', password: 'abcd1234' });

    expect(res.status).toBe(400);
    expect(authService.signup).not.toHaveBeenCalled();
  });

  test('회원가입: 정책에 맞는 비밀번호는 통과한다', async () => {
    authService.signup.mockResolvedValue({ user_id: 1, email: 'user@example.com' });

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'user@example.com', password: 'abcd1234!' });

    expect(res.status).toBe(201);
    expect(authService.signup).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'abcd1234!',
    });
  });

  test('비밀번호 재설정: 특수문자가 없는 새 비밀번호는 400이고 서비스는 호출되지 않는다', async () => {
    const res = await request(app).put('/api/auth/password/reset').send({
      email: 'user@example.com',
      code: '123456',
      newPassword: 'abcd1234',
    });

    expect(res.status).toBe(400);
    expect(authService.passwordReset).not.toHaveBeenCalled();
  });

  test('비밀번호 재설정: 정책에 맞는 새 비밀번호는 통과한다', async () => {
    authService.passwordReset.mockResolvedValue({ message: '비밀번호가 재설정되었습니다.' });

    const res = await request(app).put('/api/auth/password/reset').send({
      email: 'user@example.com',
      code: '123456',
      newPassword: 'abcd1234!',
    });

    expect(res.status).toBe(200);
    expect(authService.passwordReset).toHaveBeenCalledWith('user@example.com', '123456', 'abcd1234!');
  });
});

describe('POST /api/auth/email/verify', () => {
  test('코드가 6자리 숫자가 아니면 400', async () => {
    const res = await request(app)
      .post('/api/auth/email/verify')
      .send({ email: 'user@example.com', code: 'abc' });

    expect(res.status).toBe(400);
    expect(authService.verifyEmail).not.toHaveBeenCalled();
  });

  test('시도 횟수 초과(429)를 그대로 전달한다', async () => {
    const err = new Error('시도 횟수를 초과했습니다. 인증번호를 다시 요청해주세요.');
    err.statusCode = 429;
    authService.verifyEmail.mockRejectedValue(err);

    const res = await request(app)
      .post('/api/auth/email/verify')
      .send({ email: 'user@example.com', code: '123456' });

    expect(res.status).toBe(429);
  });
});

describe('POST /api/auth/login', () => {
  test('비밀번호가 비어있으면 400', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'user@example.com' });

    expect(res.status).toBe(400);
    expect(authService.login).not.toHaveBeenCalled();
  });

  test('로그인 성공 시 토큰과 사용자 정보를 반환한다', async () => {
    authService.login.mockResolvedValue({
      accessToken: 'access.token',
      refreshToken: 'refresh.token',
      user: { user_id: 1, email: 'user@example.com' },
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'abcd1234' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBe('access.token');
    expect(res.body.data.refreshToken).toBe('refresh.token');
  });

  test('인증 실패(401)를 그대로 전달한다', async () => {
    const err = new Error('이메일 또는 비밀번호가 올바르지 않습니다.');
    err.statusCode = 401;
    authService.login.mockRejectedValue(err);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'wrong' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  test('refreshToken이 없으면 400', async () => {
    const res = await request(app).post('/api/auth/logout').send({});

    expect(res.status).toBe(400);
    expect(authService.logout).not.toHaveBeenCalled();
  });

  test('정상 로그아웃 시 200', async () => {
    authService.logout.mockResolvedValue({ message: '로그아웃되었습니다.' });

    const res = await request(app).post('/api/auth/logout').send({ refreshToken: 'r.t' });

    expect(res.status).toBe(200);
  });
});

describe('POST /api/auth/refresh', () => {
  test('refreshToken이 없으면 400', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});

    expect(res.status).toBe(400);
    expect(authService.refresh).not.toHaveBeenCalled();
  });

  test('정상 갱신 시 회전된 accessToken/refreshToken을 모두 반환한다', async () => {
    authService.refresh.mockResolvedValue({
      accessToken: 'new.access',
      refreshToken: 'new.refresh',
    });

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'old.refresh' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBe('new.access');
    expect(res.body.data.refreshToken).toBe('new.refresh');
  });

  test('폐기된 refresh token이면 401을 그대로 전달한다', async () => {
    const err = new Error('유효하지 않은 리프레시 토큰입니다.');
    err.statusCode = 401;
    authService.refresh.mockRejectedValue(err);

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'used.token' });

    expect(res.status).toBe(401);
  });
});

describe('AU03 — ID 찾기(이름 기반 조회)는 제거되었고 이메일 기반 비밀번호 재설정만 남는다', () => {
  test('POST /api/auth/find-email 라우트는 더 이상 존재하지 않는다 (404)', async () => {
    const res = await request(app).post('/api/auth/find-email').send({ child_name: '홍길동' });

    expect(res.status).toBe(404);
  });

  test('POST /api/auth/password/reset-request: 이메일 형식이 아니면 400', async () => {
    const res = await request(app)
      .post('/api/auth/password/reset-request')
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(authService.passwordResetRequest).not.toHaveBeenCalled();
  });

  test('PUT /api/auth/password/reset: 정상 요청은 서비스 결과를 그대로 반환한다', async () => {
    authService.passwordReset.mockResolvedValue({ message: '비밀번호가 재설정되었습니다.' });

    const res = await request(app).put('/api/auth/password/reset').send({
      email: 'user@example.com',
      code: '123456',
      newPassword: 'abcd1234!',
    });

    expect(res.status).toBe(200);
    expect(authService.passwordReset).toHaveBeenCalledWith('user@example.com', '123456', 'abcd1234!');
  });
});

describe('인증 미들웨어가 적용된 보호된 라우트 (/api/children)', () => {
  test('Authorization 헤더가 없으면 401', async () => {
    const res = await request(app).get('/api/children');

    expect(res.status).toBe(401);
  });

  test('유효한 access token이 있으면 인증 미들웨어를 통과한다', async () => {
    const token = generateAccessToken({ user_id: 1, email: 'a@b.com', role: 'parent' });

    const res = await request(app).get('/api/children').set('Authorization', `Bearer ${token}`);

    // child 컨트롤러/서비스 자체는 이번 작업 범위가 아니므로,
    // 미들웨어를 통과해 401이 아닌 다른 응답(2xx/DB 에러 등)이 오는지만 확인한다.
    expect(res.status).not.toBe(401);
  });
});
