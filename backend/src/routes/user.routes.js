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
// cualquier usuario autenticado. La escritura queda restringida a admin.
router.use(protect);
router.get('/', listUsers);
router.get('/permissions', listPermissions);
router.get('/roles', listRoles);
router.get('/:id', userIdParam, getUser);

router.use(authorize('admin'));

router.post('/', userRules, createUser);
router.post('/roles', roleRules, createRole);
router.put('/roles/:id', roleIdParam, updateRole);
router.delete('/roles/:id', roleIdParam, removeRole);

router.put('/:id', userIdParam, userUpdateRules, updateUser);
router.delete('/:id', userIdParam, removeUser);

module.exports = router;
