// 로컬 .env 값이 섞이면 "키가 없을 때" 테스트가 깨지므로 dotenv는 아무것도 읽지 않게 한다.
jest.mock('dotenv', () => ({ config: jest.fn() }));

describe('config/env', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('운영 환경(NODE_ENV=production)에서 JWT secret이 없으면 모듈 로드 시 예외를 던진다', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;

    expect(() => require('../../src/config/env')).toThrow(/JWT_ACCESS_SECRET/);
  });

  test('운영 환경에서 JWT secret이 하나만 설정되어 있어도 예외를 던진다', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_ACCESS_SECRET = 'prod-access-secret';
    delete process.env.JWT_REFRESH_SECRET;

    expect(() => require('../../src/config/env')).toThrow(/JWT_ACCESS_SECRET|JWT_REFRESH_SECRET/);
  });

  test('운영 환경에서 JWT secret은 있어도 GEMINI_API_KEY가 없으면 예외를 던진다', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_ACCESS_SECRET = 'prod-access-secret';
    process.env.JWT_REFRESH_SECRET = 'prod-refresh-secret';
    delete process.env.GEMINI_API_KEY;

    expect(() => require('../../src/config/env')).toThrow(/GEMINI_API_KEY/);
  });

  test('개발 환경에서는 GEMINI_API_KEY가 없어도 정상 로드된다', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.GEMINI_API_KEY;

    expect(() => require('../../src/config/env')).not.toThrow();
  });

  test('운영 환경에서 두 secret과 GEMINI_API_KEY가 모두 설정되어 있으면 정상 로드되고 값을 그대로 사용한다', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_ACCESS_SECRET = 'prod-access-secret';
    process.env.JWT_REFRESH_SECRET = 'prod-refresh-secret';
    process.env.GEMINI_API_KEY = 'prod-gemini-key';

    const env = require('../../src/config/env');
    expect(env.jwt.accessSecret).toBe('prod-access-secret');
    expect(env.jwt.refreshSecret).toBe('prod-refresh-secret');
  });

  test('개발 환경에서는 secret이 없어도 기본값으로 로드된다', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;

    const env = require('../../src/config/env');
    expect(env.jwt.accessSecret).toBe('access-secret-dev');
    expect(env.jwt.refreshSecret).toBe('refresh-secret-dev');
  });
});
