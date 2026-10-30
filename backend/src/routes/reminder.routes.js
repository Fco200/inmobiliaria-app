'use strict';

const { Router } = require('express');
const { protect } = require('../middlewares/auth');
const reminderController = require('../controllers/reminder.controller');

const router = Router();

router.use(protect);

router.get('/', reminderController.upcoming);

module.exports = router;
