const { VocabularyEntry } = require('../models');
const pool = require('../config/db');
const childService = require('./child.service');

/**
 * saveEntry에 storyId가 오면 실제로 이 childProfileId 소유의 동화인지 확인한다.
 * (리뷰 지적사항: storyId가 그 자녀 소유인지 검증하지 않아 타 자녀의 동화를 단어장에
 * 연결할 수 있었던 문제 수정. storyId는 optional이라 없을 때는 검증하지 않는다.)
 */
const verifyStoryOwnership = async (childProfileId, storyId) => {
  const [rows] = await pool.execute(
    `SELECT story_id FROM stories WHERE story_id = ? AND child_profile_id = ?`,
    [storyId, childProfileId]
  );
  if (rows.length === 0) {
    const error = new Error('동화를 찾을 수 없습니다.');
    error.statusCode = 404;
    throw error;
  }
};

async function saveEntry(userId, { childProfileId, storyId, englishWord, koreanMeaning, exampleSentence }) {
  await childService.getById(userId, childProfileId);

  if (storyId) {
    await verifyStoryOwnership(childProfileId, storyId);
  }

  const entry = await VocabularyEntry.create({
    child_profile_id: childProfileId,
    story_id: storyId || null,
    english_word: englishWord,
    korean_meaning: koreanMeaning,
    example_sentence: exampleSentence || null,
  });

  return entry;
}

async function listEntries(userId, childProfileId, { page = 1, limit = 20 } = {}) {
  await childService.getById(userId, childProfileId);

  const { count, rows } = await VocabularyEntry.findAndCountAll({
    where: { child_profile_id: childProfileId },
    order: [['created_at', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  });

  return {
    items: rows,
    pagination: { page, limit, totalCount: count, totalPages: Math.max(1, Math.ceil(count / limit)) },
  };
}

async function deleteEntry(userId, childProfileId, entryId) {
  await childService.getById(userId, childProfileId);

  const deletedCount = await VocabularyEntry.destroy({
    where: { vocabulary_entry_id: entryId, child_profile_id: childProfileId },
  });

  if (deletedCount === 0) {
    const error = new Error('단어를 찾을 수 없습니다.');
    error.statusCode = 404;
    throw error;
  }

  return { deleted: true };
}

module.exports = { saveEntry, listEntries, deleteEntry };