const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');

const env = require('./config/env');
const routes = require('./routes');
const { swaggerSpec } = require('./config/swagger');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();

// Nginx 뒤에서 돌 때 실제 클라이언트 IP를 보기 위해 필요하다. 켜지 않으면 rate limit이
// 모든 요청을 프록시 하나의 IP로 보고 전체 사용자를 함께 막는다.
// 반대로 프록시가 없는데 켜면 클라이언트가 X-Forwarded-For를 위조해 제한을 우회할 수 있어,
// 환경변수로 명시할 때만 켠다.
if (env.trustProxy) {
  app.set('trust proxy', 1);
}

// 보안 헤더. Swagger UI가 인라인 스크립트·스타일을 쓰기 때문에 CSP는 그 경로에서만 완화한다.
app.use(helmet({ contentSecurityPolicy: false }));

// 허용 출처를 지정하지 않으면 전체 허용(개발 편의). 운영에서는 CORS_ORIGINS를 채운다.
app.use(
  cors(
    env.corsOrigins.length > 0
      ? { origin: env.corsOrigins, credentials: true }
      : undefined
  )
);

app.use(morgan('dev'));

// 본문 크기 상한. 지금은 JSON만 받으므로 작게 잡는다 — 큰 본문으로 메모리를 소진시키는
// 공격을 막는다. Nginx에도 client_max_body_size 2m이 걸려 있어 이중 방어다.
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

app.use(cookieParser());

// API 문서. 계약의 원본이라 프론트가 직접 열어보고 "Try it out"으로 호출까지 해볼 수 있다.
// 운영에서 감출 필요가 생기면 여기에 인증을 걸거나 Nginx에서 막는다.
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customSiteTitle: 'Magic Book API' }));
// 스펙 원본. 프론트가 코드 생성기에 넣거나 Postman에 가져갈 때 쓴다.
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
