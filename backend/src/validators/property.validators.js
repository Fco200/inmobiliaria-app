'use strict';

const { body, param } = require('express-validator');
const validate = require('../middlewares/validate');

const propertyRules = [
  body('type').notEmpty().withMessage('El tipo de inmueble es obligatorio'),
  body('operationType').notEmpty().withMessage('El tipo de operación es obligatorio'),
  body('price').optional().isFloat({ min: 0 }).withMessage('El precio no puede ser negativo'),
  body('owner').optional().isMongoId().withMessage('Propietario no válido'),
  body('responsibleUser').optional().isMongoId().withMessage('Usuario responsable no válido'),
];

const propertyIdParam = [param('id').isMongoId().withMessage('Identificador no válido')];

module.exports = {
  propertyRules: [...propertyRules, validate],
  propertyIdParam: [...propertyIdParam, validate],
};
