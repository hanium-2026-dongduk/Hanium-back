/**
 * Asia/Seoul 캘린더 기준 날짜 계산 유틸.
 *
 * 출석·미션·사용시간은 전부 "KST 자정을 하루의 경계로 삼는다"는 동일한 규칙 위에서
 * 동작해야 하므로(서버 프로세스가 어느 타임존에서 구동되든), 날짜 계산은 도메인
 * 서비스가 각자 갖지 않고 여기 한 곳에 모아둔다.
 */

const SEOUL_TIME_ZONE = 'Asia/Seoul';

/**
 * Asia/Seoul 캘린더 기준 날짜 문자열(YYYY-MM-DD)을 반환한다.
 * @param {Date} [date] - 기준 시각 (기본값: 현재)
 */
const getSeoulDateString = (date = new Date()) => {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SEOUL_TIME_ZONE }).format(date);
};

/**
 * Asia/Seoul 캘린더 기준 월 문자열(YYYY-MM)을 반환한다.
 * @param {Date} [date] - 기준 시각 (기본값: 현재)
 */
const getSeoulMonthString = (date = new Date()) => {
  return getSeoulDateString(date).slice(0, 7);
};

/**
 * YYYY-MM-DD 문자열에 일수를 더한(음수면 뺀) 날짜 문자열을 반환한다.
 *
 * 입력이 이미 KST 캘린더 날짜이므로 여기서 로컬 타임존을 다시 개입시키면 하루가 밀릴 수
 * 있다. 그래서 UTC 기준으로만 계산한다 — 캘린더 날짜의 순수한 덧셈이며, DST/타임존과
 * 무관하게 항상 같은 결과를 낸다.
 *
 * @param {string} dateString - YYYY-MM-DD
 * @param {number} days - 더할 일수 (음수 가능)
 * @returns {string} YYYY-MM-DD
 */
const addDays = (dateString, days) => {
  const [year, month, day] = dateString.split('-').map(Number);
  const base = new Date(Date.UTC(year, month - 1, day));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
};

/**
 * KST 캘린더 날짜의 시작 순간(그날 00:00:00 KST)을 Date로 반환한다.
 *
 * created_at 같은 DATETIME 컬럼은 Sequelize 기본 설정상 UTC로 저장되므로, "KST 기준
 * 며칠부터 며칠까지"를 필터링하려면 캘린더 날짜를 실제 시각으로 변환해야 한다
 * (KST는 DST가 없는 고정 +09:00이라 오프셋을 상수로 써도 안전하다).
 *
 * @param {string} dateString - YYYY-MM-DD
 * @returns {Date}
 */
const getSeoulDayStartInstant = (dateString) => {
  return new Date(`${dateString}T00:00:00+09:00`);
};

/**
 * YYYY-MM-DD 형식인지 검사한다(실제 존재하는 날짜인지까지 확인).
 * @param {string} dateString
 */
const isValidDateString = (dateString) => {
  if (typeof dateString !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false;
  const [year, month, day] = dateString.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
};

/**
 * YYYY-MM 형식인지 검사한다(월 범위 01~12까지 확인).
 * @param {string} month
 */
const isValidMonthString = (month) => {
  if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) return false;
  const monthNumber = Number(month.slice(5, 7));
  return monthNumber >= 1 && monthNumber <= 12;
};

/**
 * 해당 월의 총 일수를 반환한다.
 * @param {string} month - YYYY-MM
 */
const getDaysInMonth = (month) => {
  const [year, monthNumber] = month.split('-').map(Number);
  // Date.UTC의 day=0은 "이전 달의 마지막 날"이므로, 다음 달의 0일 = 이번 달 말일.
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
};

/**
 * 해당 월의 시작일/종료일 문자열을 반환한다.
 * @param {string} month - YYYY-MM
 * @returns {{ firstDate: string, lastDate: string, daysInMonth: number }}
 */
const getMonthRange = (month) => {
  const daysInMonth = getDaysInMonth(month);
  return {
    firstDate: `${month}-01`,
    lastDate: `${month}-${String(daysInMonth).padStart(2, '0')}`,
    daysInMonth,
  };
};

module.exports = {
  SEOUL_TIME_ZONE,
  getSeoulDateString,
  getSeoulMonthString,
  getSeoulDayStartInstant,
  addDays,
  isValidDateString,
  isValidMonthString,
  getDaysInMonth,
  getMonthRange,
};
