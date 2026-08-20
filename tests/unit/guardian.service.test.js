jest.mock('../../src/models', () => ({
  GuardianSetting: { findOne: jest.fn(), create: jest.fn() },
  User: { findByPk: jest.fn() },
  sequelize: {
    transaction: jest.fn((cb) => cb({ LOCK: { UPDATE: 'UPDATE' } })),
  },
}));

const bcrypt = require('bcrypt');
const { GuardianSetting, User, sequelize } = require('../../src/models');
const { generateGuardianToken, generateReauthToken } = require('../../src/utils/jwt');
const guardianService = require('../../src/services/guardian.service');

const buildSetting = (overrides = {}) => ({
  user_id: 1,
  parent_pin_hash: null,
  pin_failed_attempts: 0,
  pin_locked_until: null,
  pin_version: 0,
  reauth_failed_attempts: 0,
  reauth_locked_until: null,
  save: jest.fn().mockResolvedValue(undefined),
  update: jest.fn().mockResolvedValue(undefined),
  toJSON() {
    const rest = { ...this };
    delete rest.save;
    delete rest.update;
    delete rest.toJSON;
    return rest;
  },
  ...overrides,
});

describe('guardian.service', () => {
  describe('setPin (권한 상승 차단 — 최초 설정도 항상 재인증 필요)', () => {
    test('최초 설정: reauthToken이 유효하면 성공하고 pin_version이 증가한다', async () => {
      const setting = buildSetting({ parent_pin_hash: null, pin_version: 0 });
      GuardianSetting.findOne.mockResolvedValue(setting);
      const reauthToken = generateReauthToken({ user_id: 1 });

      await guardianService.setPin(1, { pin: '1234', reauthToken });

      expect(setting.save).toHaveBeenCalledTimes(1);
      expect(setting.parent_pin_hash).not.toBeNull();
      expect(setting.pin_version).toBe(1);
    });

    test('[권한 상승 차단] 최초 설정: reauthToken/guardianToken이 전혀 없으면 401이고 PIN을 설정하지 않는다', async () => {
      const setting = buildSetting({ parent_pin_hash: null, pin_version: 0 });
      GuardianSetting.findOne.mockResolvedValue(setting);

      await expect(guardianService.setPin(1, { pin: '1234' })).rejects.toMatchObject({ statusCode: 401 });
      expect(setting.save).not.toHaveBeenCalled();
      expect(setting.parent_pin_hash).toBeNull();
    });

    test('기존 PIN 변경: 현재 pin_version과 일치하는 guardianToken이면 성공하고 pin_version이 증가한다', async () => {
      const setting = buildSetting({ parent_pin_hash: 'oldhash', pin_version: 2 });
      GuardianSetting.findOne.mockResolvedValue(setting);
      const guardianToken = generateGuardianToken({ user_id: 1, pin_version: 2 });

      await guardianService.setPin(1, { pin: '5678', guardianToken });

      expect(setting.save).toHaveBeenCalledTimes(1);
      expect(setting.pin_version).toBe(3);
      const isNewHash = await bcrypt.compare('5678', setting.parent_pin_hash);
      expect(isNewHash).toBe(true);
    });

    test('[pin_version 무효화] pin_version이 DB와 다른(=구버전) guardianToken은 거부된다', async () => {
      const setting = buildSetting({ parent_pin_hash: 'oldhash', pin_version: 3 });
      GuardianSetting.findOne.mockResolvedValue(setting);
      const staleGuardianToken = generateGuardianToken({ user_id: 1, pin_version: 2 });

      await expect(
        guardianService.setPin(1, { pin: '5678', guardianToken: staleGuardianToken })
      ).rejects.toMatchObject({ statusCode: 401 });
      expect(setting.save).not.toHaveBeenCalled();
    });

    test('guardianToken이 무효해도 유효한 reauthToken이 있으면 변경할 수 있다', async () => {
      const setting = buildSetting({ parent_pin_hash: 'oldhash', pin_version: 1 });
      GuardianSetting.findOne.mockResolvedValue(setting);
      const reauthToken = generateReauthToken({ user_id: 1 });

      await guardianService.setPin(1, { pin: '9999', guardianToken: 'garbage', reauthToken });

      expect(setting.save).toHaveBeenCalledTimes(1);
      expect(setting.pin_version).toBe(2);
    });

    test('guardianToken/reauthToken 둘 다 없거나 무효하면 401을 던지고 변경하지 않는다', async () => {
      const setting = buildSetting({ parent_pin_hash: 'oldhash', pin_version: 1 });
      GuardianSetting.findOne.mockResolvedValue(setting);

      await expect(guardianService.setPin(1, { pin: '9999' })).rejects.toMatchObject({
        statusCode: 401,
      });
      expect(setting.save).not.toHaveBeenCalled();
      expect(setting.parent_pin_hash).toBe('oldhash');
    });

    test('다른 유저에게 발급된 guardianToken/reauthToken으로는 변경할 수 없다', async () => {
      const setting = buildSetting({ parent_pin_hash: 'oldhash', pin_version: 1 });
      GuardianSetting.findOne.mockResolvedValue(setting);
      const othersGuardianToken = generateGuardianToken({ user_id: 999, pin_version: 1 });
      const othersReauthToken = generateReauthToken({ user_id: 999 });

      await expect(
        guardianService.setPin(1, {
          pin: '9999',
          guardianToken: othersGuardianToken,
          reauthToken: othersReauthToken,
        })
      ).rejects.toMatchObject({ statusCode: 401 });
      expect(setting.save).not.toHaveBeenCalled();
    });

    test('currentPin 필드는 더 이상 지원하지 않는다 — 정답을 보내도 재인증 수단으로 쓰이지 않는다', async () => {
      const setting = buildSetting({ parent_pin_hash: 'oldhash', pin_version: 1 });
      GuardianSetting.findOne.mockResolvedValue(setting);

      await expect(
        guardianService.setPin(1, { pin: '9999', currentPin: '1111' })
      ).rejects.toMatchObject({ statusCode: 401 });
      expect(setting.save).not.toHaveBeenCalled();
      expect(setting.pin_failed_attempts).toBe(0);
    });

    test('password 필드는 더 이상 지원하지 않는다 — 계정 비밀번호를 직접 보내도 소용없고 비교 시도조차 하지 않는다', async () => {
      const setting = buildSetting({ parent_pin_hash: 'oldhash', pin_version: 1 });
      GuardianSetting.findOne.mockResolvedValue(setting);

      await expect(
        guardianService.setPin(1, { pin: '9999', password: 'account-password' })
      ).rejects.toMatchObject({ statusCode: 401 });
      expect(setting.save).not.toHaveBeenCalled();
      expect(User.findByPk).not.toHaveBeenCalled();
    });
  });

  describe('verifyPin', () => {
    test('PIN이 설정되지 않았으면 400을 던진다', async () => {
      GuardianSetting.findOne.mockResolvedValue(buildSetting({ parent_pin_hash: null }));

      await expect(guardianService.verifyPin(1, '1234')).rejects.toMatchObject({ statusCode: 400 });
    });

    test('정답이면 verified:true와 guardianToken을 반환하고 hash는 노출하지 않는다', async () => {
      const hash = await bcrypt.hash('1234', 10);
      GuardianSetting.findOne.mockResolvedValue(buildSetting({ parent_pin_hash: hash, pin_version: 1 }));

      const result = await guardianService.verifyPin(1, '1234');

      expect(result.verified).toBe(true);
      expect(typeof result.guardianToken).toBe('string');
      expect(JSON.stringify(result)).not.toContain(hash);
    });

    test('발급된 guardianToken에는 현재 pin_version이 실린다', async () => {
      const hash = await bcrypt.hash('1234', 10);
      GuardianSetting.findOne.mockResolvedValue(buildSetting({ parent_pin_hash: hash, pin_version: 7 }));

      const result = await guardianService.verifyPin(1, '1234');

      const jwt = require('jsonwebtoken');
      const decoded = jwt.decode(result.guardianToken);
      expect(decoded.pin_version).toBe(7);
    });

    test('오답이면 401을 던지고 실패 횟수를 증가시킨다', async () => {
      const hash = await bcrypt.hash('1234', 10);
      const setting = buildSetting({ parent_pin_hash: hash });
      GuardianSetting.findOne.mockResolvedValue(setting);

      await expect(guardianService.verifyPin(1, '0000')).rejects.toMatchObject({ statusCode: 401 });
      expect(setting.pin_failed_attempts).toBe(1);
      expect(setting.save).toHaveBeenCalledTimes(1);
    });

    test('5회 연속 오답 시 잠기고(429) pin_locked_until이 설정된다', async () => {
      const hash = await bcrypt.hash('1234', 10);
      const setting = buildSetting({ parent_pin_hash: hash, pin_failed_attempts: 4 });
      GuardianSetting.findOne.mockResolvedValue(setting);

      await expect(guardianService.verifyPin(1, '0000')).rejects.toMatchObject({ statusCode: 429 });
      expect(setting.pin_locked_until).not.toBeNull();
    });

    test('잠긴 상태에서는 정답을 입력해도 429를 반환한다', async () => {
      const hash = await bcrypt.hash('1234', 10);
      const setting = buildSetting({
        parent_pin_hash: hash,
        pin_locked_until: new Date(Date.now() + 60 * 1000),
      });
      GuardianSetting.findOne.mockResolvedValue(setting);

      await expect(guardianService.verifyPin(1, '1234')).rejects.toMatchObject({ statusCode: 429 });
    });

    test('성공 시 실패 카운터와 잠금을 초기화한다', async () => {
      const hash = await bcrypt.hash('1234', 10);
      const setting = buildSetting({ parent_pin_hash: hash, pin_failed_attempts: 3 });
      GuardianSetting.findOne.mockResolvedValue(setting);

      await guardianService.verifyPin(1, '1234');

      expect(setting.pin_failed_attempts).toBe(0);
      expect(setting.pin_locked_until).toBeNull();
    });

    test('동시에 여러 개의 오답 요청이 들어와도 실패 횟수가 하나도 유실되지 않는다 (row lock 시뮬레이션)', async () => {
      const hash = await bcrypt.hash('1234', 10);
      const setting = buildSetting({ parent_pin_hash: hash });
      GuardianSetting.findOne.mockImplementation(() => Promise.resolve(setting));

      let queue = Promise.resolve();
      sequelize.transaction.mockImplementation((cb) => {
        const run = queue.then(() => cb({ LOCK: { UPDATE: 'UPDATE' } }));
        queue = run.catch(() => {});
        return run;
      });

      try {
        const attempts = 5;
        const results = await Promise.allSettled(
          Array.from({ length: attempts }, () => guardianService.verifyPin(1, '0000'))
        );

        expect(results.every((r) => r.status === 'rejected')).toBe(true);
        expect(setting.pin_failed_attempts).toBe(attempts);
        expect(setting.pin_locked_until).not.toBeNull();

        await expect(guardianService.verifyPin(1, '1234')).rejects.toMatchObject({
          statusCode: 429,
        });
      } finally {
        sequelize.transaction.mockImplementation((cb) => cb({ LOCK: { UPDATE: 'UPDATE' } }));
      }
    });
  });

  describe('isGuardianTokenValid (미들웨어/서비스 공용 검증 함수)', () => {
    test('타입이 유효하고 pin_version이 DB와 일치하면 true', async () => {
      GuardianSetting.findOne.mockResolvedValue(buildSetting({ pin_version: 4 }));
      const token = generateGuardianToken({ user_id: 1, pin_version: 4 });

      await expect(guardianService.isGuardianTokenValid(token, 1)).resolves.toBe(true);
    });

    test('[pin_version 무효화] pin_version이 DB와 다르면(PIN이 그 사이 바뀌었으면) false', async () => {
      GuardianSetting.findOne.mockResolvedValue(buildSetting({ pin_version: 5 }));
      const token = generateGuardianToken({ user_id: 1, pin_version: 4 });

      await expect(guardianService.isGuardianTokenValid(token, 1)).resolves.toBe(false);
    });

    test('토큰이 없으면 false', async () => {
      await expect(guardianService.isGuardianTokenValid(undefined, 1)).resolves.toBe(false);
    });

    test('다른 유저에게 발급된 토큰이면 false', async () => {
      GuardianSetting.findOne.mockResolvedValue(buildSetting({ pin_version: 1 }));
      const token = generateGuardianToken({ user_id: 999, pin_version: 1 });

      await expect(guardianService.isGuardianTokenValid(token, 1)).resolves.toBe(false);
    });

    test('GuardianSetting 행 자체가 없으면 false', async () => {
      GuardianSetting.findOne.mockResolvedValue(null);
      const token = generateGuardianToken({ user_id: 1, pin_version: 0 });

      await expect(guardianService.isGuardianTokenValid(token, 1)).resolves.toBe(false);
    });

    test('변조된 토큰이면 false', async () => {
      GuardianSetting.findOne.mockResolvedValue(buildSetting({ pin_version: 1 }));
      const token = generateGuardianToken({ user_id: 1, pin_version: 1 });
      const tampered = token.slice(0, -1) + (token.slice(-1) === 'a' ? 'b' : 'a');

      await expect(guardianService.isGuardianTokenValid(tampered, 1)).resolves.toBe(false);
    });
  });

  describe('requestReauth (비밀번호 재인증 — DB 기반 실패 횟수/잠금)', () => {
    test('올바른 비밀번호면 reauthToken을 발급하고 실패 카운터를 초기화한다', async () => {
      const setting = buildSetting({ reauth_failed_attempts: 2 });
      GuardianSetting.findOne.mockResolvedValue(setting);
      const hash = await bcrypt.hash('correct-pw', 12);
      User.findByPk.mockResolvedValue({ password_hash: hash });

      const result = await guardianService.requestReauth(1, 'correct-pw');

      expect(typeof result.reauthToken).toBe('string');
      expect(setting.reauth_failed_attempts).toBe(0);
      expect(setting.reauth_locked_until).toBeNull();
    });

    test('틀린 비밀번호면 401을 던지고 실패 횟수를 증가시킨다 (계정 비밀번호를 직접 반복 검증하는 대신 이 엔드포인트 하나로 좁힘)', async () => {
      const setting = buildSetting({ reauth_failed_attempts: 0 });
      GuardianSetting.findOne.mockResolvedValue(setting);
      const hash = await bcrypt.hash('correct-pw', 12);
      User.findByPk.mockResolvedValue({ password_hash: hash });

      await expect(guardianService.requestReauth(1, 'wrong-pw')).rejects.toMatchObject({ statusCode: 401 });
      expect(setting.reauth_failed_attempts).toBe(1);
    });

    test('5회 연속 실패 시 잠기고(429) reauth_locked_until이 설정된다', async () => {
      const setting = buildSetting({ reauth_failed_attempts: 4 });
      GuardianSetting.findOne.mockResolvedValue(setting);
      const hash = await bcrypt.hash('correct-pw', 12);
      User.findByPk.mockResolvedValue({ password_hash: hash });

      await expect(guardianService.requestReauth(1, 'wrong-pw')).rejects.toMatchObject({ statusCode: 429 });
      expect(setting.reauth_locked_until).not.toBeNull();
    });

    test('잠긴 상태에서는 올바른 비밀번호를 보내도 차단된다 (정책에 따라)', async () => {
      const setting = buildSetting({ reauth_locked_until: new Date(Date.now() + 60 * 1000) });
      GuardianSetting.findOne.mockResolvedValue(setting);
      const hash = await bcrypt.hash('correct-pw', 12);
      User.findByPk.mockResolvedValue({ password_hash: hash });

      await expect(guardianService.requestReauth(1, 'correct-pw')).rejects.toMatchObject({ statusCode: 429 });
    });

    test('동시에 여러 개의 오답 요청이 들어와도 실패 횟수가 유실되지 않는다 (row lock 시뮬레이션, 메모리 카운터 아님)', async () => {
      const setting = buildSetting({ reauth_failed_attempts: 0 });
      GuardianSetting.findOne.mockImplementation(() => Promise.resolve(setting));
      const hash = await bcrypt.hash('correct-pw', 12);
      User.findByPk.mockResolvedValue({ password_hash: hash });

      let queue = Promise.resolve();
      sequelize.transaction.mockImplementation((cb) => {
        const run = queue.then(() => cb({ LOCK: { UPDATE: 'UPDATE' } }));
        queue = run.catch(() => {});
        return run;
      });

      try {
        const attempts = 5;
        const results = await Promise.allSettled(
          Array.from({ length: attempts }, () => guardianService.requestReauth(1, 'wrong-pw'))
        );

        expect(results.every((r) => r.status === 'rejected')).toBe(true);
        expect(setting.reauth_failed_attempts).toBe(attempts);
        expect(setting.reauth_locked_until).not.toBeNull();
      } finally {
        sequelize.transaction.mockImplementation((cb) => cb({ LOCK: { UPDATE: 'UPDATE' } }));
      }
    });
  });

  describe('getSettings', () => {
    test('parent_pin_hash / 잠금 카운터 / pin_version / reauth 카운터를 응답에 포함하지 않는다', async () => {
      const setting = buildSetting({
        parent_pin_hash: 'somehash',
        pin_failed_attempts: 2,
        pin_locked_until: new Date(),
        pin_version: 3,
        reauth_failed_attempts: 1,
        reauth_locked_until: new Date(),
        daily_usage_limit_minutes: 60,
        push_enabled: true,
      });
      GuardianSetting.findOne.mockResolvedValue(setting);

      const result = await guardianService.getSettings(1);

      expect(result).not.toHaveProperty('parent_pin_hash');
      expect(result).not.toHaveProperty('pin_failed_attempts');
      expect(result).not.toHaveProperty('pin_locked_until');
      expect(result).not.toHaveProperty('pin_version');
      expect(result).not.toHaveProperty('reauth_failed_attempts');
      expect(result).not.toHaveProperty('reauth_locked_until');
      expect(result.has_pin).toBe(true);
    });
  });
});
