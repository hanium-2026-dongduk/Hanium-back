const { authenticate } = require('../../src/middlewares/auth');
const {
  generateAccessToken,
  generateRefreshToken,
  generateGuardianToken,
} = require('../../src/utils/jwt');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('middlewares/auth authenticate', () => {
  test('Authorization 헤더가 없으면 401', () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('Bearer 형식이 아니면 401', () => {
    const req = { headers: { authorization: 'Token abc' } };
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('유효한 access token이면 req.user를 설정하고 next를 호출한다', () => {
    const token = generateAccessToken({ user_id: 5, email: 'a@b.com', role: 'parent' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({ user_id: 5, email: 'a@b.com', role: 'parent' });
  });

  test('만료된 토큰이면 401과 만료 메시지를 반환한다', () => {
    const jwt = require('jsonwebtoken');
    const env = require('../../src/config/env');
    const expired = jwt.sign({ user_id: 1 }, env.jwt.accessSecret, { expiresIn: -10 });
    const req = { headers: { authorization: `Bearer ${expired}` } };
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: '토큰이 만료되었습니다.' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('refresh token으로는 인증할 수 없다 (secret 불일치)', () => {
    const token = generateRefreshToken({ user_id: 5 });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('guardian token으로는 일반 API 인증을 통과할 수 없다 (type 클레임 분리)', () => {
    // 회귀 방지: guardianToken은 accessToken과 같은 secret(accessSecret)을 쓰므로,
    // type 클레임 검사가 없으면 서명 자체는 valid하게 통과해버려 PIN 검증만으로
    // 발급된 단기 토큰이 일반 API 전체를 여는 열쇠가 되는 심각한 문제가 있었다.
    const token = generateGuardianToken({ user_id: 5 });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('변조된 토큰은 401을 반환한다', () => {
    const token = generateAccessToken({ user_id: 1, email: 'a@b.com', role: 'parent' });
    const tampered = token.slice(0, -1) + (token.slice(-1) === 'a' ? 'b' : 'a');
    const req = { headers: { authorization: `Bearer ${tampered}` } };
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
