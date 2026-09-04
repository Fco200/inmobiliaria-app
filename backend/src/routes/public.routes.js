'use strict';

const { Router } = require('express');
const publicController = require('../controllers/public.controller');
const { idParam } = require('../validators/general.validators');
const { protect, authorize } = require('../middlewares/auth');

const router = Router();

// Rutas públicas para el catálogo de la landing (sin autenticación).
router.get('/properties', publicController.list);
router.get('/properties/:id', idParam, publicController.get);
router.get('/asesores', publicController.listAsesores);
router.get('/asesores/:id', idParam, publicController.getAsesor);
router.get('/propiedades', publicController.list);
router.post('/newsletter', publicController.subscribeNewsletter);
router.post('/assistant', publicController.ask);
router.post('/appointments', publicController.createAppointment);

// Suscriptores del newsletter (solo administración/gerencia).
router.get('/newsletter', protect, authorize('admin', 'gerencia'), publicController.listNewsletter);

module.exports = router;
