'use strict';

const { Router } = require('express');
const propertyController = require('../controllers/property.controller');
const { protect } = require('../middlewares/auth');
const { propertyRules, propertyIdParam } = require('../validators/property.validators');

const router = Router();

router.use(protect);

router.get('/', propertyController.list);
router.post('/', propertyRules, propertyController.create);
router.get('/:id', propertyIdParam, propertyController.get);
router.get('/:id/market', propertyIdParam, propertyController.market);
router.put('/:id', propertyIdParam, propertyRules, propertyController.update);
router.delete('/:id', propertyIdParam, propertyController.remove);
router.patch('/:id/publish', propertyIdParam, propertyController.togglePublish);

module.exports = router;
