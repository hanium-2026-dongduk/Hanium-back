jest.mock('../../src/services/guardian.service', () => ({
  isGuardianTokenValid: jest.fn(),
}));

const { requireGuardianToken } = require('../../src/middlewares/guardianAuth');
const { isGuardianTokenValid } = require('../../src/services/guardian.service');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

/**
 * 이 미들웨어의 실제 판단 로직(서명/타입/유저 일치/DB pin_version 일치 여부)은
 * guardian.service.js의 isGuardianTokenValid()가 전담하며, 그 세부 시나리오(변조,
 * 타인 토큰, 타입 불일치, PIN 변경 후 구버전 무효화 등)는 guardian.service.test.js에서
 * 이미 검증한다. 여기서는 미들웨어가 그 함수의 결과에 따라 올바르게 403/next를
 * 분기하는지 "배선"만 확인한다.
 */
describe('middlewares/guardianAuth requireGuardianToken', () => {
  beforeEach(() => {
    isGuardianTokenValid.mockReset();
  });

  test('X-Guardian-Token 헤더가 없으면 isGuardianTokenValid(undefined, userId)로 호출되고, false면 403', async () => {
    isGuardianTokenValid.mockResolvedValue(false);
    const req = { headers: {}, user: { user_id: 1 } };
    const res = mockRes();
    const next = jest.fn();

    await requireGuardianToken(req, res, next);

    expect(isGuardianTokenValid).toHaveBeenCalledWith(undefined, 1);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('isGuardianTokenValid가 false를 반환하면(무효/변조/버전 불일치/타인 토큰 등 사유 불문) 403', async () => {
    isGuardianTokenValid.mockResolvedValue(false);
    const req = { headers: { 'x-guardian-token': 'some.jwt.token' }, user: { user_id: 1 } };
    const res = mockRes();
    const next = jest.fn();

    await requireGuardianToken(req, res, next);

    expect(isGuardianTokenValid).toHaveBeenCalledWith('some.jwt.token', 1);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('isGuardianTokenValid가 true를 반환하면 next를 호출하고 응답을 건드리지 않는다', async () => {
    isGuardianTokenValid.mockResolvedValue(true);
    const req = { headers: { 'x-guardian-token': 'valid.jwt.token' }, user: { user_id: 1 } };
    const res = mockRes();
    const next = jest.fn();

    await requireGuardianToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('req.user.user_id를 그대로 isGuardianTokenValid에 전달한다 (다른 유저로 오검증되지 않도록)', async () => {
    isGuardianTokenValid.mockResolvedValue(true);
    const req = { headers: { 'x-guardian-token': 'token' }, user: { user_id: 42 } };
    const res = mockRes();
    const next = jest.fn();

    await requireGuardianToken(req, res, next);

    expect(isGuardianTokenValid).toHaveBeenCalledWith('token', 42);
  });
});
