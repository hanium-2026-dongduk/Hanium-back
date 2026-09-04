const { StickerSend } = require('../models');
const childService = require('./child.service');
const {
  STICKER_CATALOG,
  MAX_MESSAGE_LENGTH,
  getStickerDefinition,
} = require('../config/stickerCatalog');

/**
 * 칭찬 스티커 서비스 (PD04_STK_01 — 발송, MP05_STK_01 — 수신 목록 조회).
 *
 * 스티커 종류는 코드 상수(src/config/stickerCatalog.js), 발송 기록만 DB(sticker_sends)다.
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const badRequest = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

/**
 * 전체 스티커 카탈로그. 보호자가 무엇을 보낼 수 있는지 고르는 화면에서 쓴다.
 * @returns {{ stickers: Array }}
 */
const getCatalog = () => {
  return { stickers: STICKER_CATALOG.map((sticker) => ({ ...sticker })) };
};

/**
 * 자녀에게 칭찬 스티커를 보낸다 (PD04_STK_01).
 *
 * 배지와 달리 멱등하지 않다 — 같은 스티커를 여러 번 보내는 것이 정상이기 때문이다.
 * 그래서 네트워크 재시도로 중복 발송될 수 있는데, 스티커는 중복돼도 해로운 부작용이
 * 없어(포인트가 나가지 않는다) 멱등키를 두지 않았다.
 *
 * @param {number} userId - 보내는 보호자. 소유권 검증에도 쓴다.
 * @param {object} params
 * @param {number} params.childProfileId
 * @param {string} params.stickerCode
 * @param {string} [params.message] - 함께 보내는 한마디(선택)
 * @returns {Promise<{ sticker: object }>}
 */
const send = async (userId, { childProfileId, stickerCode, message }) => {
  const definition = getStickerDefinition(stickerCode);
  if (!definition) {
    throw badRequest('알 수 없는 스티커입니다.');
  }

  const trimmed = typeof message === 'string' ? message.trim() : undefined;
  if (trimmed && trimmed.length > MAX_MESSAGE_LENGTH) {
    throw badRequest(`한마디는 ${MAX_MESSAGE_LENGTH}자까지 쓸 수 있습니다.`);
  }

  // 남의 자녀에게는 보낼 수 없다(404).
  const profile = await childService.getById(userId, childProfileId);

  const row = await StickerSend.create({
    child_profile_id: profile.child_profile_id,
    sender_user_id: userId,
    sticker_code: stickerCode,
    // 공백만 있는 한마디는 없는 것으로 본다.
    message: trimmed || null,
    sent_at: new Date(),
  });

  return { sticker: toResponse(row, definition) };
};

/**
 * 자녀가 받은 스티커 목록 (MP05_STK_01). 최신순 페이지네이션.
 *
 * @param {number} userId - 소유권 검증용
 * @param {number} childProfileId
 * @param {object} [query]
 * @param {number} [query.page=1]
 * @param {number} [query.limit=20]
 * @returns {Promise<{ items: Array, pagination: object }>}
 */
const getReceived = async (userId, childProfileId, { page = 1, limit = DEFAULT_LIMIT } = {}) => {
  const profile = await childService.getById(userId, childProfileId);

  const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
  const safeLimit =
    Number.isInteger(limit) && limit >= 1 ? Math.min(limit, MAX_LIMIT) : DEFAULT_LIMIT;

  const { count, rows } = await StickerSend.findAndCountAll({
    where: { child_profile_id: profile.child_profile_id },
    order: [
      ['sent_at', 'DESC'],
      // 같은 초에 여러 건이 들어오면 sent_at만으로는 순서가 불안정해 페이지 경계에서
      // 항목이 중복/누락된다. PK를 보조 정렬키로 두어 전순서를 확정한다.
      ['sticker_send_id', 'DESC'],
    ],
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit,
  });

  return {
    items: rows.map((row) => toResponse(row, getStickerDefinition(row.sticker_code))),
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount: count,
      totalPages: Math.ceil(count / safeLimit),
    },
  };
};

/**
 * 발송 기록에 카탈로그의 표시 정보를 붙여 응답 형태로 만든다.
 *
 * 카탈로그에서 사라진 코드(과거에 보냈지만 지금은 없는 스티커)도 목록에서 빠지지 않도록
 * 이름·아이콘이 없으면 코드를 그대로 이름에 넣는다 — 아이가 받은 칭찬이 사라지면 안 된다.
 */
const toResponse = (row, definition) => ({
  sticker_send_id: Number(row.sticker_send_id),
  sticker_code: row.sticker_code,
  name: definition?.name ?? row.sticker_code,
  icon_key: definition?.icon_key ?? null,
  message: row.message,
  sent_at: row.sent_at,
});

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  getCatalog,
  send,
  getReceived,
};
