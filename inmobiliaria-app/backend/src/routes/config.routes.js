'use strict';

const { Router } = require('express');
const { protect, authorize } = require('../middlewares/auth');
const configController = require('../controllers/config.controller');
const versionController = require('../controllers/version.controller');

const router = Router();

// Estado del mantenimiento (público) — el CRM lo consulta para saber si hay un
// mantenimiento activo o programado y arrancar la cuenta regresiva.
router.get('/mantenimiento', configController.getMantenimientoPublico);

// Versión/actualizaciones de la app (público) — el CRM lo consulta para avisar
// cuando hay una versión nueva y mostrar el changelog (módulo Actualizaciones).
router.get('/version', versionController.getVersion);

// Configurar/programar mantenimiento (admin, gerencia o superadmin).
router.post('/mantenimiento', protect, authorize('admin', 'direccion', 'gerencia', 'superadmin'), configController.setMantenimiento);

module.exports = router;
