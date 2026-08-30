'use strict';

const { body, param } = require('express-validator');
const validate = require('../middlewares/validate');
const { User, Role } = require('../models');

const userRules = [
  body('name').notEmpty().withMessage('El nombre es obligatorio'),
  body('username')
    .notEmpty()
    .withMessage('El usuario es obligatorio')
    .isLength({ min: 3 })
    .withMessage('El usuario debe tener al menos 3 caracteres'),
  body('email').isEmail().withMessage('El correo no es válido'),
  body('password')
    .optional()
    .isLength({ min: 8 })
    .withMessage('La contraseña debe tener al menos 8 caracteres'),
  body('role')
    .notEmpty()
    .withMessage('El rol es obligatorio')
    .custom(async (value) => {
      const role = await Role.findById(value);
      if (!role) throw new Error('El rol no existe');
      return true;
    }),
  body('email').custom(async (value, { req }) => {
    const existing = await User.findOne({ email: value });
    if (existing && existing._id.toString() !== (req.params.id || '')) {
      throw new Error('Ya existe un usuario con ese correo');
    }
    return true;
  }),
];

const userUpdateRules = [
  body('name').optional().notEmpty().withMessage('El nombre no puede estar vacío'),
  body('username').optional().isLength({ min: 3 }).withMessage('El usuario debe tener al menos 3 caracteres'),
  body('email').optional().isEmail().withMessage('El correo no es válido'),
  body('password').optional().isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres'),
  body('role').optional().custom(async (value) => {
    const role = await Role.findById(value);
    if (!role) throw new Error('El rol no existe');
    return true;
  }),
  body('email').optional().custom(async (value, { req }) => {
    const existing = await User.findOne({ email: value });
    if (existing && existing._id.toString() !== (req.params.id || '')) {
      throw new Error('Ya existe un usuario con ese correo');
    }
    return true;
  }),
];

const userIdParam = [param('id').isMongoId().withMessage('Identificador no válido')];

const roleRules = [
  body('name').notEmpty().withMessage('El nombre del rol es obligatorio'),
  body('code')
    .notEmpty()
    .withMessage('El código del rol es obligatorio')
    .isLength({ min: 3 })
    .withMessage('El código debe tener al menos 3 caracteres'),
  body('permissions').optional().isArray().withMessage('Los permisos deben ser una lista'),
];

module.exports = {
  userRules: [...userRules, validate],
  userUpdateRules: [...userUpdateRules, validate],
  userIdParam: [...userIdParam, validate],
  roleRules: [...roleRules, validate],
  roleIdParam: [...[param('id').isMongoId().withMessage('Identificador no válido')], validate],
};
