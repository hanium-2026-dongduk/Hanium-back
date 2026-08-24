describe('server.js start()', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.dontMock('../../src/config/database');
    jest.dontMock('../../src/app');
    jest.dontMock('../../src/config/env');
  });

  test('DB 연결 성공 시 app.listen이 호출된다', async () => {
    jest.doMock('../../src/config/database', () => ({
      authenticate: jest.fn().mockResolvedValue(undefined),
    }));
    const listenMock = jest.fn((port, cb) => cb && cb());
    jest.doMock('../../src/app', () => ({ listen: listenMock }));
    jest.doMock('../../src/config/env', () => ({ port: 4000 }));

    const { start } = require('../../src/server');
    await start();

    expect(listenMock).toHaveBeenCalledWith(4000, expect.any(Function));
  });

  test('DB 연결 실패 시 서버를 리스닝하지 않고 process.exit(1)로 종료한다', async () => {
    jest.doMock('../../src/config/database', () => ({
      authenticate: jest.fn().mockRejectedValue(new Error('connection failed')),
    }));
    const listenMock = jest.fn();
    jest.doMock('../../src/app', () => ({ listen: listenMock }));
    jest.doMock('../../src/config/env', () => ({ port: 4000 }));
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    const { start } = require('../../src/server');
    await start();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(listenMock).not.toHaveBeenCalled();
  });
});
