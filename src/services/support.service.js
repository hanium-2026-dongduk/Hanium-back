const { Op } = require('sequelize');
const { Notice, NoticeRead, Event, Faq, Inquiry } = require('../models');

const PAGE_SIZE = 20;

const pagination = (count, page, limit) => ({
  page,
  limit,
  totalCount: count,
  totalPages: Math.max(1, Math.ceil(count / limit)),
});

const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });

const noticeVisible = (now) => ({ is_published: true, published_at: { [Op.lte]: now } });
const noticeItem = (row, isRead) => ({
  notice_id: row.notice_id,
  title: row.title,
  content: row.content,
  published_at: row.published_at,
  is_read: isRead,
});

async function listNotices(userId, { page = 1, limit = PAGE_SIZE } = {}) {
  const { count, rows } = await Notice.findAndCountAll({
    where: noticeVisible(new Date()),
    order: [['published_at', 'DESC'], ['notice_id', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  });
  const reads = rows.length ? await NoticeRead.findAll({
    where: { user_id: userId, notice_id: { [Op.in]: rows.map((row) => row.notice_id) } },
    attributes: ['notice_id'],
  }) : [];
  const readIds = new Set(reads.map((read) => String(read.notice_id)));
  return {
    items: rows.map((row) => noticeItem(row, readIds.has(String(row.notice_id)))),
    pagination: pagination(count, page, limit),
  };
}

async function getNotice(userId, noticeId) {
  const notice = await Notice.findOne({ where: { notice_id: noticeId, ...noticeVisible(new Date()) } });
  if (!notice) throw notFound('공지를 찾을 수 없습니다.');
  const read = await NoticeRead.findOne({ where: { notice_id: noticeId, user_id: userId } });
  return { notice: noticeItem(notice, !!read) };
}

async function markNoticeRead(userId, noticeId) {
  const notice = await Notice.findOne({ where: { notice_id: noticeId, ...noticeVisible(new Date()) } });
  if (!notice) throw notFound('공지를 찾을 수 없습니다.');
  // MySQL DATETIME은 밀리초를 저장하지 않는다. 최초 응답과 재조회 응답의 시각을 맞춘다.
  const readAt = new Date();
  readAt.setMilliseconds(0);
  const [read] = await NoticeRead.findOrCreate({
    where: { notice_id: noticeId, user_id: userId },
    defaults: { read_at: readAt },
  });
  return { notice_id: notice.notice_id, is_read: true, read_at: read.read_at };
}

const eventItem = (row, now) => ({
  event_id: row.event_id,
  title: row.title,
  content: row.content,
  starts_at: row.starts_at,
  ends_at: row.ends_at,
  status: new Date(row.ends_at) < now ? 'ended' : 'ongoing',
});

async function listEvents({ status = 'ongoing', page = 1, limit = PAGE_SIZE } = {}) {
  const now = new Date();
  const where = {
    is_published: true,
    starts_at: { [Op.lte]: now },
    ends_at: { [status === 'ended' ? Op.lt : Op.gte]: now },
  };
  const { count, rows } = await Event.findAndCountAll({
    where,
    order: [['starts_at', 'DESC'], ['event_id', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  });
  return { items: rows.map((row) => eventItem(row, now)), pagination: pagination(count, page, limit) };
}

async function getEvent(eventId) {
  const now = new Date();
  const event = await Event.findOne({
    where: { event_id: eventId, is_published: true, starts_at: { [Op.lte]: now } },
  });
  if (!event) throw notFound('이벤트를 찾을 수 없습니다.');
  return { event: eventItem(event, now) };
}

const faqItem = (row) => ({
  faq_id: row.faq_id,
  question: row.question,
  answer: row.answer,
  is_recommended: row.is_recommended,
});

async function listFaqs({ keyword, recommendedOnly = false, page = 1, limit = PAGE_SIZE } = {}) {
  const where = { is_published: true };
  if (recommendedOnly) where.is_recommended = true;
  if (keyword) {
    const escaped = keyword.replace(/[\\%_]/g, '\\$&');
    where[Op.or] = [
      { question: { [Op.like]: `%${escaped}%` } },
      { answer: { [Op.like]: `%${escaped}%` } },
    ];
  }
  const { count, rows } = await Faq.findAndCountAll({
    where,
    order: [['display_order', 'ASC'], ['faq_id', 'ASC']],
    limit,
    offset: (page - 1) * limit,
  });
  return { items: rows.map(faqItem), pagination: pagination(count, page, limit) };
}

const inquiryItem = (row) => ({
  inquiry_id: row.inquiry_id,
  title: row.title,
  content: row.content,
  status: row.answer && row.answer.trim() ? 'answered' : 'pending',
  answer: row.answer ?? null,
  answered_at: row.answered_at ?? null,
  created_at: row.created_at,
});

async function createInquiry(userId, { title, content }) {
  const inquiry = await Inquiry.create({ user_id: userId, title, content });
  return { inquiry: inquiryItem(inquiry) };
}

async function listInquiries(userId, { page = 1, limit = PAGE_SIZE } = {}) {
  const { count, rows } = await Inquiry.findAndCountAll({
    where: { user_id: userId },
    order: [['created_at', 'DESC'], ['inquiry_id', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  });
  return { items: rows.map(inquiryItem), pagination: pagination(count, page, limit) };
}

async function getInquiry(userId, inquiryId) {
  const inquiry = await Inquiry.findOne({ where: { inquiry_id: inquiryId, user_id: userId } });
  if (!inquiry) throw notFound('문의를 찾을 수 없습니다.');
  return { inquiry: inquiryItem(inquiry) };
}

module.exports = {
  listNotices, getNotice, markNoticeRead,
  listEvents, getEvent,
  listFaqs,
  createInquiry, listInquiries, getInquiry,
};
