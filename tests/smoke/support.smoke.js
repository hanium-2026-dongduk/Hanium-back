/**
 * #37 고객지원 API를 마이그레이션 스모크가 만든 MySQL 스키마에서 호출한다.
 * CI에서 smoke:migration 직후 실행한다. 운영 DB 오실행을 막기 위해 DB 이름을 고정한다.
 */
'use strict';

if (process.env.DB_NAME !== 'hanium_migration_check') {
  throw new Error('DB_NAME=hanium_migration_check 스모크 전용 DB에서만 실행할 수 있습니다.');
}

const assert = require('assert');
const request = require('supertest');
const { generateAccessToken } = require('../../src/utils/jwt');
const { sequelize, User, Notice, Event, Faq, Inquiry } = require('../../src/models');
const app = require('../../src/app');

const expectStatus = (result, status) => {
  assert.strictEqual(result.status, status, JSON.stringify(result.body));
  return result.body.data;
};

async function main() {
  await sequelize.authenticate();
  const created = { users: [], notices: [], events: [], faqs: [], inquiries: [] };
  const now = Date.now();

  try {
    const owner = await User.create({ email: `support_owner_${now}@example.com`, password_hash: 'smoke-only' });
    const stranger = await User.create({ email: `support_other_${now}@example.com`, password_hash: 'smoke-only' });
    created.users.push(owner.user_id, stranger.user_id);
    const ownerAuth = (req) => req.set('Authorization', `Bearer ${generateAccessToken({ user_id: owner.user_id, email: owner.email, role: 'parent' })}`);
    const strangerAuth = (req) => req.set('Authorization', `Bearer ${generateAccessToken({ user_id: stranger.user_id, email: stranger.email, role: 'parent' })}`);

    const notice = await Notice.create({ title: '스모크 공지', content: '공지 내용', is_published: true, published_at: new Date(now - 60_000) });
    const hiddenNotice = await Notice.create({ title: '비공개 공지', content: '숨김', is_published: false, published_at: new Date(now - 60_000) });
    created.notices.push(notice.notice_id, hiddenNotice.notice_id);

    const noticeList = expectStatus(await ownerAuth(request(app).get('/api/notices')), 200);
    assert.ok(noticeList.items.some((item) => item.notice_id === notice.notice_id && item.is_read === false));
    assert.ok(!noticeList.items.some((item) => item.notice_id === hiddenNotice.notice_id));
    expectStatus(await ownerAuth(request(app).get(`/api/notices/${hiddenNotice.notice_id}`)), 404);
    assert.strictEqual(expectStatus(await ownerAuth(request(app).get(`/api/notices/${notice.notice_id}`)), 200).notice.is_read, false);
    const firstRead = expectStatus(await ownerAuth(request(app).post(`/api/notices/${notice.notice_id}/read`)), 200);
    const secondRead = expectStatus(await ownerAuth(request(app).post(`/api/notices/${notice.notice_id}/read`)), 200);
    assert.strictEqual(firstRead.read_at, secondRead.read_at);
    assert.strictEqual(expectStatus(await strangerAuth(request(app).get(`/api/notices/${notice.notice_id}`)), 200).notice.is_read, false);
    console.log('✓ 공지 목록·상세·계정별 읽음');

    const ongoing = await Event.create({ title: '진행 중', content: '이벤트', starts_at: new Date(now - 60_000), ends_at: new Date(now + 60_000), is_published: true });
    const ended = await Event.create({ title: '종료', content: '이벤트', starts_at: new Date(now - 180_000), ends_at: new Date(now - 120_000), is_published: true });
    const upcoming = await Event.create({ title: '예정', content: '이벤트', starts_at: new Date(now + 120_000), ends_at: new Date(now + 180_000), is_published: true });
    created.events.push(ongoing.event_id, ended.event_id, upcoming.event_id);
    const ongoingList = expectStatus(await ownerAuth(request(app).get('/api/events?status=ongoing')), 200);
    const endedList = expectStatus(await ownerAuth(request(app).get('/api/events?status=ended')), 200);
    assert.ok(ongoingList.items.some((item) => item.event_id === ongoing.event_id));
    assert.ok(endedList.items.some((item) => item.event_id === ended.event_id));
    assert.ok(!ongoingList.items.some((item) => item.event_id === upcoming.event_id));
    assert.strictEqual(expectStatus(await ownerAuth(request(app).get(`/api/events/${ended.event_id}`)), 200).event.status, 'ended');
    console.log('✓ 이벤트 진행 상태·상세');

    const faq = await Faq.create({ question: '비밀번호 변경 방법', answer: '설정 화면에서 변경', is_published: true, is_recommended: true });
    const hiddenFaq = await Faq.create({ question: '비공개 질문', answer: '숨김', is_published: false, is_recommended: true });
    created.faqs.push(faq.faq_id, hiddenFaq.faq_id);
    const faqList = expectStatus(await ownerAuth(request(app).get('/api/faqs?keyword=비밀번호')), 200);
    const recommended = expectStatus(await ownerAuth(request(app).get('/api/faqs/recommended')), 200);
    assert.ok(faqList.items.some((item) => item.faq_id === faq.faq_id));
    assert.ok(recommended.items.some((item) => item.faq_id === faq.faq_id));
    assert.ok(!recommended.items.some((item) => item.faq_id === hiddenFaq.faq_id));
    console.log('✓ FAQ 검색·추천');

    const inquiry = expectStatus(await ownerAuth(request(app).post('/api/inquiries').send({ title: '문의', content: '내용' })), 201).inquiry;
    created.inquiries.push(inquiry.inquiry_id);
    const ownerList = expectStatus(await ownerAuth(request(app).get('/api/inquiries')), 200);
    assert.ok(ownerList.items.some((item) => item.inquiry_id === inquiry.inquiry_id));
    expectStatus(await strangerAuth(request(app).get(`/api/inquiries/${inquiry.inquiry_id}`)), 404);
    await Inquiry.update({ answer: '답변', answered_at: new Date() }, { where: { inquiry_id: inquiry.inquiry_id } });
    const detail = expectStatus(await ownerAuth(request(app).get(`/api/inquiries/${inquiry.inquiry_id}`)), 200).inquiry;
    assert.strictEqual(detail.status, 'answered');
    assert.strictEqual(detail.answer, '답변');
    console.log('✓ 문의 등록·내 목록·상세·답변·타 계정 차단');
  } finally {
    await Inquiry.destroy({ where: { inquiry_id: created.inquiries } });
    await Notice.destroy({ where: { notice_id: created.notices } });
    await Event.destroy({ where: { event_id: created.events } });
    await Faq.destroy({ where: { faq_id: created.faqs } });
    await User.destroy({ where: { user_id: created.users } });
    await sequelize.close();
  }
}

main().catch((error) => {
  console.error('고객지원 MySQL 스모크 실패:', error);
  process.exitCode = 1;
});
