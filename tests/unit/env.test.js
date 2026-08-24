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

  test('운영 환경에서 두 secret이 모두 설정되어 있으면 정상 로드되고 값을 그대로 사용한다', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_ACCESS_SECRET = 'prod-access-secret';
    process.env.JWT_REFRESH_SECRET = 'prod-refresh-secret';

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
