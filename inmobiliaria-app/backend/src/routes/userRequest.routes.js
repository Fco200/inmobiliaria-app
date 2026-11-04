'use strict';

const { Router } = require('express');
const { protect, authorize } = require('../middlewares/auth');
const controller = require('../controllers/userRequest.controller');

const router = Router();

// Público: cualquiera puede solicitar la creación de un usuario nuevo.
router.post('/', controller.create);

// Protegidas: solo administradores o soporte técnico pueden revisar/atender.
router.use(protect, authorize('admin', 'direccion', 'asistencia', 'superadmin'));
router.get('/', controller.list);
router.patch('/:id', controller.handle);
router.delete('/:id', controller.remove);

module.exports = router;
