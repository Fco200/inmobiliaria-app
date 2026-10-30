'use strict';

const { Router } = require('express');
const businessController = require('../controllers/business.controller');
const { protect } = require('../middlewares/auth');
const {
  uploadBusiness,
  verifyUpload,
  uploadErrorHandler,
} = require('../middlewares/upload');
const { businessRules, businessUpdateRules, businessIdParam, stageRules } = require('../validators/business.validators');

const router = Router();

router.use(protect);

router.get('/', businessController.list);
router.get('/stages', businessController.stages);
// Catálogo ligero para selects con búsqueda remota (?q=…). Debe ir ANTES de
// /:id para que "options" no se interprete como un identificador.
router.get('/options', businessController.options);
router.get('/property/:propertyId', businessController.propertyBusinesses);
router.post('/', businessRules, businessController.create);
router.get('/:id', businessIdParam, businessController.get);
router.put('/:id', businessIdParam, businessUpdateRules, businessController.update);
router.delete('/:id', businessIdParam, businessController.remove);
router.patch('/:id/stage', businessIdParam, stageRules, businessController.changeStage);
router.get('/:id/history', businessIdParam, businessController.history);

// Bitácora / notas
router.get('/:id/notes', businessIdParam, businessController.listNotes);
router.post('/:id/notes', businessIdParam, businessController.addNote);
router.delete('/:id/notes/:noteId', businessIdParam, businessController.removeNote);

// Checklist operativo
router.post('/:id/checklist', businessIdParam, businessController.addChecklistItem);
router.patch('/:id/checklist/:itemId', businessIdParam, businessController.updateChecklistItem);
router.delete('/:id/checklist/:itemId', businessIdParam, businessController.removeChecklistItem);

// Documentos / fotos ligeras del negocio (máx. 8 MB por archivo)
router.get('/:id/documents', businessIdParam, businessController.listDocuments);
router.post(
  '/:id/documents',
  businessIdParam,
  uploadBusiness.single('file'),
  uploadErrorHandler,
  verifyUpload,
  businessController.uploadDocument
);
router.delete('/:id/documents/:docId', businessIdParam, businessController.removeDocument);

module.exports = router;
