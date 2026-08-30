'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const buildCrud = require('../utils/crud');
const bcrypt = require('bcryptjs');
const { User, Role, Permission } = require('../models');
const { logActivity } = require('../services/log.service');

const userCrud = buildCrud(User, {
  populate: ['role'],
  searchFields: ['name', 'email', 'username', 'phone'],
  beforeCreate: (body) => {
    if (body.password === undefined || body.password === '') {
      throw Object.assign(new Error('La contraseña es obligatoria'), { statusCode: 400 });
    }
    return body;
  },
  beforeUpdate: async (body) => {
    if (body.password) {
      const salt = await bcrypt.genSalt(10);
      body.password = await bcrypt.hash(body.password, salt);
    } else {
      delete body.password;
    }
    return body;
  },
});

const listUsers = userCrud.list;
const getUser = userCrud.get;
const createUser = userCrud.create;
const updateUser = userCrud.update;
const removeUser = userCrud.remove;

const listRoles = asyncHandler(async (req, res) => {
  const roles = await Role.find().populate('permissions').sort({ createdAt: 1 });
  res.json({ success: true, data: roles });
});

const createRole = asyncHandler(async (req, res) => {
  const role = await Role.create(req.body);
  res.status(201).json({ success: true, data: role });
});

const updateRole = asyncHandler(async (req, res) => {
  const role = await Role.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!role) return res.status(404).json({ success: false, message: 'Rol no encontrado' });
  res.json({ success: true, data: role });
});

const removeRole = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) return res.status(404).json({ success: false, message: 'Rol no encontrado' });
  if (role.isSystem) {
    return res.status(400).json({ success: false, message: 'No se puede eliminar un rol del sistema' });
  }
  await role.deleteOne();
  res.json({ success: true, message: 'Rol eliminado' });
});

const listPermissions = asyncHandler(async (req, res) => {
  const permissions = await Permission.find().sort({ module: 1, code: 1 });
  res.json({ success: true, data: permissions });
});

module.exports = {
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
};
