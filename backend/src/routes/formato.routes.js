'use strict';

const { Router } = require('express');
const { protect, authorize } = require('../middlewares/auth');
const { upload, verifyUpload, uploadErrorHandler } = require('../middlewares/upload');
const sharedFormat = require('../controllers/sharedFormat.controller');

const router = Router();

router.use(protect);

// Formatos compartidos (cualquier archivo): única zona de subida y CRUD real.
// Todo el equipo consulta y descarga; solo el personal autorizado los administra.
const canManageFormats = authorize(
  'admin', 'direccion', 'gerencia', 'asistencia', 'escrituracion', 'superadmin', 'system_admin'
);

router.get('/compartidos', sharedFormat.listSharedFormats);
router.post(
  '/compartidos',
  canManageFormats,
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

module.exports = router;
