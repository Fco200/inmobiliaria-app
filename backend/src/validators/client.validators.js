'use strict';

const { body, param } = require('express-validator');
const validate = require('../middlewares/validate');

const clientRules = [
  body('name').notEmpty().withMessage('El nombre del cliente es obligatorio'),
  body('phone').optional().isLength({ min: 7, max: 20 }).withMessage('El teléfono no es válido'),
  body('email').optional().isEmail().withMessage('El correo no es válido'),
  body('responsibleUser').optional().isMongoId().withMessage('Usuario responsable no válido'),
  body('type').optional().isIn(['comprador', 'vendedor', 'comprador_vendedor']).withMessage('Tipo de cliente no válido'),
];

const clientIdParam = [param('id').isMongoId().withMessage('Identificador no válido')];

module.exports = {
  clientRules: [...clientRules, validate],
  clientIdParam: [...clientIdParam, validate],
};
