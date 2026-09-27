const pool = require('../config/db'); // mysql2/promise

async function saveStoryWithTransaction({ childProfileId = 1, characterId, childAge, background, mainEvent, aiStory, jobId, claimToken }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. stories 저장
    const [storyResult] = await connection.execute(
      `INSERT INTO stories (child_profile_id, character_id, title, background, main_event, child_age, choices_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [childProfileId, characterId, aiStory.title, background, mainEvent, childAge, JSON.stringify(aiStory.choices || [])]
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

    // 작업 완료와 동화 저장을 한 트랜잭션으로 묶는다. 워커가 중간에 죽거나 임대권을
    // 잃어도 같은 요청으로 동화가 두 개 저장되지 않게 한다.
    if (jobId !== undefined) {
      const [claimed] = await connection.execute(
        `UPDATE story_generation_jobs
         SET status = 'completed', story_id = ?, claim_token = NULL, lease_until = NULL
         WHERE job_id = ? AND claim_token = ? AND status = 'processing'`,
        [storyId, jobId, claimToken]
      );
      if (claimed.affectedRows !== 1) {
        const error = new Error('동화 생성 작업의 처리 권한이 만료되었습니다.');
        error.code = 'STALE_STORY_JOB';
        throw error;
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

async function getStoryDetail(storyId, childProfileId) {
  const [rows] = await pool.execute(
    `SELECT s.story_id, s.title, s.background, s.main_event, s.choices_json,
            c.name AS character_name, sp.page_number, sp.content,
            spi.image_url, spt.audio_url
     FROM stories s
     JOIN characters c ON c.character_id = s.character_id
     JOIN story_pages sp ON sp.story_id = s.story_id
     LEFT JOIN story_page_illustrations spi ON spi.story_page_id = sp.story_page_id
     LEFT JOIN story_page_tts spt ON spt.story_page_id = sp.story_page_id
     WHERE s.story_id = ? AND (s.child_profile_id = ? OR s.is_public = TRUE)
     ORDER BY sp.page_number ASC`,
    [storyId, childProfileId]
  );

  if (rows.length === 0) {
    const error = new Error('동화를 찾을 수 없습니다.');
    error.statusCode = 404;
    throw error;
  }

  const first = rows[0];
  const choices = typeof first.choices_json === 'string'
    ? JSON.parse(first.choices_json)
    : first.choices_json;
  const pages = rows.map((row) => ({
    pageNumber: row.page_number,
    content: row.content,
    imageUrl: row.image_url,
    audioUrl: row.audio_url,
  }));
  return {
    storyId: first.story_id,
    title: first.title,
    character: first.character_name,
    setting: { background: first.background, mainEvent: first.main_event },
    coverImageUrl: pages[0].imageUrl,
    pages,
    choices: choices || [],
  };
}

module.exports = { saveStoryWithTransaction, getStoryDetail };
