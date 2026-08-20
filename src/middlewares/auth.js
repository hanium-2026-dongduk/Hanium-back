const { verifyAccessToken } = require('../utils/jwt');
const response = require('../utils/response');

/**
 * JWT 인증 미들웨어
 * Authorization: Bearer <token> 헤더에서 토큰 추출 후 검증
 * 성공 시 req.user에 { user_id, email, role } 설정
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return response.error(res, 401, '인증 토큰이 필요합니다.');
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyAccessToken(token);
    req.user = {
      user_id: decoded.user_id,
      email: decoded.email,
      role: decoded.role,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return response.error(res, 401, '토큰이 만료되었습니다.');
    }
    return response.error(res, 401, '유효하지 않은 토큰입니다.');
  }
};

module.exports = { authenticate };
