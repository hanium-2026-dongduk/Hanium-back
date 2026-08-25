const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const swaggerUi = require('swagger-ui-express');

const routes = require('./routes');
const { swaggerSpec } = require('./config/swagger');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
