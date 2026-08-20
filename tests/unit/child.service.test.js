jest.mock('../../src/models', () => ({
  ChildProfile: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  User: { findByPk: jest.fn() },
  sequelize: {
    transaction: jest.fn((cb) => cb({ LOCK: { UPDATE: 'UPDATE' } })),
  },
}));

const { ChildProfile, User, sequelize } = require('../../src/models');
const childService = require('../../src/services/child.service');

describe('child.service', () => {
  describe('create', () => {
    test('유저의 최초 프로필이면 is_active:true로 생성한다', async () => {
      User.findByPk.mockResolvedValue({ user_id: 1 });
      ChildProfile.count.mockResolvedValue(0);
      ChildProfile.create.mockResolvedValue({ child_profile_id: 1, is_active: true });

      await childService.create(1, { child_name: '아이' });

      expect(ChildProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 1, is_active: true }),
        expect.objectContaining({ transaction: expect.anything() })
      );
    });

    test('이미 프로필이 있으면 새 프로필은 is_active:false로 생성한다', async () => {
      User.findByPk.mockResolvedValue({ user_id: 1 });
      ChildProfile.count.mockResolvedValue(2);
      ChildProfile.create.mockResolvedValue({ child_profile_id: 3, is_active: false });

      await childService.create(1, { child_name: '아이2' });

      expect(ChildProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: false }),
        expect.anything()
      );
    });

    test('동시 생성 요청을 직렬화하기 위해 유저 행에 FOR UPDATE 잠금을 건다', async () => {
      User.findByPk.mockResolvedValue({ user_id: 1 });
      ChildProfile.count.mockResolvedValue(0);
      ChildProfile.create.mockResolvedValue({ child_profile_id: 1 });

      await childService.create(1, { child_name: '아이' });

      expect(sequelize.transaction).toHaveBeenCalledWith(expect.any(Function));
      expect(User.findByPk).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ lock: 'UPDATE' })
      );
    });
  });

  describe('getById (소유권 검증)', () => {
    test('본인 소유 프로필이면 반환한다', async () => {
      ChildProfile.findOne.mockResolvedValue({ child_profile_id: 1, user_id: 1 });

      const profile = await childService.getById(1, 1);

      expect(profile.child_profile_id).toBe(1);
      expect(ChildProfile.findOne).toHaveBeenCalledWith({
        where: { child_profile_id: 1, user_id: 1 },
      });
    });

    test('다른 유저의 프로필이면(where에 user_id 불일치) 404를 던진다', async () => {
      // where 절에 user_id가 포함되어 있으므로 실제 DB라면 다른 유저 소유 행은
      // 애초에 조회되지 않는다 — 여기서는 그 결과(null)를 시뮬레이션한다.
      ChildProfile.findOne.mockResolvedValue(null);

      await expect(childService.getById(999, 1)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('update', () => {
    test('허용된 필드만 반영하고 나머지는 무시한다', async () => {
      const profile = {
        child_profile_id: 1,
        user_id: 1,
        update: jest.fn().mockResolvedValue(undefined),
      };
      ChildProfile.findOne.mockResolvedValue(profile);

      await childService.update(1, 1, {
        child_name: '새이름',
        not_allowed_field: 'hacked',
        age: undefined,
      });

      expect(profile.update).toHaveBeenCalledWith({ child_name: '새이름' });
    });

    test('반영할 필드가 하나도 없으면(빈 PUT) 400을 던지고 update를 호출하지 않는다', async () => {
      const profile = { child_profile_id: 1, user_id: 1, update: jest.fn() };
      ChildProfile.findOne.mockResolvedValue(profile);

      await expect(childService.update(1, 1, {})).rejects.toMatchObject({ statusCode: 400 });
      expect(profile.update).not.toHaveBeenCalled();
    });

    test('다른 유저의 프로필이면 404를 던진다', async () => {
      ChildProfile.findOne.mockResolvedValue(null);

      await expect(childService.update(999, 1, { child_name: 'x' })).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('remove', () => {
    test('삭제 시 다른 프로필을 자동으로 활성화하지 않는다', async () => {
      const profile = { child_profile_id: 1, user_id: 1, destroy: jest.fn().mockResolvedValue(undefined) };
      ChildProfile.findOne.mockResolvedValue(profile);

      await childService.remove(1, 1);

      expect(profile.destroy).toHaveBeenCalledTimes(1);
      expect(ChildProfile.update).not.toHaveBeenCalled();
    });

    test('다른 유저의 프로필이면 404를 던진다', async () => {
      ChildProfile.findOne.mockResolvedValue(null);

      await expect(childService.remove(999, 1)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('activate', () => {
    test('대상 외 전체 비활성화 후 대상만 활성화하며, 유저 행 잠금과 트랜잭션을 사용한다', async () => {
      User.findByPk.mockResolvedValue({ user_id: 1 });
      const target = {
        child_profile_id: 2,
        user_id: 1,
        is_active: false,
        save: jest.fn().mockResolvedValue(undefined),
      };
      ChildProfile.findOne.mockResolvedValue(target);
      ChildProfile.update.mockResolvedValue([1]);

      const result = await childService.activate(1, 2);

      expect(sequelize.transaction).toHaveBeenCalledWith(expect.any(Function));
      expect(User.findByPk).toHaveBeenCalledWith(1, expect.objectContaining({ lock: 'UPDATE' }));
      expect(ChildProfile.update).toHaveBeenCalledWith(
        { is_active: false },
        expect.objectContaining({ where: { user_id: 1 } })
      );
      expect(target.is_active).toBe(true);
      expect(target.save).toHaveBeenCalledTimes(1);
      expect(result.is_active).toBe(true);
    });

    test('다른 유저 소유이거나 존재하지 않는 프로필이면 404를 던지고 비활성화 UPDATE는 실행하지 않는다', async () => {
      User.findByPk.mockResolvedValue({ user_id: 1 });
      ChildProfile.findOne.mockResolvedValue(null);

      await expect(childService.activate(1, 999)).rejects.toMatchObject({ statusCode: 404 });
      expect(ChildProfile.update).not.toHaveBeenCalled();
    });
  });
});
