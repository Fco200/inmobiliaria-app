'use strict';

const { body, param } = require('express-validator');
const validate = require('../middlewares/validate');

const documentRules = [
  body('name').notEmpty().withMessage('El nombre del documento es obligatorio'),
  body('type').optional().isIn(['identificacion', 'escrituras', 'avaluo', 'contratos', 'comprobantes', 'bancario', 'legal', 'datos_personales', 'otros']).withMessage('Tipo de documento no válido'),
  body('status').optional().isIn(['pendiente', 'recibido', 'validado', 'rechazado']).withMessage('Estado no válido'),
  body('client').optional().isMongoId().withMessage('Cliente no válido'),
  body('property').optional().isMongoId().withMessage('Propiedad no válida'),
  body('business').optional().isMongoId().withMessage('Negocio no válido'),
];

const documentUpdateRules = [
  body('name').optional().notEmpty().withMessage('El nombre del documento no puede estar vacío'),
  body('type').optional().isIn(['identificacion', 'escrituras', 'avaluo', 'contratos', 'comprobantes', 'bancario', 'legal', 'datos_personales', 'otros']).withMessage('Tipo de documento no válido'),
  body('status').optional().isIn(['pendiente', 'recibido', 'validado', 'rechazado']).withMessage('Estado no válido'),
  body('client').optional().isMongoId().withMessage('Cliente no válido'),
  body('property').optional().isMongoId().withMessage('Propiedad no válida'),
  body('business').optional().isMongoId().withMessage('Negocio no válido'),
];

const prospectingRules = [
  body('type')
    .notEmpty()
    .withMessage('El tipo de actividad es obligatorio')
    .isIn(['lonas', 'tarjetas', 'volantes', 'cambaceo', 'publicidad', 'gasolina', 'imagen', 'otros'])
    .withMessage('Tipo de actividad no válido'),
  body('date').isISO8601().withMessage('La fecha es obligatoria'),
  body('user').optional().isMongoId().withMessage('Usuario no válido'),
];

const idParam = [param('id').isMongoId().withMessage('Identificador no válido')];

module.exports = {
  documentRules: [...documentRules, validate],
  documentUpdateRules: [...documentUpdateRules, validate],
  prospectingRules: [...prospectingRules, validate],
  idParam: [...idParam, validate],
};
