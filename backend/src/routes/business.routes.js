'use strict';

const { Router } = require('express');
const businessController = require('../controllers/business.controller');
const { protect, authorize } = require('../middlewares/auth');
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
// Flujo de negocio configurable (solo administración y dirección lo editan).
router.get('/flow', businessController.getFlow);
router.put('/flow', authorize('admin', 'direccion', 'superadmin', 'system_admin'), businessController.saveFlow);
// Catálogo ligero para selects con búsqueda remota (?q=…). Debe ir ANTES de
// /:id para que "options" no se interprete como un identificador.
router.get('/options', businessController.options);
router.get('/property/:propertyId', businessController.propertyBusinesses);
// Indicador de bitácora no vista por negocio (antes de /:id).
router.get('/unseen-notes', businessController.unseenNotes);
router.post('/', businessRules, businessController.create);
router.get('/:id', businessIdParam, businessController.get);
router.put('/:id', businessIdParam, businessUpdateRules, businessController.update);
router.delete('/:id', businessIdParam, businessController.remove);
router.patch('/:id/stage', businessIdParam, stageRules, businessController.changeStage);
router.get('/:id/history', businessIdParam, businessController.history);

// Bitácora / notas
router.get('/:id/notes', businessIdParam, businessController.listNotes);
router.post('/:id/notes', businessIdParam, businessController.addNote);
router.post('/:id/notes/seen', businessIdParam, businessController.markNotesSeen);
router.patch('/:id/notes/:noteId', businessIdParam, businessController.updateNote);
router.delete('/:id/notes/:noteId', businessIdParam, businessController.removeNote);

// Checklist operativo
router.get('/:id/checklist', businessIdParam, businessController.getChecklist);
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
