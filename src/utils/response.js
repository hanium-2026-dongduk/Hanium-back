/**
 * 성공 응답
 * @param {object} res - Express response
 * @param {number} statusCode - HTTP 상태 코드
 * @param {string} message - 응답 메시지
 * @param {object|null} data - 응답 데이터
 */
const success = (res, statusCode = 200, message = '성공', data = null) => {
  const response = { success: true, message };
  if (data !== null) response.data = data;
  return res.status(statusCode).json(response);
};

/**
 * 에러 응답
 * @param {object} res - Express response
 * @param {number} statusCode - HTTP 상태 코드
 * @param {string} message - 에러 메시지
 * @param {object|null} errors - 상세 에러 정보
 */
const error = (res, statusCode = 500, message = '서버 에러가 발생했습니다.', errors = null) => {
  const response = { success: false, message };
  if (errors !== null) response.errors = errors;
  return res.status(statusCode).json(response);
};

module.exports = { success, error };
