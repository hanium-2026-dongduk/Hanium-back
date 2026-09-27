jest.mock('../../src/models', () => ({
  Notice: { findAndCountAll: jest.fn(), findOne: jest.fn() },
  NoticeRead: { findAll: jest.fn(), findOne: jest.fn(), findOrCreate: jest.fn() },
  Event: { findAndCountAll: jest.fn(), findOne: jest.fn() },
  Faq: { findAndCountAll: jest.fn() },
  Inquiry: { create: jest.fn(), findAndCountAll: jest.fn(), findOne: jest.fn() },
}));

const { Op } = require('sequelize');
const { Notice, NoticeRead, Event, Faq, Inquiry } = require('../../src/models');
const service = require('../../src/services/support.service');

describe('고객지원 서비스', () => {
  test('공지 읽음 여부는 요청한 계정의 기록으로만 계산한다', async () => {
    Notice.findAndCountAll.mockResolvedValue({
      count: 2,
      rows: [
        { notice_id: 11, title: 'A', content: 'a', published_at: new Date() },
        { notice_id: 12, title: 'B', content: 'b', published_at: new Date() },
      ],
    });
    NoticeRead.findAll.mockResolvedValue([{ notice_id: 11 }]);

    const result = await service.listNotices(7);
    expect(NoticeRead.findAll.mock.calls[0][0].where.user_id).toBe(7);
    expect(result.items.map((item) => item.is_read)).toEqual([true, false]);
    expect(Notice.findAndCountAll.mock.calls[0][0].where.is_published).toBe(true);
  });

  test('읽음 처리 재호출 시 기존 기록을 사용한다', async () => {
    Notice.findOne.mockResolvedValue({ notice_id: 11 });
    const readAt = new Date('2026-09-27T00:00:00Z');
    NoticeRead.findOrCreate.mockResolvedValue([{ read_at: readAt }, false]);

    const result = await service.markNoticeRead(7, 11);
    expect(result.read_at).toBe(readAt);
    expect(NoticeRead.findOrCreate.mock.calls[0][0].where).toEqual({ notice_id: 11, user_id: 7 });
  });

  test('이벤트 목록은 진행 상태별 시간 조건을 적용한다', async () => {
    Event.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
    await service.listEvents({ status: 'ongoing' });
    await service.listEvents({ status: 'ended' });
    const ongoing = Event.findAndCountAll.mock.calls[0][0].where;
    const ended = Event.findAndCountAll.mock.calls[1][0].where;
    expect(ongoing.is_published).toBe(true);
    expect(ongoing.ends_at[Op.gte]).toBeInstanceOf(Date);
    expect(ended.ends_at[Op.lt]).toBeInstanceOf(Date);
    expect(ended.starts_at[Op.lte]).toBeInstanceOf(Date);
  });

  test('FAQ 검색은 게시된 항목의 질문과 답변을 검색한다', async () => {
    Faq.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
    await service.listFaqs({ keyword: '환불' });
    const where = Faq.findAndCountAll.mock.calls[0][0].where;
    expect(where.is_published).toBe(true);
    expect(where[Op.or]).toHaveLength(2);
  });

  test('문의 조회는 반드시 작성자 ID로 제한한다', async () => {
    Inquiry.findOne.mockResolvedValue(null);
    await expect(service.getInquiry(7, 42)).rejects.toMatchObject({ statusCode: 404 });
    expect(Inquiry.findOne.mock.calls[0][0].where).toEqual({ inquiry_id: 42, user_id: 7 });
  });
});
