describe('server.js start()', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.dontMock('../../src/config/database');
    jest.dontMock('../../src/app');
    jest.dontMock('../../src/config/env');
    // start()가 process에 등록한 시그널 리스너는 모듈을 리셋해도 남는다.
    // 지우지 않으면 다음 테스트에서 SIGTERM을 쏠 때 앞 테스트의 리스너까지 함께 발동한다.
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
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

  test('종료 신호를 받으면 서버를 닫고 DB 연결을 정리한 뒤 0으로 종료한다', async () => {
    // PM2 reload는 옛 워커에 SIGINT를 보낸다. 이 처리가 없으면 진행 중이던 요청이 끊긴다.
    const closeMock = jest.fn();
    jest.doMock('../../src/config/database', () => ({
      authenticate: jest.fn().mockResolvedValue(undefined),
      close: closeMock.mockResolvedValue(undefined),
    }));
    // listen이 돌려주는 서버 객체의 close(cb)를 즉시 콜백해 "요청이 다 끝난" 상황을 만든다.
    const serverClose = jest.fn((cb) => cb());
    jest.doMock('../../src/app', () => ({
      listen: jest.fn((port, cb) => {
        if (cb) cb();
        return { close: serverClose };
      }),
    }));
    jest.doMock('../../src/config/env', () => ({ port: 4000 }));
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    const { start } = require('../../src/server');
    await start();

    process.emit('SIGTERM');
    // shutdown 안의 await가 풀리도록 한 틱 넘긴다.
    await new Promise((resolve) => setImmediate(resolve));

    expect(serverClose).toHaveBeenCalled();
    expect(closeMock).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);

  });

  test('리스닝을 시작하면 PM2에 ready 신호를 보낸다', async () => {
    // wait_ready와 짝을 이룬다. 이 신호가 없으면 PM2가 reload 중 모든 워커를 동시에 죽인다.
    jest.doMock('../../src/config/database', () => ({
      authenticate: jest.fn().mockResolvedValue(undefined),
      close: jest.fn(),
    }));
    jest.doMock('../../src/app', () => ({
      listen: jest.fn((port, cb) => {
        if (cb) cb();
        return { close: jest.fn() };
      }),
    }));
    jest.doMock('../../src/config/env', () => ({ port: 4000 }));

    const original = process.send;
    const sendMock = jest.fn();
    process.send = sendMock;

    const { start } = require('../../src/server');
    await start();

    expect(sendMock).toHaveBeenCalledWith('ready');

    process.send = original;
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
