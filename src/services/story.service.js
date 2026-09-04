const pool = require('../config/db'); // mysql2/promise

async function saveStoryWithTransaction({ childProfileId = 1, characterId, childAge, background, mainEvent, aiStory }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. stories 저장
    const [storyResult] = await connection.execute(
      `INSERT INTO stories (child_profile_id, character_id, title, background, main_event, child_age)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [childProfileId, characterId, aiStory.title, background, mainEvent, childAge]
    );
    const storyId = storyResult.insertId;

    // 2. story_pages 및 하위 미디어(illustrations, tts) 저장
    for (const page of aiStory.pages) {
      const [pageResult] = await connection.execute(
        `INSERT INTO story_pages (story_id, page_number, content)
         VALUES (?, ?, ?)`,
        [storyId, page.pageNumber, page.content]
      );
      const storyPageId = pageResult.insertId;

      if (page.imageUrl) {
        await connection.execute(
          `INSERT INTO story_page_illustrations (story_page_id, image_url) VALUES (?, ?)`,
          [storyPageId, page.imageUrl]
        );
      }

      if (page.audioUrl) {
        await connection.execute(
          `INSERT INTO story_page_tts (story_page_id, audio_url) VALUES (?, ?)`,
          [storyPageId, page.audioUrl]
        );
      }
    }

    await connection.commit();

    return {
      storyId,
      title: aiStory.title,
      pages: aiStory.pages,
      choices: aiStory.choices
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { saveStoryWithTransaction };