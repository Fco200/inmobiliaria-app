'use strict';

const { Router } = require('express');
const inventoryController = require('../controllers/inventory.controller');
const { protect } = require('../middlewares/auth');

const router = Router();

router.get('/public', inventoryController.publicList);

router.use(protect);

router.get('/', inventoryController.list);
router.get('/general', inventoryController.generalList);
router.get('/:id', inventoryController.get);
router.post('/', inventoryController.create);
router.post('/upload', inventoryController.uploadProperty);
router.put('/:id', inventoryController.update);
router.delete('/:id', inventoryController.remove);
router.patch('/:id/publish', inventoryController.togglePublish);

module.exports = router;
