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

router.use(protect, authorize('admin'));

router.get('/', listUsers);
router.post('/', userRules, createUser);
router.get('/permissions', listPermissions);
router.get('/roles', listRoles);
router.post('/roles', roleRules, createRole);
router.put('/roles/:id', roleIdParam, updateRole);
router.delete('/roles/:id', roleIdParam, removeRole);

router.get('/:id', userIdParam, getUser);
router.put('/:id', userIdParam, userUpdateRules, updateUser);
router.delete('/:id', userIdParam, removeUser);

module.exports = router;
