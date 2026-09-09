jest.mock('../../src/models', () => ({
  StoryFavorite: { findOrCreate: jest.fn(), destroy: jest.fn() },
}));
jest.mock('../../src/config/db', () => ({ execute: jest.fn() }));
jest.mock('../../src/services/child.service', () => ({ getById: jest.fn() }));

const { StoryFavorite } = require('../../src/models');
const pool = require('../../src/config/db');
const childService = require('../../src/services/child.service');
const storyFavoriteService = require('../../src/services/storyFavorite.service');

describe('storyFavorite.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('타 자녀 소유의 동화는 즐겨찾기에 등록할 수 없다 (404)', async () => {
    childService.getById.mockResolvedValue({ child_profile_id: 1 });
    pool.execute.mockResolvedValue([[]]); // stories 조회 결과 없음 = 소유 아님

    await expect(storyFavoriteService.addFavorite(1, 1, 999)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(StoryFavorite.findOrCreate).not.toHaveBeenCalled();
  });

  it('본인 소유 동화는 정상 등록된다', async () => {
    childService.getById.mockResolvedValue({ child_profile_id: 1 });
    pool.execute.mockResolvedValue([[{ story_id: 10 }]]); // 소유 확인됨
    StoryFavorite.findOrCreate.mockResolvedValue([{}, true]);

    const result = await storyFavoriteService.addFavorite(1, 1, 10);
    expect(result.alreadyFavorited).toBe(false);
  });
});