jest.mock('../../src/models', () => ({
  User: { findOne: jest.fn(), create: jest.fn(), findByPk: jest.fn() },
  EmailVerification: { findOne: jest.fn(), create: jest.fn(), destroy: jest.fn() },
  RefreshToken: { findOne: jest.fn(), create: jest.fn(), destroy: jest.fn() },
  // 실제 Sequelize transaction처럼, 콜백에 트랜잭션 객체를 넘겨 호출하고
  // 그 결과(성공/실패)를 그대로 돌려주는 최소한의 동작만 흉내낸다.
  sequelize: {
    transaction: jest.fn((cb) => cb({ LOCK: { UPDATE: 'UPDATE' } })),
  },
}));
jest.mock('../../src/utils/mailer', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

const bcrypt = require('bcrypt');
const { User, EmailVerification, RefreshToken, sequelize } = require('../../src/models');
const mailer = require('../../src/utils/mailer');
const authService = require('../../src/services/auth.service');
const { generateRefreshToken, verifyRefreshToken } = require('../../src/utils/jwt');

describe('auth.service', () => {
  describe('signup', () => {
    test('회원가입 성공 시 사용한 인증 레코드를 소멸시키고 password_hash 없는 사용자 정보를 반환한다', async () => {
      User.findOne.mockResolvedValue(null);
      const verifiedRecord = { destroy: jest.fn().mockResolvedValue(undefined) };
      EmailVerification.findOne.mockResolvedValue(verifiedRecord);
      User.create.mockResolvedValue({
        toJSON: () => ({
          user_id: 1,
          email: 'a@b.com',
          password_hash: 'hash',
          role: 'parent',
          status: 'active',
        }),
      });

      const result = await authService.signup({ email: 'a@b.com', password: 'abcd1234' });

      expect(result).not.toHaveProperty('password_hash');
      expect(result.email).toBe('a@b.com');
      expect(verifiedRecord.destroy).toHaveBeenCalledTimes(1);
    });

    test('이미 가입된 이메일이면 409를 던진다', async () => {
      User.findOne.mockResolvedValue({ user_id: 1 });

      await expect(
        authService.signup({ email: 'a@b.com', password: 'abcd1234' })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    test('이메일 인증이 완료되지 않았으면 403을 던진다', async () => {
      User.findOne.mockResolvedValue(null);
      EmailVerification.findOne.mockResolvedValue(null);

      await expect(
        authService.signup({ email: 'a@b.com', password: 'abcd1234' })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    test('동시 요청으로 인한 unique 제약 위반은 409로 변환된다', async () => {
      User.findOne.mockResolvedValue(null);
      EmailVerification.findOne.mockResolvedValue({ destroy: jest.fn() });
      const dupError = new Error('duplicate');
      dupError.name = 'SequelizeUniqueConstraintError';
      User.create.mockRejectedValue(dupError);

      await expect(
        authService.signup({ email: 'a@b.com', password: 'abcd1234' })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    test('가입에 사용된 인증 코드는 이후 재가입에 재사용될 수 없다', async () => {
      User.findOne.mockResolvedValue(null);
      const verifiedRecord = {
        destroy: jest.fn().mockImplementation(() => {
          // 실제 DB라면 삭제되어 이후 조회 시 조회되지 않는 상황을 시뮬레이션한다.
          EmailVerification.findOne.mockResolvedValue(null);
          return Promise.resolve();
        }),
      };
      EmailVerification.findOne.mockResolvedValueOnce(verifiedRecord);
      User.create.mockResolvedValueOnce({
        toJSON: () => ({ user_id: 1, email: 'a@b.com' }),
      });

      await authService.signup({ email: 'a@b.com', password: 'abcd1234' });

      // 계정이 삭제되어 같은 이메일로 재가입을 시도하는 상황
      User.findOne.mockResolvedValue(null);
      await expect(
        authService.signup({ email: 'a@b.com', password: 'abcd1234' })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    test('사용자 생성과 인증 레코드 소멸을 하나의 트랜잭션으로 처리한다', async () => {
      User.findOne.mockResolvedValue(null);
      const verifiedRecord = { destroy: jest.fn().mockResolvedValue(undefined) };
      EmailVerification.findOne.mockResolvedValue(verifiedRecord);
      User.create.mockResolvedValue({ toJSON: () => ({ user_id: 1, email: 'a@b.com' }) });

      await authService.signup({ email: 'a@b.com', password: 'abcd1234' });

      expect(sequelize.transaction).toHaveBeenCalledWith(expect.any(Function));
      // create가 destroy보다 먼저 호출되어야 하며, 둘 다 같은 트랜잭션 옵션을 전달받는다.
      expect(User.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'a@b.com' }),
        expect.objectContaining({ transaction: expect.anything() })
      );
      expect(verifiedRecord.destroy).toHaveBeenCalledWith(
        expect.objectContaining({ transaction: expect.anything() })
      );
    });

    test('트랜잭션 중 사용자 생성이 실패하면 인증 레코드는 소멸시키지 않는다', async () => {
      User.findOne.mockResolvedValue(null);
      const verifiedRecord = { destroy: jest.fn().mockResolvedValue(undefined) };
      EmailVerification.findOne.mockResolvedValue(verifiedRecord);
      User.create.mockRejectedValue(new Error('db down'));

      await expect(
        authService.signup({ email: 'a@b.com', password: 'abcd1234' })
      ).rejects.toThrow('db down');
      expect(verifiedRecord.destroy).not.toHaveBeenCalled();
    });
  });

  describe('sendVerification', () => {
    test('이미 가입된 이메일이면 409를 던진다', async () => {
      User.findOne.mockResolvedValue({ user_id: 1 });

      await expect(authService.sendVerification('a@b.com')).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    test('이전 발송 기록이 없으면 쿨다운 없이 바로 발송한다', async () => {
      User.findOne.mockResolvedValue(null);
      EmailVerification.findOne.mockResolvedValue(null);
      EmailVerification.destroy.mockResolvedValue(1);
      EmailVerification.create.mockResolvedValue({});

      await authService.sendVerification('a@b.com');

      expect(EmailVerification.destroy).toHaveBeenCalledWith({
        where: { email: 'a@b.com', purpose: 'signup', is_verified: false },
      });
      expect(EmailVerification.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'a@b.com', code: expect.stringMatching(/^\d{6}$/) })
      );
      expect(mailer.sendVerificationEmail).toHaveBeenCalledWith(
        'a@b.com',
        expect.stringMatching(/^\d{6}$/)
      );
    });

    test('마지막 발송으로부터 60초가 지나지 않았으면 429를 던지고 재발송하지 않는다', async () => {
      User.findOne.mockResolvedValue(null);
      EmailVerification.findOne.mockResolvedValue({ created_at: new Date(Date.now() - 10 * 1000) });

      await expect(authService.sendVerification('a@b.com')).rejects.toMatchObject({
        statusCode: 429,
      });
      expect(EmailVerification.create).not.toHaveBeenCalled();
      expect(mailer.sendVerificationEmail).not.toHaveBeenCalled();
    });

    test('마지막 발송으로부터 60초가 지났으면 재발송할 수 있다', async () => {
      User.findOne.mockResolvedValue(null);
      EmailVerification.findOne.mockResolvedValue({ created_at: new Date(Date.now() - 61 * 1000) });
      EmailVerification.destroy.mockResolvedValue(1);
      EmailVerification.create.mockResolvedValue({});

      await authService.sendVerification('a@b.com');

      expect(EmailVerification.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('verifyEmail', () => {
    const buildRecord = (overrides = {}) => ({
      code: '123456',
      attempts: 0,
      expires_at: new Date(Date.now() + 60 * 1000),
      is_verified: false,
      save: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    });

    test('해당하는 미인증 레코드가 없으면 400을 던진다', async () => {
      EmailVerification.findOne.mockResolvedValue(null);

      await expect(authService.verifyEmail('a@b.com', '123456')).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    test('인증번호가 만료되었으면 410을 던진다', async () => {
      EmailVerification.findOne.mockResolvedValue(
        buildRecord({ expires_at: new Date(Date.now() - 1000) })
      );

      await expect(authService.verifyEmail('a@b.com', '123456')).rejects.toMatchObject({
        statusCode: 410,
      });
    });

    test('최대 시도 횟수를 이미 초과했으면 429를 던진다', async () => {
      EmailVerification.findOne.mockResolvedValue(buildRecord({ attempts: 5 }));

      await expect(authService.verifyEmail('a@b.com', '000000')).rejects.toMatchObject({
        statusCode: 429,
      });
    });

    test('코드가 틀리면 attempts를 1 증가시키고 400을 던진다 (무차별 대입 방지)', async () => {
      const record = buildRecord();
      EmailVerification.findOne.mockResolvedValue(record);

      await expect(authService.verifyEmail('a@b.com', '000000')).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(record.attempts).toBe(1);
      expect(record.save).toHaveBeenCalledTimes(1);
    });

    test('5회 연속 오답 시 6번째 시도부터는 429로 잠긴다', async () => {
      const record = buildRecord();
      EmailVerification.findOne.mockResolvedValue(record);

      for (let i = 0; i < 5; i += 1) {
        await expect(authService.verifyEmail('a@b.com', '000000')).rejects.toMatchObject({
          statusCode: 400,
        });
      }

      await expect(authService.verifyEmail('a@b.com', '000000')).rejects.toMatchObject({
        statusCode: 429,
      });
    });

    test('올바른 코드면 is_verified를 true로 저장한다', async () => {
      const record = buildRecord();
      EmailVerification.findOne.mockResolvedValue(record);

      const result = await authService.verifyEmail('a@b.com', '123456');

      expect(record.is_verified).toBe(true);
      expect(record.save).toHaveBeenCalledTimes(1);
      expect(result.message).toEqual(expect.any(String));
    });

    test('조회~시도 횟수 증가를 하나의 트랜잭션 안에서, 행 잠금(FOR UPDATE)을 걸고 처리한다', async () => {
      const record = buildRecord();
      EmailVerification.findOne.mockResolvedValue(record);

      await authService.verifyEmail('a@b.com', '123456');

      expect(sequelize.transaction).toHaveBeenCalledWith(expect.any(Function));
      expect(EmailVerification.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ lock: 'UPDATE' })
      );
    });

    test('동시에 여러 개의 오답 요청이 들어와도 시도 횟수가 하나도 유실되지 않는다 (row lock 시뮬레이션)', async () => {
      // 실제 버그였던 시나리오: attempts += 1; save()가 트랜잭션/잠금 없이 이루어지면,
      // 동시에 들어온 요청들이 모두 같은 attempts 값을 읽어 증가분이 서로 덮어써진다.
      // FOR UPDATE 잠금이 제대로 걸려있다면 요청들이 순차적으로 처리되어 증가분이 누락되지 않아야 한다.
      const record = buildRecord();
      EmailVerification.findOne.mockImplementation(() => Promise.resolve(record));

      // 트랜잭션을 완전히 직렬화하는 목으로 교체해 "같은 행에 대한 동시 트랜잭션은
      // 하나가 끝나야 다음이 시작된다"는 실제 FOR UPDATE 동작을 흉내낸다.
      let queue = Promise.resolve();
      sequelize.transaction.mockImplementation((cb) => {
        const run = queue.then(() => cb({ LOCK: { UPDATE: 'UPDATE' } }));
        queue = run.catch(() => {});
        return run;
      });

      try {
        const attempts = 5;
        const results = await Promise.allSettled(
          Array.from({ length: attempts }, () => authService.verifyEmail('a@b.com', '000000'))
        );

        expect(results.every((r) => r.status === 'rejected')).toBe(true);
        // 5번의 오답 시도가 전부 반영되어야 한다 (유실 없이 정확히 5).
        expect(record.attempts).toBe(attempts);

        // 잠금이 풀린 뒤 6번째 시도는 이미 잠긴 상태여야 한다.
        await expect(authService.verifyEmail('a@b.com', '000000')).rejects.toMatchObject({
          statusCode: 429,
        });
      } finally {
        sequelize.transaction.mockImplementation((cb) => cb({ LOCK: { UPDATE: 'UPDATE' } }));
      }
    });
  });

  describe('login', () => {
    test('존재하지 않는 사용자면 401을 던진다', async () => {
      User.findOne.mockResolvedValue(null);

      await expect(authService.login('a@b.com', 'pw12345678')).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    test('비활성화된 계정이면 403을 던진다', async () => {
      User.findOne.mockResolvedValue({ status: 'inactive', password_hash: 'x' });

      await expect(authService.login('a@b.com', 'pw12345678')).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    test('비밀번호가 틀리면 401을 던진다', async () => {
      const hash = await bcrypt.hash('correct-pw1', 12);
      User.findOne.mockResolvedValue({ status: 'active', password_hash: hash });

      await expect(authService.login('a@b.com', 'wrong-pw')).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    test('로그인 성공 시 토큰을 발급하고 refresh token을 DB에 저장한다', async () => {
      const hash = await bcrypt.hash('correct-pw1', 12);
      const userRow = {
        status: 'active',
        password_hash: hash,
        user_id: 1,
        email: 'a@b.com',
        role: 'parent',
      };
      userRow.toJSON = () => ({ ...userRow });
      User.findOne.mockResolvedValue(userRow);
      RefreshToken.create.mockResolvedValue({});

      const result = await authService.login('a@b.com', 'correct-pw1');

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.user).not.toHaveProperty('password_hash');
      expect(RefreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 1, token: result.refreshToken })
      );
    });
  });

  describe('logout', () => {
    test('토큰이 존재하면 삭제하고 성공 메시지를 반환한다', async () => {
      RefreshToken.destroy.mockResolvedValue(1);

      const result = await authService.logout('sometoken');

      expect(RefreshToken.destroy).toHaveBeenCalledWith({ where: { token: 'sometoken' } });
      expect(result.message).toEqual(expect.any(String));
    });

    test('존재하지 않는 토큰이면 400을 던진다', async () => {
      RefreshToken.destroy.mockResolvedValue(0);

      await expect(authService.logout('bad')).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('refresh (rotation)', () => {
    test('JWT 서명이 유효하지 않으면 401을 던진다', async () => {
      await expect(authService.refresh('not-a-valid-jwt')).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    test('DB에 존재하지 않는 토큰이면 401을 던진다', async () => {
      const token = generateRefreshToken({ user_id: 1 });
      RefreshToken.findOne.mockResolvedValue(null);

      await expect(authService.refresh(token)).rejects.toMatchObject({ statusCode: 401 });
    });

    test('만료된 토큰이면 DB에서 삭제 후 401을 던진다', async () => {
      const token = generateRefreshToken({ user_id: 1 });
      const stored = {
        expires_at: new Date(Date.now() - 1000),
        destroy: jest.fn().mockResolvedValue(undefined),
      };
      RefreshToken.findOne.mockResolvedValue(stored);

      await expect(authService.refresh(token)).rejects.toMatchObject({ statusCode: 401 });
      expect(stored.destroy).toHaveBeenCalledTimes(1);
    });

    test('정상 갱신 시 기존 refresh token을 폐기하고 새 accessToken/refreshToken을 발급한다', async () => {
      const oldToken = generateRefreshToken({ user_id: 1 });
      const stored = {
        expires_at: new Date(Date.now() + 100000),
        destroy: jest.fn().mockResolvedValue(undefined),
      };
      RefreshToken.findOne.mockResolvedValue(stored);
      User.findByPk.mockResolvedValue({ user_id: 1, email: 'a@b.com', role: 'parent' });
      RefreshToken.create.mockResolvedValue({});

      const result = await authService.refresh(oldToken);

      expect(stored.destroy).toHaveBeenCalledTimes(1);
      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.refreshToken).not.toBe(oldToken);
      expect(verifyRefreshToken(result.refreshToken).user_id).toBe(1);
      expect(RefreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 1, token: result.refreshToken }),
        expect.objectContaining({ transaction: expect.anything() })
      );
    });

    test('회전으로 폐기된(재사용된) refresh token은 다시 사용할 수 없다', async () => {
      const oldToken = generateRefreshToken({ user_id: 1 });
      let deleted = false;
      const stored = {
        expires_at: new Date(Date.now() + 100000),
        destroy: jest.fn().mockImplementation(() => {
          deleted = true;
          return Promise.resolve();
        }),
      };
      RefreshToken.findOne.mockImplementation(() => Promise.resolve(deleted ? null : stored));
      User.findByPk.mockResolvedValue({ user_id: 1, email: 'a@b.com', role: 'parent' });
      RefreshToken.create.mockResolvedValue({});

      await authService.refresh(oldToken);

      await expect(authService.refresh(oldToken)).rejects.toMatchObject({ statusCode: 401 });
    });

    test('토큰의 사용자를 찾을 수 없으면 저장된 토큰을 폐기하고 404를 던진다', async () => {
      const token = generateRefreshToken({ user_id: 999 });
      const stored = {
        expires_at: new Date(Date.now() + 100000),
        destroy: jest.fn().mockResolvedValue(undefined),
      };
      RefreshToken.findOne.mockResolvedValue(stored);
      User.findByPk.mockResolvedValue(null);

      await expect(authService.refresh(token)).rejects.toMatchObject({ statusCode: 404 });
      expect(stored.destroy).toHaveBeenCalledTimes(1);
    });

    test('토큰 조회부터 재발급까지 하나의 트랜잭션 안에서, 행 잠금(FOR UPDATE)을 걸고 처리한다', async () => {
      const token = generateRefreshToken({ user_id: 1 });
      const stored = {
        expires_at: new Date(Date.now() + 100000),
        destroy: jest.fn().mockResolvedValue(undefined),
      };
      RefreshToken.findOne.mockResolvedValue(stored);
      User.findByPk.mockResolvedValue({ user_id: 1, email: 'a@b.com', role: 'parent' });
      RefreshToken.create.mockResolvedValue({});

      await authService.refresh(token);

      expect(sequelize.transaction).toHaveBeenCalledWith(expect.any(Function));
      expect(RefreshToken.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { token }, lock: 'UPDATE' })
      );
    });

    test('동일한 refresh token으로 동시에 두 요청이 들어와도 정확히 한 번만 성공한다 (row lock 시뮬레이션)', async () => {
      const token = generateRefreshToken({ user_id: 1 });
      let consumed = false;
      const stored = {
        expires_at: new Date(Date.now() + 100000),
        destroy: jest.fn().mockImplementation(() => {
          consumed = true;
          return Promise.resolve();
        }),
      };
      RefreshToken.findOne.mockImplementation(() => Promise.resolve(consumed ? null : stored));
      User.findByPk.mockResolvedValue({ user_id: 1, email: 'a@b.com', role: 'parent' });
      RefreshToken.create.mockResolvedValue({});

      // 실제 MySQL의 "SELECT ... FOR UPDATE로 잠긴 행은 그 트랜잭션이 끝날 때까지
      // 다른 트랜잭션이 접근할 수 없다"는 동작을 흉내내기 위해, 트랜잭션 콜백을
      // 완전히 직렬화하는 목(mock)으로 일시 교체한다. (같은 토큰=같은 행이므로
      // 두 트랜잭션 모두 같은 잠금을 다투는 상황과 동일하다.)
      let queue = Promise.resolve();
      sequelize.transaction.mockImplementation((cb) => {
        const run = queue.then(() => cb({ LOCK: { UPDATE: 'UPDATE' } }));
        queue = run.catch(() => {});
        return run;
      });

      try {
        const results = await Promise.allSettled([
          authService.refresh(token),
          authService.refresh(token),
        ]);

        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');

        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0].reason).toMatchObject({ statusCode: 401 });
        expect(stored.destroy).toHaveBeenCalledTimes(1);
      } finally {
        // 이후 테스트에 영향을 주지 않도록 기본 목 구현으로 복원한다.
        sequelize.transaction.mockImplementation((cb) => cb({ LOCK: { UPDATE: 'UPDATE' } }));
      }
    });
  });

  describe('purpose 분리 (회원가입 인증 vs 비밀번호 재설정 인증)', () => {
    test('signup()은 purpose:signup, is_verified:true 조건으로만 인증 완료를 인정한다', async () => {
      User.findOne.mockResolvedValue(null);
      EmailVerification.findOne.mockResolvedValue(null); // purpose:signup 레코드가 없는 상황(예: password_reset 코드만 인증됨)

      await expect(
        authService.signup({ email: 'a@b.com', password: 'abcd1234' })
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(EmailVerification.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ purpose: 'signup', is_verified: true }) })
      );
    });
  });

  describe('passwordResetRequest', () => {
    test('가입되지 않은 이메일이어도 동일한 제네릭 메시지를 반환하고 실제 발송은 하지 않는다(계정 열거 방지)', async () => {
      User.findOne.mockResolvedValue(null);

      const result = await authService.passwordResetRequest('nobody@example.com');

      expect(result.message).toEqual(expect.any(String));
      expect(mailer.sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(EmailVerification.create).not.toHaveBeenCalled();
    });

    test('가입된 이메일이면 purpose:password_reset으로 발송하고 회원가입 인증 발송에는 영향을 주지 않는다', async () => {
      User.findOne.mockResolvedValue({ user_id: 1, email: 'a@b.com' });
      EmailVerification.findOne.mockResolvedValue(null);
      EmailVerification.destroy.mockResolvedValue(1);
      EmailVerification.create.mockResolvedValue({});

      await authService.passwordResetRequest('a@b.com');

      expect(EmailVerification.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'a@b.com', purpose: 'password_reset' })
      );
      expect(mailer.sendPasswordResetEmail).toHaveBeenCalledWith('a@b.com', expect.stringMatching(/^\d{6}$/));
    });

    test('60초 이내 재요청이면 429를 던진다', async () => {
      User.findOne.mockResolvedValue({ user_id: 1, email: 'a@b.com' });
      EmailVerification.findOne.mockResolvedValue({ created_at: new Date(Date.now() - 10 * 1000) });

      await expect(authService.passwordResetRequest('a@b.com')).rejects.toMatchObject({ statusCode: 429 });
      expect(mailer.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('passwordReset', () => {
    const buildResetRecord = (overrides = {}) => ({
      code: '123456',
      attempts: 0,
      expires_at: new Date(Date.now() + 60 * 1000),
      is_verified: false,
      save: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    });

    test('회원가입(purpose:signup) 인증코드는 비밀번호 재설정에 사용할 수 없다', async () => {
      // purpose:password_reset 조건으로 조회하므로, signup 코드만 있는 상황은 "없음"과 동일하게 처리된다.
      EmailVerification.findOne.mockResolvedValue(null);

      await expect(authService.passwordReset('a@b.com', '123456', 'newpass123')).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(EmailVerification.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ purpose: 'password_reset', is_verified: false }) })
      );
    });

    test('만료된 코드면 410을 던진다', async () => {
      EmailVerification.findOne.mockResolvedValue(buildResetRecord({ expires_at: new Date(Date.now() - 1000) }));

      await expect(authService.passwordReset('a@b.com', '123456', 'newpass123')).rejects.toMatchObject({
        statusCode: 410,
      });
    });

    test('시도 횟수를 초과했으면 429를 던진다', async () => {
      EmailVerification.findOne.mockResolvedValue(buildResetRecord({ attempts: 5 }));

      await expect(authService.passwordReset('a@b.com', '000000', 'newpass123')).rejects.toMatchObject({
        statusCode: 429,
      });
    });

    test('코드가 틀리면 attempts를 증가시키고 400을 던진다(비밀번호는 변경되지 않는다)', async () => {
      const record = buildResetRecord();
      EmailVerification.findOne.mockResolvedValue(record);

      await expect(authService.passwordReset('a@b.com', '000000', 'newpass123')).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(record.attempts).toBe(1);
      expect(User.findOne).not.toHaveBeenCalled();
    });

    test('성공 시 코드를 소비(is_verified:true)하고 비밀번호를 변경하며 기존 refresh token을 모두 폐기한다', async () => {
      const record = buildResetRecord();
      EmailVerification.findOne.mockResolvedValue(record);
      const user = { user_id: 7, email: 'a@b.com', password_hash: 'old', save: jest.fn().mockResolvedValue(undefined) };
      User.findOne.mockResolvedValue(user);
      RefreshToken.destroy.mockResolvedValue(2);

      const result = await authService.passwordReset('a@b.com', '123456', 'newpass123');

      expect(record.is_verified).toBe(true);
      expect(user.password_hash).not.toBe('old');
      expect(user.save).toHaveBeenCalledTimes(1);
      expect(RefreshToken.destroy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { user_id: 7 } })
      );
      expect(result.message).toEqual(expect.any(String));
    });

    test('소비된(is_verified:true) 코드는 재사용할 수 없다', async () => {
      // is_verified:false 조건으로만 조회하므로, 이미 소비된 코드는 조회되지 않아 "없음"과 동일하게 처리된다.
      EmailVerification.findOne.mockResolvedValue(null);

      await expect(authService.passwordReset('a@b.com', '123456', 'newpass123')).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    test('코드 소비~비밀번호 변경~refresh token 폐기를 하나의 트랜잭션으로 처리한다', async () => {
      const record = buildResetRecord();
      EmailVerification.findOne.mockResolvedValue(record);
      const user = { user_id: 7, email: 'a@b.com', password_hash: 'old', save: jest.fn().mockResolvedValue(undefined) };
      User.findOne.mockResolvedValue(user);
      RefreshToken.destroy.mockResolvedValue(0);

      await authService.passwordReset('a@b.com', '123456', 'newpass123');

      expect(sequelize.transaction).toHaveBeenCalledWith(expect.any(Function));
      expect(RefreshToken.destroy).toHaveBeenCalledWith(
        expect.objectContaining({ transaction: expect.anything() })
      );
    });
  });
});
