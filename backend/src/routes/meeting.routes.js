'use strict';

const { Router } = require('express');
const {
  list,
  get,
  create,
  update,
  remove,
} = require('../controllers/meeting.controller');
const { protect } = require('../middlewares/auth');

const router = Router();

// Todas las rutas requieren sesión. Las escrituras (crear/editar/eliminar)
// se validan por rol dentro del controlador (solo admin/gerencia).
router.get('/', protect, list);
router.get('/:id', protect, get);
router.post('/', protect, create);
router.put('/:id', protect, update);
router.delete('/:id', protect, remove);

module.exports = router;
