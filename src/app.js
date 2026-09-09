const path = require('path');

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 정적 파일은 notFound보다 반드시 앞에 위치해야 한다 —
// 그렇지 않으면 /audio, /images 요청이 notFound에 먼저 잡혀 항상 404가 된다.
app.use('/audio', express.static(path.join(__dirname, 'public/audio')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;