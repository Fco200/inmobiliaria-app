'use strict';

const { body, param } = require('express-validator');
const validate = require('../middlewares/validate');

const goalRules = [
  body('name').notEmpty().withMessage('El nombre de la meta es obligatorio'),
  body('objectiveAmount').isFloat({ min: 0 }).withMessage('El monto objetivo es obligatorio y no puede ser negativo'),
  body('startDate').isISO8601().withMessage('La fecha de inicio es obligatoria'),
  body('endDate').isISO8601().withMessage('La fecha límite es obligatoria'),
  body('user').optional().isMongoId().withMessage('Usuario no válido'),
];

const expenseRules = [
  body('concept').notEmpty().withMessage('El concepto es obligatorio'),
  body('amount').isFloat({ min: 0 }).withMessage('El monto es obligatorio y no puede ser negativo'),
  body('date').isISO8601().withMessage('La fecha es obligatoria'),
  body('user').optional().isMongoId().withMessage('Usuario no válido'),
  body('business').optional().isMongoId().withMessage('Negocio no válido'),
];

const idParam = [param('id').isMongoId().withMessage('Identificador no válido')];

module.exports = {
  goalRules: [...goalRules, validate],
  expenseRules: [...expenseRules, validate],
  idParam: [...idParam, validate],
};
