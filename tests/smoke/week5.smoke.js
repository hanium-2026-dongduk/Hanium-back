/**
 * 콘텐츠 전체 흐름을 실제 MySQL + HTTP로 검증한다.
 * 외부 AI 호출은 CI의 비용·비결정성을 피하기 위해 생성 완료 상태의 동화/퀴즈 fixture로 대체한다.
 */
'use strict';

const nodemailerPath = require.resolve('nodemailer');
require.cache[nodemailerPath] = {
  id: nodemailerPath,
  filename: nodemailerPath,
  loaded: true,
  exports: { createTransport: () => ({ sendMail: async () => ({ accepted: ['smoke@example.com'] }) }) },
};

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'smoke-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'smoke-refresh-secret';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'ci-not-used';

if (!process.env.DB_NAME) {
  console.error('DB_NAME 환경변수가 필요합니다 (스모크 테스트 전용 빈 DB를 지정하세요).');
  process.exit(1);
}

const assert = require('assert');
const request = require('supertest');

const waitUntil = async (predicate, timeoutMs = 3000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`비동기 후처리가 ${timeoutMs}ms 안에 완료되지 않았습니다.`);
};

async function main() {
  const {
    sequelize,
    EmailVerification,
    Character,
    Story,
    StoryPage,
    QuizSet,
    QuizQuestion,
    QuizOption,
    DailyMission,
    RewardWallet,
    StoryReadLog,
    VocabularyEntry,
    QuizAttempt,
  } = require('../../src/models');
  const app = require('../../src/app');

  await sequelize.authenticate();
  await sequelize.sync({ force: true });

  const email = `week5_${Date.now()}@example.com`;
  const password = 'abcd1234!';
  await request(app).post('/api/auth/email/send').send({ email });
  const verification = await EmailVerification.findOne({
    where: { email, purpose: 'signup', is_verified: false },
    order: [['created_at', 'DESC']],
  });
  await request(app).post('/api/auth/email/verify').send({ email, code: verification.code });
  await request(app).post('/api/auth/signup').send({ email, password });
  const login = await request(app).post('/api/auth/login').send({ email, password });
  assert.strictEqual(login.status, 200, JSON.stringify(login.body));
  const auth = { Authorization: `Bearer ${login.body.data.accessToken}` };

  const childRes = await request(app)
    .post('/api/children')
    .set(auth)
    .send({ child_name: '통합테스트', age: 7 });
  assert.strictEqual(childRes.status, 201, JSON.stringify(childRes.body));
  const childId = childRes.body.data.profile.child_profile_id;

  const character = await Character.create({ name: '토리', personality: '용감함', type: 'PRESET' });
  const story = await Story.create({
    child_profile_id: childId,
    character_id: character.character_id,
    title: '토리의 모험',
    background: '숲속',
    main_event: '보물찾기',
    child_age: 7,
  });
  await StoryPage.create({ story_id: story.story_id, page_number: 1, content: '토리는 숲으로 갔어요.' });

  const detail = await request(app)
    .get(`/api/stories/${story.story_id}?child_profile_id=${childId}`)
    .set(auth);
  assert.strictEqual(detail.status, 200, JSON.stringify(detail.body));
  // 동화 읽기 로그·미션·배지는 응답을 막지 않는 best-effort 후처리다.
  await waitUntil(async () => (
    await StoryReadLog.count({ where: { child_profile_id: childId } })
  ) === 1);
  assert.strictEqual(await StoryReadLog.count({ where: { child_profile_id: childId } }), 1);

  const favorite = await request(app)
    .post('/api/favorites')
    .set(auth)
    .send({ child_profile_id: childId, story_id: story.story_id });
  assert.strictEqual(favorite.status, 201, JSON.stringify(favorite.body));

  for (let i = 0; i < 5; i += 1) {
    const click = await request(app)
      .post('/api/missions/word-click')
      .set(auth)
      .send({ child_profile_id: childId });
    assert.strictEqual(click.status, 200, JSON.stringify(click.body));
  }
  const wordMission = await DailyMission.findOne({
    where: { child_profile_id: childId, mission_type: 'word_clicked' },
  });
  assert.strictEqual(wordMission.status, 'rewarded');
  assert.strictEqual(wordMission.progress_count, 5);

  const vocabulary = await request(app).post('/api/vocabulary').set(auth).send({
    child_profile_id: childId,
    story_id: story.story_id,
    english_word: 'brave',
    korean_meaning: '용감한',
  });
  assert.strictEqual(vocabulary.status, 201, JSON.stringify(vocabulary.body));
  assert.strictEqual(await VocabularyEntry.count({ where: { child_profile_id: childId } }), 1);

  const quizSet = await QuizSet.create({ story_id: story.story_id, status: 'ready', source_type: 'story' });
  const answers = [];
  for (let i = 1; i <= 5; i += 1) {
    const question = await QuizQuestion.create({
      quiz_set_id: quizSet.quiz_set_id,
      question_order: i,
      question_text: `${i}번 문제`,
    });
    for (let j = 1; j <= 4; j += 1) {
      const option = await QuizOption.create({
        quiz_question_id: question.quiz_question_id,
        option_order: j,
        option_text: `${j}번 보기`,
        is_correct: j === 1,
      });
      if (j === 1) answers.push({ questionId: question.quiz_question_id, selectedOptionId: option.quiz_option_id });
    }
  }

  const quiz = await request(app)
    .get(`/api/quizzes/${quizSet.quiz_set_id}?child_profile_id=${childId}`)
    .set(auth);
  assert.strictEqual(quiz.status, 200, JSON.stringify(quiz.body));
  assert.strictEqual(quiz.body.data.questions.length, 5);
  assert.ok(!JSON.stringify(quiz.body).includes('is_correct'), '정답 정보가 조회 응답에 노출됐습니다.');

  const submit = await request(app)
    .post(`/api/quizzes/${quizSet.quiz_set_id}/submit`)
    .set(auth)
    .send({ child_profile_id: childId, answers });
  assert.strictEqual(submit.status, 201, JSON.stringify(submit.body));
  assert.strictEqual(submit.body.data.score, 100);
  assert.strictEqual(await QuizAttempt.count({ where: { child_profile_id: childId } }), 1);

  const dashboard = await request(app).get(`/api/dashboard/${childId}`).set(auth);
  assert.strictEqual(dashboard.status, 200, JSON.stringify(dashboard.body));
  assert.strictEqual(Number(dashboard.body.data.storyCount), 1);
  assert.strictEqual(dashboard.body.data.vocabularyCount, 1);
  assert.strictEqual(dashboard.body.data.quizStats.totalAttempts, 1);

  const wallet = await RewardWallet.findOne({ where: { child_profile_id: childId } });
  assert.ok(wallet.points >= 60, `예상보다 포인트가 적습니다: ${wallet.points}`);

  console.log('✅ Week5 콘텐츠 전체 흐름 스모크 완료');
  await sequelize.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Week5 스모크 실패:', err);
  process.exit(1);
});
