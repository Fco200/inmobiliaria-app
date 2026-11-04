'use strict';

const { body } = require('express-validator');
const validate = require('../middlewares/validate');

// Política de contraseñas: mínimo 8 caracteres, con mayúscula, minúscula y número.
// Política de contraseñas reutilizable (validaciones sobre el campo indicado).
function passwordChain(field = 'password') {
  return [
    body(field).isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres'),
    body(field).matches(/[A-Z]/).withMessage('La contraseña debe incluir al menos una mayúscula'),
    body(field).matches(/[a-z]/).withMessage('La contraseña debe incluir al menos una minúscula'),
    body(field).matches(/\d/).withMessage('La contraseña debe incluir al menos un número'),
  ];
}

const loginRules = [
  body('identifier').notEmpty().withMessage('El usuario o correo es obligatorio'),
  body('password').notEmpty().withMessage('La contraseña es obligatoria'),
];

const registerRules = [
  body('name').notEmpty().withMessage('El nombre es obligatorio'),
  body('username')
    .notEmpty()
    .withMessage('El usuario es obligatorio')
    .isLength({ min: 3 })
    .withMessage('El usuario debe tener al menos 3 caracteres'),
  body('email').isEmail().withMessage('El correo no es válido'),
  ...passwordChain(),
];

const updateMeRules = [
  body('name').optional().notEmpty().withMessage('El nombre no puede estar vacío'),
  body('email').optional().isEmail().withMessage('El correo no es válido'),
  // Solo valida la contraseña si el campo viene con contenido.
  body('password')
    .optional({ checkFalsy: true })
    .isLength({ min: 8 })
    .withMessage('La contraseña debe tener al menos 8 caracteres'),
];

module.exports = {
  loginRules: [...loginRules, validate],
  registerRules: [...registerRules, validate],
  updateMeRules: [...updateMeRules, validate],
};
