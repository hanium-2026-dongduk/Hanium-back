jest.mock('../../src/models', () => ({
  ChildProfile: { findOne: jest.fn() },
  GuardianSetting: { findOne: jest.fn() },
  UsageDailySummary: { findOne: jest.fn() },
}));
jest.mock('../../src/services/usage.service', () => ({
  getSeoulDateString: jest.fn(() => '2026-07-31'),
}));

const { ChildProfile, GuardianSetting, UsageDailySummary } = require('../../src/models');
const { checkUsageLimit } = require('../../src/middlewares/usageLimit');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('middlewares/usageLimit checkUsageLimit (재사용 가능한 미들웨어 팩토리)', () => {
  const middleware = checkUsageLimit({ getChildProfileId: (req) => req.body.child_profile_id });

  test('req.user가 없으면 통과시킨다', async () => {
    const req = { body: {} };
    const res = mockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('child_profile_id를 확정할 수 없으면(형식 오류) 판단을 보류하고 통과시킨다', async () => {
    const req = { user: { user_id: 1 }, body: { child_profile_id: 'abc' } };
    const res = mockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(ChildProfile.findOne).not.toHaveBeenCalled();
  });

  test('소유하지 않은 프로필이면 통과시킨다(해당 라우트의 소유권 검증에 위임)', async () => {
    const req = { user: { user_id: 1 }, body: { child_profile_id: 5 } };
    const res = mockRes();
    const next = jest.fn();
    ChildProfile.findOne.mockResolvedValue(null);

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('제한이 설정되어 있지 않으면 통과시킨다', async () => {
    const req = { user: { user_id: 1 }, body: { child_profile_id: 5 } };
    const res = mockRes();
    const next = jest.fn();
    ChildProfile.findOne.mockResolvedValue({ child_profile_id: 5, user_id: 1 });
    GuardianSetting.findOne.mockResolvedValue({ daily_usage_limit_minutes: null });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('오늘 누적 사용량이 한도 미만이면 통과시킨다', async () => {
    const req = { user: { user_id: 1 }, body: { child_profile_id: 5 } };
    const res = mockRes();
    const next = jest.fn();
    ChildProfile.findOne.mockResolvedValue({ child_profile_id: 5, user_id: 1 });
    GuardianSetting.findOne.mockResolvedValue({ daily_usage_limit_minutes: 10 });
    UsageDailySummary.findOne.mockResolvedValue({ accumulated_seconds: 100 });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('오늘 누적 사용량이 한도 이상이면 403을 반환하고 next를 호출하지 않는다', async () => {
    const req = { user: { user_id: 1 }, body: { child_profile_id: 5 } };
    const res = mockRes();
    const next = jest.fn();
    ChildProfile.findOne.mockResolvedValue({ child_profile_id: 5, user_id: 1 });
    GuardianSetting.findOne.mockResolvedValue({ daily_usage_limit_minutes: 1 }); // 60초
    UsageDailySummary.findOne.mockResolvedValue({ accumulated_seconds: 60 });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('DB 조회 중 오류가 발생하면 fail-closed로 503을 반환한다(조용히 통과시키지 않는다)', async () => {
    const req = { user: { user_id: 1 }, body: { child_profile_id: 5 } };
    const res = mockRes();
    const next = jest.fn();
    ChildProfile.findOne.mockRejectedValue(new Error('DB down'));

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });
});
