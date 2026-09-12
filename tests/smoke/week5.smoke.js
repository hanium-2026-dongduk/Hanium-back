/**
 * Week5 B 전체 플로우 스모크 테스트.
 * 실행: node tests/smoke/week5.smoke.js
 * 전제: .env DB 연결 설정 완료, 서버가 로컬에서 실행 중(npm run dev), 유효한 accessToken 필요.
 * 환경변수: SMOKE_BASE_URL, SMOKE_ACCESS_TOKEN, SMOKE_CHILD_PROFILE_ID, SMOKE_CHARACTER_ID
 */
require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000/api';
const TOKEN = process.env.SMOKE_ACCESS_TOKEN;
const CHILD_PROFILE_ID = process.env.SMOKE_CHILD_PROFILE_ID;
const CHARACTER_ID = process.env.SMOKE_CHARACTER_ID || 1;

const client = axios.create({
  baseURL: BASE_URL,
  headers: { Authorization: `Bearer ${TOKEN}` },
});

async function run() {
  console.log('1. 동화 생성...');
  const storyRes = await client.post('/stories', {
    characterId: CHARACTER_ID,
    background: '숲속',
    mainEvent: '보물찾기',
    childAge: 6,
    childProfileId: CHILD_PROFILE_ID,
  });
  const storyId = storyRes.data.data.storyId;
  console.log('  → storyId:', storyId);

  console.log('2. 내 책장 조회...');
  const listRes = await client.get('/stories', { params: { child_profile_id: CHILD_PROFILE_ID } });
  console.log('  → 책장 항목 수:', listRes.data.data.pagination.totalCount);

  console.log('3. 동화 상세 조회 (story_read 미션 트리거)...');
  await client.get(`/stories/${storyId}`, { params: { child_profile_id: CHILD_PROFILE_ID } });
  console.log('  → 조회 완료');

  console.log('4. 즐겨찾기 등록...');
  await client.post('/favorites', { child_profile_id: CHILD_PROFILE_ID, story_id: storyId });
  console.log('  → 등록 완료');

  console.log('5. 단어 클릭 미션 기록 후 단어장 저장...');
  await client.post('/missions/word-click', { child_profile_id: CHILD_PROFILE_ID });
  await client.post('/vocabulary', {
    child_profile_id: CHILD_PROFILE_ID,
    story_id: storyId,
    english_word: 'brave',
    korean_meaning: '용감한',
  });
  console.log('  → 저장 완료');

  console.log('6. 퀴즈 생성...');
  const quizRes = await client.post('/quizzes/generate', { child_profile_id: CHILD_PROFILE_ID, story_id: storyId });
  const quizSetId = quizRes.data.data.quizSetId;
  console.log('  → quizSetId:', quizSetId, '문항 수:', quizRes.data.data.questionCount);

  console.log('7. 퀴즈 조회 후 채점 제출 (quiz_answered 미션+포인트 트리거)...');
  const quizDetailRes = await client.get(`/quizzes/${quizSetId}`, {
    params: { child_profile_id: CHILD_PROFILE_ID },
  });
  const questions = quizDetailRes.data.data.questions;
  const answers = questions.map((q) => ({ questionId: q.questionId, selectedOptionId: q.options[0].optionId }));

  const submitRes = await client.post(`/quizzes/${quizSetId}/submit`, {
    child_profile_id: CHILD_PROFILE_ID,
    answers,
  });
  console.log('  → 점수:', submitRes.data.data.score, '적립 포인트:', submitRes.data.data.pointsEarned);

  console.log('8. 대시보드 조회...');
  const dashRes = await client.get(`/dashboard/${CHILD_PROFILE_ID}`);
  console.log('  →', dashRes.data.data);

  console.log('9. 공개 설정 변경...');
  await client.put(`/stories/${storyId}/public`, { child_profile_id: CHILD_PROFILE_ID, is_public: true });
  console.log('  → 공개 설정 완료');

  console.log('10. 공개 동화 탐색...');
  const exploreRes = await client.get('/stories/explore');
  console.log('  → 공개 동화 수:', exploreRes.data.data.pagination.totalCount);

  console.log('11. 퀴즈 풀이 기록 목록 조회...');
  const attemptsRes = await client.get('/quizzes/attempts', { params: { child_profile_id: CHILD_PROFILE_ID } });
  console.log('  → 풀이 기록 수:', attemptsRes.data.data.pagination.totalCount);

  console.log('\n✅ 스모크 테스트 전체 완료 (11단계)');
}

run().catch((err) => {
  console.error('❌ 실패:', err.response?.data || err.message);
  process.exit(1);
});
