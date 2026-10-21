'use strict';

const { Router } = require('express');
const businessController = require('../controllers/business.controller');
const { protect } = require('../middlewares/auth');
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

module.exports = router;
