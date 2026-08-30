'use strict';

const { Router } = require('express');
const businessController = require('../controllers/business.controller');
const { protect } = require('../middlewares/auth');
const { businessRules, businessUpdateRules, businessIdParam, stageRules } = require('../validators/business.validators');

const router = Router();

router.use(protect);

router.get('/', businessController.list);
router.post('/', businessRules, businessController.create);
router.get('/:id', businessIdParam, businessController.get);
router.put('/:id', businessIdParam, businessUpdateRules, businessController.update);
router.delete('/:id', businessIdParam, businessController.remove);
router.patch('/:id/stage', businessIdParam, stageRules, businessController.changeStage);
router.get('/:id/history', businessIdParam, businessController.history);

module.exports = router;
