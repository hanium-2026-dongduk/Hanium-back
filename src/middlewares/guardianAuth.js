const { isGuardianTokenValid } = require('../services/guardian.service');
const response = require('../utils/response');

/**
 * 보호자 전용 기능 게이트
 *
 * PIN 검증(POST /api/guardian/pin/verify) 성공 시 발급되는 X-Guardian-Token 헤더를
 * 요구한다. "PIN 검증 API가 true를 반환했다"는 사실을 클라이언트가 자체적으로
 * 기억해뒀다가 이후 요청을 그냥 보내는 방식으로는 서버가 실제로 PIN이 확인됐는지
 * 알 수 없으므로, 서버가 서명한 단기 토큰의 존재/유효성으로 강제한다.
 *
 * 유효성 판단은 guardian.service.js의 isGuardianTokenValid() 하나에 위임한다 —
 * 서명/타입뿐 아니라 DB의 현재 pin_version과도 일치해야 하며(PIN이 바뀌면 기존
 * 토큰이 즉시 무효화됨), 이 판단을 미들웨어에서 따로 구현하면 서비스 쪽(setPin의
 * 재인증 검사)과 로직이 갈라져 한쪽만 고치는 실수로 우회 경로가 생길 수 있다.
 *
 * authenticate 미들웨어 이후에 사용해야 한다(req.user 필요).
 */
const requireGuardianToken = async (req, res, next) => {
  const token = req.headers['x-guardian-token'];

  const valid = await isGuardianTokenValid(token, req.user.user_id);
  if (!valid) {
    return response.error(res, 403, '보호자 인증(PIN 확인)이 필요합니다.');
  }

  next();
};

module.exports = { requireGuardianToken };
