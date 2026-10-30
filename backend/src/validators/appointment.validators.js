'use strict';

const { body, param } = require('express-validator');
const validate = require('../middlewares/validate');
const { APPOINTMENT_TYPES } = require('../constants/appointment-types');

// `optional({ values: 'falsy' })`: el formulario envía `null`/'' en los campos
// vacíos; con `.optional()` simple express-validator los valida igual y una
// cita sin negocio (o sin propiedad) no se podía guardar.
const appointmentRules = [
  body('user').notEmpty().withMessage('El usuario es obligatorio'),
  body('date').notEmpty().withMessage('La fecha es obligatoria').isISO8601().withMessage('Fecha no válida'),
  body('client').optional({ values: 'falsy' }).isMongoId().withMessage('Cliente no válido'),
  body('business').optional({ values: 'falsy' }).isMongoId().withMessage('Negocio no válido'),
  body('property').optional({ values: 'falsy' }).isMongoId().withMessage('Propiedad no válida'),
  body('type').optional({ values: 'falsy' }).isIn(APPOINTMENT_TYPES).withMessage('Tipo de cita no válido'),
  body('typeOther').optional({ values: 'falsy' }).isString().isLength({ max: 120 }).withMessage('El tipo "otro" es demasiado largo'),
  body('notes').optional({ values: 'falsy' }).isString().isLength({ max: 2000 }),
  body('place').optional({ values: 'falsy' }).isString().isLength({ max: 200 }),
];

const taskRules = [
  body('title').notEmpty().withMessage('El título de la tarea es obligatorio'),
  body('assignedTo').notEmpty().withMessage('El responsable es obligatorio'),
  body('date').notEmpty().withMessage('La fecha es obligatoria').isISO8601().withMessage('Fecha no válida'),
  body('priority').optional({ values: 'falsy' }).isIn(['baja', 'media', 'alta', 'urgente']).withMessage('Prioridad no válida'),
  body('status').optional({ values: 'falsy' }).isIn(['pendiente', 'en_proceso', 'completada', 'cancelada', 'vencida']).withMessage('Estado no válido'),
];

const idParam = [param('id').isMongoId().withMessage('Identificador no válido')];

const statusRules = [body('status').notEmpty().withMessage('El estado es obligatorio')];

module.exports = {
  appointmentRules: [...appointmentRules, validate],
  taskRules: [...taskRules, validate],
  idParam: [...idParam, validate],
  statusRules: [...statusRules, validate],
};
