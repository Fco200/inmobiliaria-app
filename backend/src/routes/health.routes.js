'use strict';

const { Router } = require('express');
const { health } = require('../controllers/health.controller');
const asyncHandler = require('../middlewares/asyncHandler');

const router = Router();

router.get('/', asyncHandler(health));

module.exports = router;
