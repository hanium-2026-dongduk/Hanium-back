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

app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

app.use('/audio', express.static(path.join(__dirname, 'public/audio')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));

module.exports = app;

// 라우터 등록
const characterRouter = require('./routes/character.router');
const storySettingRouter = require('./routes/storySetting.router');

app.use('/api/characters', characterRouter);
app.use('/api/story-settings', storySettingRouter);

app.listen(3000, () => {
  console.log('🚀 Server running on http://localhost:3000');
});
