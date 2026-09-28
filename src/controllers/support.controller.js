const { body, param, query, validationResult } = require('express-validator');
const support = require('../services/support.service');
const response = require('../utils/response');

const pageValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];
const idValidation = [param('id').isInt({ min: 1 }).toInt()];
const eventListValidation = [
  query('status').optional().isIn(['ongoing', 'ended']),
  ...pageValidation,
];
const faqListValidation = [
  query('keyword').optional().isString().trim().isLength({ max: 100 }),
  ...pageValidation,
];
const inquiryCreateValidation = [
  body('title').isString().trim().notEmpty().isLength({ max: 200 }),
  body('content').isString().trim().notEmpty().isLength({ max: 5000 }),
];

const pageOptions = (req) => ({
  page: Number(req.query.page || 1),
  limit: Number(req.query.limit || 20),
});

const handle = (work, statusCode, message) => async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return response.error(res, 400, '입력값을 확인해주세요.', errors.array());
  try {
    const result = await work(req);
    return response.success(res, statusCode, message, result);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  pageValidation,
  idValidation,
  eventListValidation,
  faqListValidation,
  inquiryCreateValidation,
  listNotices: handle((req) => support.listNotices(req.user.user_id, pageOptions(req)), 200, '공지 목록을 조회했습니다.'),
  getNotice: handle((req) => support.getNotice(req.user.user_id, Number(req.params.id)), 200, '공지를 조회했습니다.'),
  markNoticeRead: handle((req) => support.markNoticeRead(req.user.user_id, Number(req.params.id)), 200, '공지를 읽음 처리했습니다.'),
  listEvents: handle((req) => support.listEvents({ status: req.query.status || 'ongoing', ...pageOptions(req) }), 200, '이벤트 목록을 조회했습니다.'),
  getEvent: handle((req) => support.getEvent(Number(req.params.id)), 200, '이벤트를 조회했습니다.'),
  listFaqs: handle((req) => support.listFaqs({ keyword: req.query.keyword?.trim(), ...pageOptions(req) }), 200, 'FAQ 목록을 조회했습니다.'),
  recommendedFaqs: handle((req) => support.listFaqs({ recommendedOnly: true, ...pageOptions(req) }), 200, '추천 FAQ를 조회했습니다.'),
  createInquiry: handle((req) => support.createInquiry(req.user.user_id, { title: req.body.title, content: req.body.content }), 201, '문의가 등록되었습니다.'),
  listInquiries: handle((req) => support.listInquiries(req.user.user_id, pageOptions(req)), 200, '문의 목록을 조회했습니다.'),
  getInquiry: handle((req) => support.getInquiry(req.user.user_id, Number(req.params.id)), 200, '문의를 조회했습니다.'),
};
