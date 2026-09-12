const express = require('express');
const { authenticate } = require('../middlewares/auth');
const storyFavoriteController = require('../controllers/storyFavorite.controller');

const router = express.Router();

router.post(
  '/',
  authenticate,
  storyFavoriteController.addValidation,
  storyFavoriteController.add
);

router.delete(
  '/:storyId',
  authenticate,
  storyFavoriteController.removeValidation,
  storyFavoriteController.remove
);

module.exports = router;