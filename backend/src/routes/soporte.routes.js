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
  listarSoporteConfig,
  guardarSoporteConfig,
  resumenSistema,
  listarSesionesSoporte,
  revocarSesionSoporte,
  revocarSesionesUsuarioSoporte,
  listarAnuncios,
  crearAnuncio,
  eliminarAnuncio,
  listarRolesPermisos,
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

// Resumen / estado del sistema
router.get('/resumen', requireSoporte, resumenSistema);

// Sesiones (todo el equipo)
router.get('/sesiones', requireSoporte, listarSesionesSoporte);
router.delete('/sesiones/:id', requireSoporte, revocarSesionSoporte);
router.delete('/sesiones/usuario/:id', requireSoporte, revocarSesionesUsuarioSoporte);

// Avisos / anuncios del equipo
router.get('/anuncios', requireSoporte, listarAnuncios);
router.post('/anuncios', requireSoporte, crearAnuncio);
router.delete('/anuncios/:id', requireSoporte, eliminarAnuncio);

// Roles y permisos
router.get('/roles-permisos', requireSoporte, listarRolesPermisos);

// Configuración global
router.get('/config', requireSoporte, listarConfig);
router.put('/config', requireSoporte, guardarConfig);

// Datos del soporte técnico (edición exclusiva de SUPERADMIN)
router.get('/soporte-config', requireSoporte, listarSoporteConfig);
router.put('/soporte-config', requireSoporte, guardarSoporteConfig);

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
