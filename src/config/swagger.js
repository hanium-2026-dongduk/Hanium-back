const swaggerJsdoc = require('swagger-jsdoc');

/**
 * Swagger(OpenAPI) 스펙 (M4 — API 문서화).
 *
 * `docs/API_SPEC_*.md`와의 관계: **여기가 계약의 원본**이다. 코드 옆 주석에서 생성되므로
 * 엔드포인트가 바뀌면 문서도 같이 바뀔 수밖에 없다. `.md` 문서들은 "왜 이렇게 설계했는지"
 * (동시성 정책, 대안 비교 등)를 남기는 배경 설명으로 남긴다 — 그건 스펙에 담기 어렵다.
 *
 * 프론트가 계약을 이슈 요약으로 추정하다 11군데가 어긋나 전면 재작업한 적이 있어
 * (Hanium-front PR #20), 실행 가능한 문서를 두는 것이 목적이다.
 */

/** 모든 응답이 공유하는 봉투. 실제 값은 전부 `data` 안에 있다. */
const envelope = (dataSchema) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    message: { type: 'string', example: '조회했습니다.' },
    ...(dataSchema ? { data: dataSchema } : {}),
  },
});

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Magic Book API',
      version: '1.0.0',
      description: [
        '어린이 AI 동화 생성 서비스의 백엔드 API.',
        '',
        '**모든 응답은 `{ success, message, data }` 봉투에 담겨 온다.** 실제 값은 `data` 안에 있다.',
        '실패 시에는 `data` 대신 `success: false`와 `message`가 온다.',
        '',
        '설계 배경(동시성 정책, 스키마 결정 근거 등)은 저장소의 `docs/*.md`를 참고.',
      ].join('\n'),
    },
    servers: [
      { url: '/api', description: '현재 서버' },
    ],
    tags: [
      { name: '인증', description: '회원가입·로그인·토큰·비밀번호 재설정 (AU01~AU03)' },
      { name: '자녀 프로필', description: '자녀 프로필 CRUD와 활성 전환 (AU04)' },
      { name: '보호자', description: 'PIN·재인증·보호자 설정' },
      { name: '사용 시간', description: '학습 시간 집계와 제한' },
      { name: '출석', description: '출석 체크와 월간 현황 (MN04, MP03)' },
      { name: '미션', description: '데일리 미션 (RW01)' },
      { name: '리워드', description: '포인트·레벨·이력 (MN02, MP02, RW02~RW04)' },
      { name: '배지', description: '조건 기반 배지 (RW04_ACH_02, MP02_RWD_03)' },
      { name: '스티커', description: '칭찬 스티커 (PD04_STK_01, MP05_STK_01)' },
      { name: '기타', description: '헬스체크' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: [
            '로그인으로 받은 `accessToken`을 넣는다.',
            '',
            '토큰은 `type` 클레임으로 용도가 구분되어 있어 refreshToken이나 guardianToken을',
            '여기에 넣으면 서명이 유효해도 거부된다.',
          ].join('\n'),
        },
        guardianToken: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Guardian-Token',
          description: 'PIN 검증으로 받은 보호자 전용 토큰. 보호자 설정 변경에 필요하다.',
        },
      },
      schemas: {
        Success: envelope(),
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: '입력값을 확인해주세요.' },
            errors: {
              type: 'array',
              description: 'validation 실패 시에만 포함된다.',
              items: { type: 'object' },
            },
          },
        },
        User: {
          type: 'object',
          description: '보호자 계정. **이름 컬럼이 없다.**',
          properties: {
            user_id: { type: 'integer', example: 1 },
            email: { type: 'string', format: 'email', example: 'parent@example.com' },
            role: { type: 'string', example: 'parent' },
            status: { type: 'string', example: 'active' },
          },
        },
        ChildProfile: {
          type: 'object',
          description: '자녀 프로필. 생년월일·아바타 키는 없고 나이와 이미지 URL을 쓴다.',
          properties: {
            child_profile_id: { type: 'integer', example: 1 },
            user_id: { type: 'integer', example: 1 },
            child_name: { type: 'string', example: '민준' },
            age: { type: 'integer', nullable: true, minimum: 1, maximum: 15, example: 7 },
            learning_level: {
              type: 'string',
              enum: ['beginner', 'intermediate', 'advanced'],
              example: 'beginner',
            },
            vocabulary_level: { type: 'string', nullable: true },
            profile_image_url: { type: 'string', nullable: true },
            is_active: {
              type: 'boolean',
              description: '보호자당 활성 프로필은 최대 1개. 전환은 activate API로만 가능하다.',
              example: true,
            },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            totalCount: { type: 'integer', example: 45 },
            totalPages: { type: 'integer', example: 3 },
          },
        },
      },
      responses: {
        Unauthorized: {
          description: '인증 실패 — 토큰이 없거나 만료됨',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        Forbidden: {
          description: '권한 없음',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        NotFound: {
          description: '대상을 찾을 수 없음 (남의 자녀를 지정한 경우 포함)',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        BadRequest: {
          description: '입력값 오류',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        TooManyRequests: {
          description: '요청이 너무 잦음 (쿨다운·시도 횟수 초과)',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
      parameters: {
        childId: {
          name: 'childId',
          in: 'path',
          required: true,
          schema: { type: 'integer', minimum: 1 },
          description: '자녀 프로필 ID. 요청자 소유가 아니면 404.',
        },
      },
    },
    // 대부분의 엔드포인트가 인증을 요구한다. 예외는 각 엔드포인트에서 `security: []`로 끈다.
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.js'],
};

/** 라우트 주석에서 생성한 OpenAPI 스펙. */
const swaggerSpec = swaggerJsdoc(options);

module.exports = { swaggerSpec, envelope };
