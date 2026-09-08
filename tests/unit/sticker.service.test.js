jest.mock('../../src/models', () => ({
  StickerSend: { create: jest.fn(), findAndCountAll: jest.fn() },
}));

jest.mock('../../src/services/child.service', () => ({
  getById: jest.fn(),
}));

const { StickerSend } = require('../../src/models');
const childService = require('../../src/services/child.service');
const stickerService = require('../../src/services/sticker.service');
const { STICKER_CATALOG, MAX_MESSAGE_LENGTH } = require('../../src/config/stickerCatalog');

const USER_ID = 10;
const CHILD_ID = 1;

const buildRow = (overrides = {}) => ({
  sticker_send_id: 1,
  child_profile_id: CHILD_ID,
  sender_user_id: USER_ID,
  sticker_code: 'well_done',
  message: null,
  sent_at: new Date('2026-08-20T00:00:00Z'),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  childService.getById.mockResolvedValue({ child_profile_id: CHILD_ID });
  StickerSend.create.mockImplementation(async (values) => buildRow(values));
});

describe('스티커 카탈로그', () => {
  test('모든 스티커는 고유한 sticker_code를 갖는다', () => {
    const codes = STICKER_CATALOG.map((s) => s.sticker_code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test('getCatalog은 전체 스티커를 돌려준다', () => {
    const { stickers } = stickerService.getCatalog();

    expect(stickers).toHaveLength(STICKER_CATALOG.length);
    expect(stickers[0]).toEqual(
      expect.objectContaining({
        sticker_code: expect.any(String),
        name: expect.any(String),
        icon_key: expect.any(String),
      })
    );
  });
});

describe('스티커 발송은', () => {
  test('자녀에게 스티커를 기록하고 표시 정보를 붙여 돌려준다', async () => {
    const result = await stickerService.send(USER_ID, {
      childProfileId: CHILD_ID,
      stickerCode: 'well_done',
    });

    expect(StickerSend.create).toHaveBeenCalledWith(
      expect.objectContaining({
        child_profile_id: CHILD_ID,
        sender_user_id: USER_ID,
        sticker_code: 'well_done',
      })
    );
    expect(result.sticker).toMatchObject({ sticker_code: 'well_done', name: '잘했어요' });
  });

  test('한마디를 함께 저장한다', async () => {
    await stickerService.send(USER_ID, {
      childProfileId: CHILD_ID,
      stickerCode: 'well_done',
      message: '오늘 정말 잘했어!',
    });

    expect(StickerSend.create).toHaveBeenCalledWith(
      expect.objectContaining({ message: '오늘 정말 잘했어!' })
    );
  });

  test('공백만 있는 한마디는 없는 것으로 본다', async () => {
    await stickerService.send(USER_ID, {
      childProfileId: CHILD_ID,
      stickerCode: 'well_done',
      message: '   ',
    });

    expect(StickerSend.create).toHaveBeenCalledWith(expect.objectContaining({ message: null }));
  });

  test('알 수 없는 스티커는 400이고, 소유권 확인까지 가지 않는다', async () => {
    await expect(
      stickerService.send(USER_ID, { childProfileId: CHILD_ID, stickerCode: 'hacking' })
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(childService.getById).not.toHaveBeenCalled();
    expect(StickerSend.create).not.toHaveBeenCalled();
  });

  test('한마디가 너무 길면 400', async () => {
    await expect(
      stickerService.send(USER_ID, {
        childProfileId: CHILD_ID,
        stickerCode: 'well_done',
        message: 'ㄱ'.repeat(MAX_MESSAGE_LENGTH + 1),
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(StickerSend.create).not.toHaveBeenCalled();
  });

  test('남의 자녀에게는 보낼 수 없다', async () => {
    const notFound = Object.assign(new Error('자녀 프로필을 찾을 수 없습니다.'), {
      statusCode: 404,
    });
    childService.getById.mockRejectedValue(notFound);

    await expect(
      stickerService.send(USER_ID, { childProfileId: 999, stickerCode: 'well_done' })
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(StickerSend.create).not.toHaveBeenCalled();
  });

  test('같은 스티커를 여러 번 보낼 수 있다', async () => {
    // 배지와 달리 멱등하지 않다 — 계속 주고받는 것이 정상이다.
    await stickerService.send(USER_ID, { childProfileId: CHILD_ID, stickerCode: 'well_done' });
    await stickerService.send(USER_ID, { childProfileId: CHILD_ID, stickerCode: 'well_done' });

    expect(StickerSend.create).toHaveBeenCalledTimes(2);
  });
});

describe('받은 스티커 조회는', () => {
  beforeEach(() => {
    StickerSend.findAndCountAll.mockResolvedValue({
      count: 1,
      rows: [buildRow({ message: '잘했어!' })],
    });
  });

  test('최신순으로 조회하고 PK를 보조 정렬키로 쓴다', async () => {
    await stickerService.getReceived(USER_ID, CHILD_ID);

    expect(StickerSend.findAndCountAll).toHaveBeenCalledWith(
      expect.objectContaining({
        order: [
          ['sent_at', 'DESC'],
          ['sticker_send_id', 'DESC'],
        ],
      })
    );
  });

  test('카탈로그의 이름·아이콘을 붙여 돌려준다', async () => {
    const result = await stickerService.getReceived(USER_ID, CHILD_ID);

    expect(result.items[0]).toMatchObject({
      sticker_code: 'well_done',
      name: '잘했어요',
      icon_key: 'thumbs_up',
      message: '잘했어!',
    });
  });

  test('카탈로그에서 사라진 코드도 목록에서 빠지지 않는다', async () => {
    // 아이가 받은 칭찬 기록이 카탈로그 변경으로 사라지면 안 된다.
    StickerSend.findAndCountAll.mockResolvedValue({
      count: 1,
      rows: [buildRow({ sticker_code: 'retired_sticker' })],
    });

    const result = await stickerService.getReceived(USER_ID, CHILD_ID);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      sticker_code: 'retired_sticker',
      name: 'retired_sticker',
      icon_key: null,
    });
  });

  test('페이지네이션 정보를 함께 준다', async () => {
    StickerSend.findAndCountAll.mockResolvedValue({ count: 45, rows: [] });

    const result = await stickerService.getReceived(USER_ID, CHILD_ID, { page: 2, limit: 20 });

    expect(result.pagination).toEqual({ page: 2, limit: 20, totalCount: 45, totalPages: 3 });
    expect(StickerSend.findAndCountAll).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, offset: 20 })
    );
  });

  test('limit이 상한을 넘으면 상한으로 자른다', async () => {
    await stickerService.getReceived(USER_ID, CHILD_ID, { limit: 9999 });

    expect(StickerSend.findAndCountAll).toHaveBeenCalledWith(
      expect.objectContaining({ limit: stickerService.MAX_LIMIT })
    );
  });

  test('잘못된 page/limit은 기본값으로 떨어진다', async () => {
    await stickerService.getReceived(USER_ID, CHILD_ID, { page: 0, limit: -5 });

    expect(StickerSend.findAndCountAll).toHaveBeenCalledWith(
      expect.objectContaining({ limit: stickerService.DEFAULT_LIMIT, offset: 0 })
    );
  });

  test('남의 자녀면 404', async () => {
    const notFound = Object.assign(new Error('자녀 프로필을 찾을 수 없습니다.'), {
      statusCode: 404,
    });
    childService.getById.mockRejectedValue(notFound);

    await expect(stickerService.getReceived(USER_ID, 999)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
