'use strict';

const { Router } = require('express');
const { protect, authorize } = require('../middlewares/auth');
const configController = require('../controllers/config.controller');

const router = Router();

// Estado del mantenimiento (público) — el CRM lo consulta para saber si hay un
// mantenimiento activo o programado y arrancar la cuenta regresiva.
router.get('/mantenimiento', configController.getMantenimientoPublico);

// Configurar/programar mantenimiento (admin, gerencia o superadmin).
router.post('/mantenimiento', protect, authorize('admin', 'gerencia', 'superadmin'), configController.setMantenimiento);

module.exports = router;
