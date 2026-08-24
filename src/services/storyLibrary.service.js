const pool = require('../config/db');

const SORT_MAP = {
  latest: 'st.created_at DESC',
  oldest: 'st.created_at ASC',
};

/**
 * 내 책장 조회 (정렬 + 즐겨찾기 필터 + 페이지네이션)
 * @param {number} childProfileId
 * @param {object} options
 * @param {'latest'|'oldest'} [options.sort='latest']
 * @param {boolean} [options.favoriteOnly=false]
 * @param {number} [options.page=1]
 * @param {number} [options.limit=20]
 */
async function listStories(childProfileId, { sort = 'latest', favoriteOnly = false, page = 1, limit = 20 } = {}) {
  const orderBy = SORT_MAP[sort] || SORT_MAP.latest;
  const offset = (page - 1) * limit;

  const favoriteJoin = 'LEFT JOIN story_favorites sf ON sf.story_id = st.story_id AND sf.child_profile_id = ?';
  const favoriteWhere = favoriteOnly ? 'AND sf.story_favorite_id IS NOT NULL' : '';

  const [rows] = await pool.execute(
    `SELECT st.story_id, st.title, st.created_at,
            (sf.story_favorite_id IS NOT NULL) AS is_favorite
     FROM stories st
     ${favoriteJoin}
     WHERE st.child_profile_id = ?
     ${favoriteWhere}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [childProfileId, childProfileId, limit, offset]
  );

  const [[{ totalCount }]] = await pool.execute(
    `SELECT COUNT(*) AS totalCount
     FROM stories st
     ${favoriteJoin}
     WHERE st.child_profile_id = ?
     ${favoriteWhere}`,
    [childProfileId, childProfileId]
  );

  return {
    items: rows.map((r) => ({
      storyId: r.story_id,
      title: r.title,
      isFavorite: !!r.is_favorite,
      createdAt: r.created_at,
    })),
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
    },
  };
}

/**
 * 동화 삭제 (소유권 확인 포함 — child_profile_id 일치하는 것만 삭제)
 */
async function deleteStory(childProfileId, storyId) {
  const [result] = await pool.execute(
    `DELETE FROM stories WHERE story_id = ? AND child_profile_id = ?`,
    [storyId, childProfileId]
  );

  if (result.affectedRows === 0) {
    const error = new Error('동화를 찾을 수 없습니다.');
    error.statusCode = 404;
    throw error;
  }

  return { deleted: true };
}

module.exports = { listStories, deleteStory };