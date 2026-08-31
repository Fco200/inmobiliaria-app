'use strict';

const { Router } = require('express');
const { protect, authorize } = require('../middlewares/auth');
const {
  soporteLogin,
  soporteMe,
  soporteLogout,
  listarUsuarios,
  actualizarUsuario,
  restablecerPassword,
  listarRoles,
  listarConfig,
  guardarConfig,
  listarLogs,
  generarRespaldo,
  listarPlantillas,
  subirPlantilla,
  eliminarPlantilla,
  descargarPlantillaSoporte,
  plantillaUpload,
} = require('../controllers/soporte.controller');

const router = Router();

// Ruta pública de autenticación de soporte (NO requiere sesión previa).
router.post('/auth/login', soporteLogin);

// ── Todas las rutas siguientes exigen una sesión de SUPERADMIN ──────────────
const requireSoporte = [protect, authorize('superadmin')];

// Sesión
router.get('/auth/me', requireSoporte, soporteMe);
router.post('/auth/logout', requireSoporte, soporteLogout);

// Usuarios
router.get('/usuarios', requireSoporte, listarUsuarios);
router.get('/roles', requireSoporte, listarRoles);
router.put('/usuarios/:id', requireSoporte, actualizarUsuario);
router.post('/usuarios/:id/restablecer-password', requireSoporte, restablecerPassword);

// Configuración global
router.get('/config', requireSoporte, listarConfig);
router.put('/config', requireSoporte, guardarConfig);

// Logs
router.get('/logs', requireSoporte, listarLogs);
router.get('/logs/errors', requireSoporte, listarLogs);

// Respaldos
router.get('/respaldo', requireSoporte, generarRespaldo);

// Plantillas PDF
router.get('/plantillas', requireSoporte, listarPlantillas);
router.post('/plantillas', requireSoporte, plantillaUpload.single('plantilla'), subirPlantilla);
router.delete('/plantillas/:archivo', requireSoporte, eliminarPlantilla);
router.get('/plantillas/:archivo/descargar', requireSoporte, descargarPlantillaSoporte);

module.exports = router;
