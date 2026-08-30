'use strict';

const { body, param } = require('express-validator');
const validate = require('../middlewares/validate');

const appointmentRules = [
  body('user').notEmpty().withMessage('El usuario es obligatorio'),
  body('date').notEmpty().withMessage('La fecha es obligatoria').isISO8601().withMessage('Fecha no válida'),
  body('client').optional().isMongoId().withMessage('Cliente no válido'),
  body('business').optional().isMongoId().withMessage('Negocio no válido'),
  body('property').optional().isMongoId().withMessage('Propiedad no válida'),
];

const taskRules = [
  body('title').notEmpty().withMessage('El título de la tarea es obligatorio'),
  body('assignedTo').notEmpty().withMessage('El responsable es obligatorio'),
  body('date').notEmpty().withMessage('La fecha es obligatoria').isISO8601().withMessage('Fecha no válida'),
];

const idParam = [param('id').isMongoId().withMessage('Identificador no válido')];

const statusRules = [body('status').notEmpty().withMessage('El estado es obligatorio')];

module.exports = {
  appointmentRules: [...appointmentRules, validate],
  taskRules: [...taskRules, validate],
  idParam: [...idParam, validate],
  statusRules: [...statusRules, validate],
};
