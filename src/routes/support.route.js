const express = require('express');
const { authenticate } = require('../middlewares/auth');
const c = require('../controllers/support.controller');

const router = express.Router();

/**
 * @openapi
 * /notices:
 *   get:
 *     tags: [고객지원]
 *     summary: 게시된 공지 목록 (CS01)
 *     description: 공개 시각이 지난 공지만 최신순으로 반환한다. 읽음 여부는 보호자 계정별이다.
 *     parameters:
 *       - $ref: '#/components/parameters/supportPage'
 *       - $ref: '#/components/parameters/supportLimit'
 *     responses:
 *       200:
 *         description: 공지 목록
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/NoticeListResponse' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/notices', authenticate, c.pageValidation, c.listNotices);

/**
 * @openapi
 * /notices/{id}:
 *   get:
 *     tags: [고객지원]
 *     summary: 공지 상세 (CS01)
 *     parameters:
 *       - $ref: '#/components/parameters/supportId'
 *     responses:
 *       200:
 *         description: 공지 상세. data.notice에 Notice가 담긴다.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/NoticeDetailResponse' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/notices/:id', authenticate, c.idValidation, c.getNotice);

/**
 * @openapi
 * /notices/{id}/read:
 *   post:
 *     tags: [고객지원]
 *     summary: 공지 읽음 처리 (CS01)
 *     description: 같은 계정이 여러 번 호출해도 최초 읽은 시각이 유지된다.
 *     parameters:
 *       - $ref: '#/components/parameters/supportId'
 *     responses:
 *       200:
 *         description: 읽음 처리. data에 notice_id, is_read, read_at을 반환한다.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/NoticeReadResponse' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/notices/:id/read', authenticate, c.idValidation, c.markNoticeRead);

/**
 * @openapi
 * /events:
 *   get:
 *     tags: [고객지원]
 *     summary: 진행 중 또는 지난 이벤트 목록 (CS02)
 *     description: 시작 전 이벤트와 비공개 이벤트는 반환하지 않는다. status 기본값은 ongoing이다.
 *     parameters:
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [ongoing, ended], default: ongoing }
 *       - $ref: '#/components/parameters/supportPage'
 *       - $ref: '#/components/parameters/supportLimit'
 *     responses:
 *       200:
 *         description: 이벤트 목록
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/EventListResponse' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/events', authenticate, c.eventListValidation, c.listEvents);

/**
 * @openapi
 * /events/{id}:
 *   get:
 *     tags: [고객지원]
 *     summary: 이벤트 상세 (CS02)
 *     parameters:
 *       - $ref: '#/components/parameters/supportId'
 *     responses:
 *       200:
 *         description: 이벤트 상세. data.event에 Event가 담긴다.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/EventDetailResponse' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/events/:id', authenticate, c.idValidation, c.getEvent);

/**
 * @openapi
 * /faqs:
 *   get:
 *     tags: [고객지원]
 *     summary: FAQ 목록과 검색 (CS03)
 *     description: keyword가 있으면 질문과 답변을 검색한다. 표시 순서, ID 순으로 반환한다.
 *     parameters:
 *       - name: keyword
 *         in: query
 *         schema: { type: string, maxLength: 100 }
 *       - $ref: '#/components/parameters/supportPage'
 *       - $ref: '#/components/parameters/supportLimit'
 *     responses:
 *       200:
 *         description: FAQ 목록
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/FaqListResponse' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/faqs', authenticate, c.faqListValidation, c.listFaqs);

/**
 * @openapi
 * /faqs/recommended:
 *   get:
 *     tags: [고객지원]
 *     summary: 추천 FAQ 목록 (CS03)
 *     parameters:
 *       - $ref: '#/components/parameters/supportPage'
 *       - $ref: '#/components/parameters/supportLimit'
 *     responses:
 *       200:
 *         description: 추천 FAQ 목록
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/FaqListResponse' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/faqs/recommended', authenticate, c.pageValidation, c.recommendedFaqs);

/**
 * @openapi
 * /inquiries:
 *   post:
 *     tags: [고객지원]
 *     summary: 1:1 문의 등록 (CS04)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, content]
 *             properties:
 *               title: { type: string, maxLength: 200 }
 *               content: { type: string, maxLength: 5000 }
 *     responses:
 *       201:
 *         description: 등록된 문의. data.inquiry에 Inquiry가 담긴다.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/InquiryDetailResponse' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *   get:
 *     tags: [고객지원]
 *     summary: 내 1:1 문의 목록 (CS04)
 *     parameters:
 *       - $ref: '#/components/parameters/supportPage'
 *       - $ref: '#/components/parameters/supportLimit'
 *     responses:
 *       200:
 *         description: 내 문의 목록
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/InquiryListResponse' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/inquiries', authenticate, c.inquiryCreateValidation, c.createInquiry);
router.get('/inquiries', authenticate, c.pageValidation, c.listInquiries);

/**
 * @openapi
 * /inquiries/{id}:
 *   get:
 *     tags: [고객지원]
 *     summary: 내 1:1 문의 상세와 답변 (CS04)
 *     description: 다른 계정의 문의는 404를 반환한다.
 *     parameters:
 *       - $ref: '#/components/parameters/supportId'
 *     responses:
 *       200:
 *         description: 문의 상세
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/InquiryDetailResponse' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/inquiries/:id', authenticate, c.idValidation, c.getInquiry);

module.exports = router;
