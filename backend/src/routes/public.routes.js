'use strict';

const { Router } = require('express');
const publicController = require('../controllers/public.controller');
const { idParam } = require('../validators/general.validators');

const router = Router();

// Rutas públicas para el catálogo de la landing (sin autenticación).
router.get('/properties', publicController.list);
router.get('/properties/:id', idParam, publicController.get);

module.exports = router;
