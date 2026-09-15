jest.mock('../../src/models', () => ({
  VocabularyEntry: {
    create: jest.fn(),
    findAndCountAll: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
    destroy: jest.fn(),
  },
}));
jest.mock('../../src/config/db', () => ({ execute: jest.fn() }));
jest.mock('../../src/services/child.service', () => ({ getById: jest.fn() }));
jest.mock('../../src/services/badge.service', () => ({ evaluateQuietly: jest.fn() }));
jest.mock('../../src/services/mission.service', () => ({ recordProgress: jest.fn() }));
jest.mock('../../src/utils/dbRetry', () => ({ withTransaction: (_t, fn) => fn({ id: 'tx' }) }));

const { VocabularyEntry } = require('../../src/models');
const pool = require('../../src/config/db');
const childService = require('../../src/services/child.service');
const badgeService = require('../../src/services/badge.service');
const missionService = require('../../src/services/mission.service');
const service = require('../../src/services/vocabulary.service');

describe('vocabulary.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    childService.getById.mockResolvedValue({ child_profile_id: 3 });
  });

  test('단어 저장과 word_clicked 미션을 같은 트랜잭션에서 처리한다', async () => {
    pool.execute.mockResolvedValue([[{ story_id: 9 }]]);
    const entry = { vocabulary_entry_id: 12 };
    VocabularyEntry.create.mockResolvedValue(entry);
    missionService.recordProgress.mockResolvedValue({});
    badgeService.evaluateQuietly.mockResolvedValue([]);

    await service.saveEntry(1, {
      childProfileId: 3,
      storyId: 9,
      englishWord: 'brave',
      koreanMeaning: '용감한',
    });

    expect(VocabularyEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ child_profile_id: 3, english_word: 'brave' }),
      { transaction: { id: 'tx' } }
    );
    expect(missionService.recordProgress).toHaveBeenCalledWith({
      childProfileId: 3,
      eventType: 'word_clicked',
      eventId: 'vocabulary_entry:12',
      transaction: { id: 'tx' },
    });
    expect(badgeService.evaluateQuietly).toHaveBeenCalledWith(3);
  });

  test('favoriteOnly이면 즐겨찾기 행만 조회한다', async () => {
    VocabularyEntry.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });

    await service.listEntries(1, 3, { favoriteOnly: true });

    expect(VocabularyEntry.findAndCountAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { child_profile_id: 3, is_favorite: true } })
    );
  });

  test('소유한 단어의 즐겨찾기를 변경한다', async () => {
    VocabularyEntry.update.mockResolvedValue([1]);
    VocabularyEntry.findOne.mockResolvedValue({ vocabulary_entry_id: 12, is_favorite: true });

    const result = await service.setFavorite(1, 3, 12, true);

    expect(VocabularyEntry.update).toHaveBeenCalledWith(
      { is_favorite: true },
      { where: { vocabulary_entry_id: 12, child_profile_id: 3 } }
    );
    expect(result.is_favorite).toBe(true);
  });

  test('소유하지 않은 단어는 404', async () => {
    VocabularyEntry.update.mockResolvedValue([0]);

    await expect(service.setFavorite(1, 3, 999, true)).rejects.toMatchObject({ statusCode: 404 });
  });
});
