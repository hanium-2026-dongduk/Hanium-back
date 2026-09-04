/**
 * 칭찬 스티커 카탈로그 (PD04_STK_01 — 칭찬 스티커 전송, MP05_STK_01 — 수신 목록 조회).
 *
 * 배지 카탈로그와 같은 이유로 DB 테이블(`praise_stickers`)이 아니라 코드 상수로 둔다
 * (docs/WEEK3_A_DESIGN.md 4절): 스티커 종류를 런타임에 조정할 관리자 UI가 없는 단계라,
 * 테이블과 시드 데이터를 늘리는 것보다 리뷰 가능한 PR로 관리하는 편이 낫다.
 * `sticker_sends.sticker_code`가 여기의 `sticker_code`를 참조한다(FK 아님).
 *
 * ⚠️ 스티커 종류와 문구는 예시이며 기획·디자인 확정이 필요하다.
 *
 * **sticker_code는 절대 바꾸지 말 것** — 이미 발송된 sticker_sends 행의 의미가 달라진다.
 * 스티커를 없앨 때도 카탈로그에서 지우면 과거에 받은 스티커가 목록에서 사라지므로,
 * 새 코드를 추가하는 쪽을 고려한다.
 */

/**
 * @typedef {object} Sticker
 * @property {string} sticker_code - 불변 식별자. sticker_sends에 저장된다.
 * @property {string} name - 아이에게 보여줄 이름
 * @property {string} icon_key - 프론트가 이미지에 매핑할 키 (URL이 아니라 키다 —
 *   이미지 교체 시 백엔드 배포가 필요 없도록)
 */

/** @type {Sticker[]} */
const STICKER_CATALOG = [
  { sticker_code: 'well_done', name: '잘했어요', icon_key: 'thumbs_up' },
  { sticker_code: 'awesome', name: '최고예요', icon_key: 'star' },
  { sticker_code: 'proud', name: '자랑스러워요', icon_key: 'heart' },
  { sticker_code: 'keep_going', name: '조금만 더!', icon_key: 'muscle' },
  { sticker_code: 'thank_you', name: '고마워요', icon_key: 'clover' },
  { sticker_code: 'love_you', name: '사랑해요', icon_key: 'hug' },
];

const STICKER_CODES = STICKER_CATALOG.map((sticker) => sticker.sticker_code);

/**
 * sticker_code에 해당하는 카탈로그 정의를 반환한다(없으면 undefined).
 * @param {string} stickerCode
 */
const getStickerDefinition = (stickerCode) => {
  return STICKER_CATALOG.find((sticker) => sticker.sticker_code === stickerCode);
};

/** 보호자가 함께 보낼 수 있는 한마디의 최대 길이. DB 컬럼(VARCHAR 200)과 맞춰야 한다. */
const MAX_MESSAGE_LENGTH = 200;

module.exports = {
  STICKER_CATALOG,
  STICKER_CODES,
  MAX_MESSAGE_LENGTH,
  getStickerDefinition,
};
