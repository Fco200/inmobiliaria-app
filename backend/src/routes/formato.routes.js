'use strict';

const { Router } = require('express');
const { protect, authorize } = require('../middlewares/auth');
const {
  listarPlantillas,
  obtenerCamposPlantilla,
  generarPDF,
  descargarPlantilla,
  subirPlantilla,
  renombrarPlantilla,
  eliminarPlantilla,
  plantillaUpload,
} = require('../controllers/formato.controller');

const { upload, verifyUpload, uploadErrorHandler } = require('../middlewares/upload');
const sharedFormat = require('../controllers/sharedFormat.controller');

const router = Router();

router.use(protect);

// Carga de formatos y PDFs para todo el equipo (solo perfiles administrativos).
// Los asesores solo los consultan y descargan.
const canManageTemplates = authorize(
  'admin', 'direccion', 'gerencia', 'asistencia', 'escrituracion', 'superadmin', 'system_admin'
);

// Formatos compartidos (cualquier archivo): todo el equipo los consulta y descarga.
router.get('/compartidos', sharedFormat.listSharedFormats);
router.post(
  '/compartidos',
  canManageTemplates,
  upload.single('archivo'),
  uploadErrorHandler,
  verifyUpload,
  sharedFormat.uploadSharedFormat
);
router.get('/compartidos/:id/descargar', sharedFormat.downloadSharedFormat);
router.patch(
  '/compartidos/:id',
  upload.single('archivo'),
  uploadErrorHandler,
  verifyUpload,
  sharedFormat.updateSharedFormat
);
router.delete('/compartidos/:id', sharedFormat.removeSharedFormat);

router.get('/plantillas', listarPlantillas);
router.get('/plantillas/:id/campos', obtenerCamposPlantilla);
router.get('/plantillas/:id/descargar', descargarPlantilla);
router.post('/generar/:plantillaId', generarPDF);

router.post('/plantillas', canManageTemplates, plantillaUpload.single('plantilla'), subirPlantilla);
router.patch('/plantillas/:id', canManageTemplates, renombrarPlantilla);
router.delete('/plantillas/:id', canManageTemplates, eliminarPlantilla);

module.exports = router;
