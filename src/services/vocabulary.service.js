const { VocabularyEntry } = require('../models');
const childService = require('./child.service');

async function saveEntry(userId, { childProfileId, storyId, englishWord, koreanMeaning, exampleSentence }) {
  await childService.getById(userId, childProfileId);

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