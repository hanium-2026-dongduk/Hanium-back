const jwt = require('jsonwebtoken');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateGuardianToken,
  verifyGuardianToken,
  generateReauthToken,
  verifyReauthToken,
  isValidReauthToken,
} = require('../../src/utils/jwt');
const env = require('../../src/config/env');

describe('utils/jwt', () => {
  const payload = { user_id: 1, email: 'user@example.com', role: 'parent' };

  test('generateAccessToken은 accessSecret으로 검증 가능한 토큰을 생성한다', () => {
    const token = generateAccessToken(payload);
    const decoded = verifyAccessToken(token);

    expect(decoded.user_id).toBe(payload.user_id);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.role).toBe(payload.role);
  });

  test('generateRefreshToken은 refreshSecret으로 검증 가능한 토큰을 생성한다', () => {
    const token = generateRefreshToken({ user_id: 1 });
    const decoded = verifyRefreshToken(token);

    expect(decoded.user_id).toBe(1);
  });

  test('access token은 refresh token으로 검증되지 않는다 (secret 분리)', () => {
    const token = generateAccessToken(payload);
    expect(() => verifyRefreshToken(token)).toThrow();
  });

  test('refresh token은 access token으로 검증되지 않는다 (secret 분리)', () => {
    const token = generateRefreshToken({ user_id: 1 });
    expect(() => verifyAccessToken(token)).toThrow();
  });

  test('만료된 access token은 TokenExpiredError를 던진다', () => {
    const expired = jwt.sign(payload, env.jwt.accessSecret, { expiresIn: -10 });
    expect(() => verifyAccessToken(expired)).toThrow(jwt.TokenExpiredError);
  });

  test('서명이 위조된 토큰은 검증에 실패한다', () => {
    const token = generateAccessToken(payload);
    const tampered = token.slice(0, -1) + (token.slice(-1) === 'a' ? 'b' : 'a');
    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  describe('토큰 타입 분리 (type 클레임) — access/refresh/guardian/reauth 4종 교차 사용 전부 차단', () => {
    test('generateGuardianToken은 accessSecret으로 검증 가능하고 type:guardian, pin_version을 갖는다', () => {
      const token = generateGuardianToken({ user_id: 1, pin_version: 3 });
      const decoded = verifyGuardianToken(token);

      expect(decoded.user_id).toBe(1);
      expect(decoded.type).toBe('guardian');
      expect(decoded.pin_version).toBe(3);
    });

    test('generateReauthToken은 accessSecret으로 검증 가능하고 type:reauth를 갖는다', () => {
      const token = generateReauthToken({ user_id: 1 });
      const decoded = verifyReauthToken(token);

      expect(decoded.user_id).toBe(1);
      expect(decoded.type).toBe('reauth');
    });

    test('access token은 guardian token으로 사용할 수 없다', () => {
      const token = generateAccessToken(payload);
      expect(() => verifyGuardianToken(token)).toThrow();
    });

    test('guardian token은 access token으로 사용할 수 없다', () => {
      const token = generateGuardianToken({ user_id: 1, pin_version: 0 });
      expect(() => verifyAccessToken(token)).toThrow();
    });

    test('refresh token은 guardian token으로 사용할 수 없다', () => {
      const token = generateRefreshToken({ user_id: 1 });
      expect(() => verifyGuardianToken(token)).toThrow();
    });

    test('guardian token은 refresh token으로 사용할 수 없다', () => {
      const token = generateGuardianToken({ user_id: 1, pin_version: 0 });
      expect(() => verifyRefreshToken(token)).toThrow();
    });

    test('access token은 reauth token으로 사용할 수 없다', () => {
      const token = generateAccessToken(payload);
      expect(() => verifyReauthToken(token)).toThrow();
    });

    test('reauth token은 access token으로 사용할 수 없다', () => {
      const token = generateReauthToken({ user_id: 1 });
      expect(() => verifyAccessToken(token)).toThrow();
    });

    test('refresh token은 reauth token으로 사용할 수 없다', () => {
      const token = generateRefreshToken({ user_id: 1 });
      expect(() => verifyReauthToken(token)).toThrow();
    });

    test('reauth token은 refresh token으로 사용할 수 없다', () => {
      const token = generateReauthToken({ user_id: 1 });
      expect(() => verifyRefreshToken(token)).toThrow();
    });

    test('guardian token은 reauth token으로 사용할 수 없다', () => {
      const token = generateGuardianToken({ user_id: 1, pin_version: 0 });
      expect(() => verifyReauthToken(token)).toThrow();
    });

    test('reauth token은 guardian token으로 사용할 수 없다', () => {
      const token = generateReauthToken({ user_id: 1 });
      expect(() => verifyGuardianToken(token)).toThrow();
    });

    test('type 클레임이 없는(정책 도입 전) 토큰은 access token으로 검증되지 않는다', () => {
      const legacyToken = jwt.sign({ user_id: 1, email: 'a@b.com', role: 'parent' }, env.jwt.accessSecret, {
        expiresIn: '15m',
      });
      expect(() => verifyAccessToken(legacyToken)).toThrow();
    });

    test('type 클레임이 없는(정책 도입 전) 토큰은 refresh token으로 검증되지 않는다', () => {
      const legacyToken = jwt.sign({ user_id: 1 }, env.jwt.refreshSecret, { expiresIn: '7d' });
      expect(() => verifyRefreshToken(legacyToken)).toThrow();
    });

    test('type 클레임이 없는 토큰은 guardian/reauth token으로도 검증되지 않는다', () => {
      const legacyToken = jwt.sign({ user_id: 1 }, env.jwt.accessSecret, { expiresIn: '10m' });
      expect(() => verifyGuardianToken(legacyToken)).toThrow();
      expect(() => verifyReauthToken(legacyToken)).toThrow();
    });
  });

  describe('isValidReauthToken', () => {
    test('본인에게 발급된 유효한 reauthToken이면 true', () => {
      const token = generateReauthToken({ user_id: 5 });
      expect(isValidReauthToken(token, 5)).toBe(true);
    });

    test('다른 유저에게 발급된 토큰이면 false', () => {
      const token = generateReauthToken({ user_id: 5 });
      expect(isValidReauthToken(token, 999)).toBe(false);
    });

    test('토큰이 없으면 false', () => {
      expect(isValidReauthToken(undefined, 5)).toBe(false);
    });

    test('access token을 넣으면 false (타입 불일치)', () => {
      const token = generateAccessToken(payload);
      expect(isValidReauthToken(token, 1)).toBe(false);
    });

    test('guardian token을 넣으면 false (타입 불일치)', () => {
      const token = generateGuardianToken({ user_id: 5, pin_version: 0 });
      expect(isValidReauthToken(token, 5)).toBe(false);
    });

    test('변조된 토큰이면 false', () => {
      const token = generateReauthToken({ user_id: 5 });
      const tampered = token.slice(0, -1) + (token.slice(-1) === 'a' ? 'b' : 'a');
      expect(isValidReauthToken(tampered, 5)).toBe(false);
    });
  });
});
