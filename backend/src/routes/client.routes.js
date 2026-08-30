'use strict';

const { Router } = require('express');
const clientController = require('../controllers/client.controller');
const { protect } = require('../middlewares/auth');
const { clientRules, clientIdParam } = require('../validators/client.validators');

const router = Router();

router.use(protect);

router.get('/', clientController.list);
router.post('/', clientRules, clientController.create);
router.get('/:id', clientIdParam, clientController.get);
router.put('/:id', clientIdParam, clientRules, clientController.update);
router.delete('/:id', clientIdParam, clientController.remove);

module.exports = router;
