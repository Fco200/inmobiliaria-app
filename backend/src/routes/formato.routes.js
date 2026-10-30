'use strict';

const { Router } = require('express');
const { protect } = require('../middlewares/auth');
const {
  listarPlantillas,
  obtenerCamposPlantilla,
  generarPDF,
  descargarPlantilla,
} = require('../controllers/formato.controller');

const router = Router();

router.use(protect);

router.get('/plantillas', listarPlantillas);
router.get('/plantillas/:id/campos', obtenerCamposPlantilla);
router.get('/plantillas/:id/descargar', descargarPlantilla);
router.post('/generar/:plantillaId', generarPDF);

module.exports = router;
