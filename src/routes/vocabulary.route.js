const express = require('express');
const { authenticate } = require('../middlewares/auth');
const c = require('../controllers/vocabulary.controller');

const router = express.Router();

router.post('/', authenticate, c.saveValidation, c.save);
router.get('/', authenticate, c.listValidation, c.list);
router.delete('/:id', authenticate, c.deleteValidation, c.remove);

module.exports = router;