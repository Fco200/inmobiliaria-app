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
  listarSolicitudesPassword,
  listarRolesPermisos,
  listarLogs,
  listarLogsSistema,
  limpiarLogsSistema,
  estadoMantenimiento,
  cambiarMantenimiento,
  generarRespaldo,
  listarPlantillas,
  subirPlantilla,
  renombrarPlantilla,
  eliminarPlantilla,
  descargarPlantillaSoporte,
  plantillaUpload,
  listarChatsSoporte,
  generalSoporte,
  verChatSoporte,
  enviarMensajeSoporte,
  marcarLeidoSoporte,
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
router.get('/anuncios/solicitudes-password', requireSoporte, listarSolicitudesPassword);

// Roles y permisos
router.get('/roles-permisos', requireSoporte, listarRolesPermisos);

// Configuración global
router.get('/config', requireSoporte, listarConfig);
router.put('/config', requireSoporte, guardarConfig);

// Datos del soporte técnico (edición exclusiva de SUPERADMIN)
router.get('/soporte-config', requireSoporte, listarSoporteConfig);
router.put('/soporte-config', requireSoporte, guardarSoporteConfig);

// Modo mantenimiento
router.get('/mantenimiento', requireSoporte, estadoMantenimiento);
router.put('/mantenimiento', requireSoporte, cambiarMantenimiento);

// Logs
router.get('/logs', requireSoporte, listarLogs);
router.get('/logs/errors', requireSoporte, listarLogs);
// Logs en tiempo real del sistema/servidor (buffer en memoria)
router.get('/logs/sistema', requireSoporte, listarLogsSistema);
router.delete('/logs/sistema', requireSoporte, limpiarLogsSistema);

// Respaldos
router.get('/respaldo', requireSoporte, generarRespaldo);

// Plantillas PDF
router.get('/plantillas', requireSoporte, listarPlantillas);
router.post('/plantillas', requireSoporte, plantillaUpload.single('plantilla'), subirPlantilla);
router.patch('/plantillas/:archivo', requireSoporte, renombrarPlantilla);
router.delete('/plantillas/:archivo', requireSoporte, eliminarPlantilla);
router.get('/plantillas/:archivo/descargar', requireSoporte, descargarPlantillaSoporte);

// Chat interno (soporte ve y responde los mensajes del equipo)
router.get('/chat', requireSoporte, listarChatsSoporte);
router.get('/chat/general', requireSoporte, generalSoporte);
router.get('/chat/:id', requireSoporte, verChatSoporte);
router.post('/chat/:id/messages', requireSoporte, enviarMensajeSoporte);
router.post('/chat/:id/leido', requireSoporte, marcarLeidoSoporte);

module.exports = router;
