'use strict';

const { Router } = require('express');
const propertyController = require('../controllers/property.controller');
const { protect } = require('../middlewares/auth');
const { bossOnly } = require('../utils/scope');
const uploadMw = require('../middlewares/upload');
const { propertyRules, propertyIdParam } = require('../validators/property.validators');

const router = Router();

router.use(protect);

router.get('/', propertyController.list);
router.post('/', propertyRules, propertyController.create);
// Catálogo ligero para selects con búsqueda remota (?q=…). Debe ir ANTES de
// /:id para que "options" no se interprete como un identificador.
router.get('/options', propertyController.options);
// Normalización manual de folios heredados (también corre al arrancar).
router.post('/normalize-folios', bossOnly, propertyController.normalizeFolios);
router.get('/:id', propertyIdParam, propertyController.get);
router.get('/:id/market', propertyIdParam, propertyController.market);
router.post(
  '/:id/photos',
  propertyIdParam,
  uploadMw.upload.array('photos', 12),
  uploadMw.uploadErrorHandler,
  uploadMw.verifyUploads,
  propertyController.uploadPhotos
);
router.put('/:id', propertyIdParam, propertyRules, propertyController.update);
router.delete('/:id', propertyIdParam, propertyController.remove);
router.patch('/:id/publish', propertyIdParam, propertyController.togglePublish);

module.exports = router;
