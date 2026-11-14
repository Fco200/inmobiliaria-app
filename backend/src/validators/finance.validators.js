'use strict';

const { body, param } = require('express-validator');
const validate = require('../middlewares/validate');

// En creación los campos base son obligatorios. En edición el formulario sólo
// manda los campos modificados (p. ej. cambiar el monto de un gasto), por eso
// los validadores de actualización los aceptan opcionales.
function goalFields({ required = true } = {}) {
  return [
    required
      ? body('name').notEmpty().withMessage('El nombre de la meta es obligatorio')
      : body('name').optional({ values: 'falsy' }).notEmpty().withMessage('El nombre de la meta es obligatorio'),
    required
      ? body('objectiveAmount').isFloat({ min: 0 }).withMessage('El monto objetivo es obligatorio y no puede ser negativo')
      : body('objectiveAmount').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('El monto objetivo no puede ser negativo'),
    required
      ? body('startDate').isISO8601().withMessage('La fecha de inicio es obligatoria')
      : body('startDate').optional({ values: 'falsy' }).isISO8601().withMessage('Fecha de inicio no válida'),
    required
      ? body('endDate').isISO8601().withMessage('La fecha límite es obligatoria')
      : body('endDate').optional({ values: 'falsy' }).isISO8601().withMessage('Fecha límite no válida'),
    body('user').optional({ values: 'falsy' }).isMongoId().withMessage('Usuario no válido'),
  ];
}

function expenseFields({ required = true } = {}) {
  return [
    required
      ? body('concept').notEmpty().withMessage('El concepto es obligatorio')
      : body('concept').optional({ values: 'falsy' }).notEmpty().withMessage('El concepto es obligatorio'),
    required
      ? body('amount').isFloat({ min: 0 }).withMessage('El monto es obligatorio y no puede ser negativo')
      : body('amount').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('El monto no puede ser negativo'),
    required
      ? body('date').isISO8601().withMessage('La fecha es obligatoria')
      : body('date').optional({ values: 'falsy' }).isISO8601().withMessage('Fecha no válida'),
    // `optional({ values: 'falsy' })`: sin negocio (null) o sin usuario el
    // formulario igual manda null y `.optional()` simple lo rechazaba.
    body('user').optional({ values: 'falsy' }).isMongoId().withMessage('Usuario no válido'),
    body('business').optional({ values: 'falsy' }).isMongoId().withMessage('Negocio no válido'),
  ];
}

const goalRules = goalFields();
const goalUpdateRules = goalFields({ required: false });
const expenseRules = expenseFields();
const expenseUpdateRules = expenseFields({ required: false });

const idParam = [param('id').isMongoId().withMessage('Identificador no válido')];

module.exports = {
  goalRules: [...goalRules, validate],
  goalUpdateRules: [...goalUpdateRules, validate],
  expenseRules: [...expenseRules, validate],
  expenseUpdateRules: [...expenseUpdateRules, validate],
  idParam: [...idParam, validate],
};
