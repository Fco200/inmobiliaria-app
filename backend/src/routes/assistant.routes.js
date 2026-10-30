'use strict';

const { Router } = require('express');
const { protect } = require('../middlewares/auth');
const assistantController = require('../controllers/assistant.controller');

const router = Router();

router.use(protect);

router.post('/', assistantController.ask);

module.exports = router;
