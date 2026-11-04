'use strict';

const { Router } = require('express');
const {
  listUsers,
  getUser,
  createUser,
  updateUser,
  removeUser,
  listRoles,
  createRole,
  updateRole,
  removeRole,
  listPermissions,
} = require('../controllers/user.controller');
const { protect, authorize } = require('../middlewares/auth');
const { userRules, userUpdateRules, userIdParam, roleRules, roleIdParam } = require('../validators/user.validators');

const router = Router();

// Lectura (directorio de usuarios, necesario para el chat 1 a 1) abierta a
// cualquier usuario autenticado.
router.use(protect);
router.get('/', listUsers);
router.get('/permissions', listPermissions);
router.get('/roles', listRoles);
router.get('/:id', userIdParam, getUser);

// Dirección y asistencia pueden crear/editar/desactivar usuarios. La gestión de
// roles y permisos queda reservada a dirección/administración/soporte.
const USER_MANAGERS = ['admin', 'direccion', 'asistencia', 'superadmin'];
router.post('/', authorize(...USER_MANAGERS), userRules, createUser);
router.put('/:id', authorize(...USER_MANAGERS), userIdParam, userUpdateRules, updateUser);
router.delete('/:id', authorize(...USER_MANAGERS), userIdParam, removeUser);

router.use(authorize('admin', 'direccion', 'superadmin'));
router.post('/roles', roleRules, createRole);
router.put('/roles/:id', roleIdParam, updateRole);
router.delete('/roles/:id', roleIdParam, removeRole);

module.exports = router;
