const request = require('supertest');
const app = require('../../src/app');

/**
 * 보안 조치가 실제로 걸려 있는지 확인한다 (M5 — 보안 강화).
 *
 * 이런 것들은 "설정했다고 생각했는데 안 걸려 있는" 일이 잦다. 미들웨어 순서가 바뀌거나
 * 누가 `app.use`를 지워도 기능 테스트는 전부 통과하기 때문에, 응답에서 직접 확인한다.
 */
describe('보안 헤더는', () => {
  test('helmet이 기본 보안 헤더를 붙인다', async () => {
    const res = await request(app).get('/api/health');

    // 클릭재킹 방지
    expect(res.headers['x-frame-options']).toBeDefined();
    // MIME 스니핑 방지
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    // 리퍼러 유출 제한
    expect(res.headers['referrer-policy']).toBeDefined();
  });

  test('Express 기본 X-Powered-By를 감춘다', async () => {
    // 서버 스택을 알려주면 알려진 취약점을 겨냥하기 쉬워진다.
    const res = await request(app).get('/api/health');

    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('요청 본문 크기는', () => {
  test('상한을 넘으면 거부한다', async () => {
    // 큰 본문으로 메모리를 소진시키는 공격을 막는다.
    const huge = { email: 'a@b.com', password: 'x'.repeat(200 * 1024) };

    const res = await request(app).post('/api/auth/login').send(huge);

    expect(res.status).toBe(413);
  });
});

describe('에러 응답은', () => {
  test('없는 경로에 대해 공통 봉투 형식으로 답한다', async () => {
    // 예전에는 { message }만 돌려줘 "모든 응답은 봉투에 담긴다"는 계약을 404에서 어겼다.
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false });
    expect(typeof res.body.message).toBe('string');
  });

  test('스택트레이스를 노출하지 않는다', async () => {
    const res = await request(app).get('/api/does-not-exist');

    expect(res.body.stack).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/at .+ \(.+:\d+:\d+\)/);
  });

  test('검증 실패도 봉투 형식을 지킨다', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('처리되지 않은 오류는', () => {
  const env = require('../../src/config/env');
  const { errorHandler } = require('../../src/middlewares/errorHandler');

  /** errorHandler를 직접 부르기 위한 최소 응답 객체. */
  const fakeRes = () => {
    const res = { statusCode: null, body: null };
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (body) => {
      res.body = body;
      return res;
    };
    return res;
  };

  const fakeReq = { method: 'GET', originalUrl: '/api/x' };

  let errorSpy;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  test('운영에서는 내부 메시지를 감춘다', () => {
    // Sequelize·드라이버 원문에는 테이블·컬럼명과 SQL 조각이 들어 있어 스키마가 샌다.
    const original = env.isProduction;
    env.isProduction = true;

    const res = fakeRes();
    errorHandler(new Error("Unknown column 'users.secret_col' in 'field list'"), fakeReq, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe('서버 오류가 발생했습니다.');
    expect(res.body.message).not.toMatch(/secret_col/);

    env.isProduction = original;
  });

  test('개발에서는 원인을 볼 수 있게 그대로 보여준다', () => {
    const original = env.isProduction;
    env.isProduction = false;

    const res = fakeRes();
    errorHandler(new Error('구체적인 원인'), fakeReq, res);

    expect(res.body.message).toBe('구체적인 원인');

    env.isProduction = original;
  });

  test('어느 경우든 서버 로그에는 전문을 남긴다', () => {
    const res = fakeRes();
    errorHandler(new Error('원인'), fakeReq, res);

    expect(errorSpy).toHaveBeenCalled();
  });

  test('서비스가 의도적으로 던진 오류(4xx)는 메시지를 그대로 보여준다', () => {
    const original = env.isProduction;
    env.isProduction = true;

    const res = fakeRes();
    const known = Object.assign(new Error('이미 가입된 이메일입니다.'), { statusCode: 409 });
    errorHandler(known, fakeReq, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe('이미 가입된 이메일입니다.');

    env.isProduction = original;
  });
});

describe('요청 제한기는', () => {
  test('한도를 넘으면 429와 공통 봉투 형식으로 답한다', async () => {
    // app에 붙은 제한기는 테스트에서 꺼져 있다(supertest가 같은 IP로 수십 번 호출하므로).
    // 여기서는 skip()이 걸리지 않는 상태로 새로 만들어 동작 자체를 확인한다.
    const express = require('express');
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    jest.resetModules();
    const { createLimiter: freshLimiter } = require('../../src/middlewares/rateLimit');

    const live = express();
    live.use('/limited', freshLimiter({ windowMs: 60_000, max: 2, message: '너무 잦습니다.' }));
    live.get('/limited', (req, res) => res.json({ ok: true }));

    expect((await request(live).get('/limited')).status).toBe(200);
    expect((await request(live).get('/limited')).status).toBe(200);

    const blocked = await request(live).get('/limited');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ success: false, message: '너무 잦습니다.' });

    process.env.NODE_ENV = original;
    jest.resetModules();
  });
});
