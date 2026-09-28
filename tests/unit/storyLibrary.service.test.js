jest.mock('../../src/config/db', () => ({ execute: jest.fn() }));

const pool = require('../../src/config/db');
const storyLibraryService = require('../../src/services/storyLibrary.service');

describe('storyLibrary.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listStories', () => {
    test('목록 항목에 첫 페이지 삽화를 coverImageUrl로 포함한다', async () => {
      pool.execute
        .mockResolvedValueOnce([
          [
            {
              story_id: 1,
              title: '용감한 토끼',
              created_at: '2026-09-01T00:00:00.000Z',
              is_favorite: 1,
              cover_image_url: '/images/story1_page1.png',
            },
          ],
        ])
        .mockResolvedValueOnce([[{ totalCount: 1 }]]);

      const result = await storyLibraryService.listStories(1, { page: 1, limit: 20 });

      expect(result.items[0]).toEqual({
        storyId: 1,
        title: '용감한 토끼',
        isFavorite: true,
        coverImageUrl: '/images/story1_page1.png',
        createdAt: '2026-09-01T00:00:00.000Z',
      });
    });

    test('삽화가 아직 없는 동화는 coverImageUrl이 null이다', async () => {
      pool.execute
        .mockResolvedValueOnce([
          [
            {
              story_id: 2,
              title: '생성 중인 동화',
              created_at: '2026-09-02T00:00:00.000Z',
              is_favorite: 0,
              cover_image_url: null,
            },
          ],
        ])
        .mockResolvedValueOnce([[{ totalCount: 1 }]]);

      const result = await storyLibraryService.listStories(1, {});

      expect(result.items[0].coverImageUrl).toBeNull();
    });

    test('동화가 없으면 items가 빈 배열이다', async () => {
      pool.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ totalCount: 0 }]]);

      const result = await storyLibraryService.listStories(1, {});

      expect(result.items).toEqual([]);
      expect(result.pagination.totalCount).toBe(0);
    });
  });
});