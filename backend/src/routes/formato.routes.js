'use strict';

const { Router } = require('express');
const { protect, authorize } = require('../middlewares/auth');
const {
  listarPlantillas,
  obtenerCamposPlantilla,
  generarPDF,
  descargarPlantilla,
  subirPlantilla,
  eliminarPlantilla,
  plantillaUpload,
} = require('../controllers/formato.controller');

const router = Router();

router.use(protect);

router.get('/plantillas', listarPlantillas);
router.get('/plantillas/:id/campos', obtenerCamposPlantilla);
router.get('/plantillas/:id/descargar', descargarPlantilla);
router.post('/generar/:plantillaId', generarPDF);

// Carga de PDFs compartidos para todo el equipo (administración y personal
// autorizado). Los asesores solo los consultan y descargan.
const canManageTemplates = authorize(
  'admin', 'direccion', 'gerencia', 'asistencia', 'superadmin', 'system_admin'
);
router.post('/plantillas', canManageTemplates, plantillaUpload.single('plantilla'), subirPlantilla);
router.delete('/plantillas/:id', canManageTemplates, eliminarPlantilla);

module.exports = router;
