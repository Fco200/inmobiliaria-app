'use strict';

const { body, param } = require('express-validator');
const validate = require('../middlewares/validate');

const STAGES = [
  'nuevo',
  'prospecto',
  'contactado',
  'seguimiento',
  'cita',
  'captacion',
  'integracion_expedientes',
  'negociacion',
  'contrato',
  'promesa',
  'integracion',
  'avaluo',
  'revision',
  'notarias',
  'firma',
  'pago',
  'entrega',
  'postventa',
  'concluido',
  'cancelado',
];

const businessRules = [
  body('name').notEmpty().withMessage('El nombre del negocio es obligatorio'),
  body('mainAdvisor').optional().isMongoId().withMessage('Asesor principal no válido'),
  body('buyerClient').optional().isMongoId().withMessage('Comprador no válido'),
  body('sellerClient').optional().isMongoId().withMessage('Vendedor no válido'),
  body('property').optional().isMongoId().withMessage('Propiedad no válida'),
  body('processType').optional().isIn(['comprador', 'vendedor']).withMessage('Tipo de proceso no válido'),
  body('valueOperation').optional().isFloat({ min: 0 }).withMessage('El valor de la operación no puede ser negativo'),
];

const businessUpdateRules = [
  body('name').optional().notEmpty().withMessage('El nombre del negocio no puede estar vacío'),
  body('mainAdvisor').optional().isMongoId().withMessage('Asesor principal no válido'),
  body('buyerClient').optional().isMongoId().withMessage('Comprador no válido'),
  body('sellerClient').optional().isMongoId().withMessage('Vendedor no válido'),
  body('property').optional().isMongoId().withMessage('Propiedad no válida'),
  body('partnerAdvisor').optional().custom((v) => !v || /^[0-9a-fA-F]{24}$/.test(v)).withMessage('Compañero no válido'),
  body('processType').optional().isIn(['comprador', 'vendedor']).withMessage('Tipo de proceso no válido'),
  body('valueOperation').optional().isFloat({ min: 0 }).withMessage('El valor de la operación no puede ser negativo'),
  body('negotiation.offer').optional().isFloat({ min: 0 }).withMessage('La propuesta no puede ser negativa'),
  body('negotiation.counterOffer').optional().isFloat({ min: 0 }).withMessage('La contraoferta no puede ser negativa'),
  body('closing.promiseAmount').optional().isFloat({ min: 0 }).withMessage('El monto de promesa no puede ser negativo'),
  body('closing.closingAmount').optional().isFloat({ min: 0 }).withMessage('El monto de cierre no puede ser negativo'),
  body('closing.commission').optional().isFloat({ min: 0 }).withMessage('La comisión no puede ser negativa'),
  body('closing.promiseDate').optional().custom((v) => !v || !isNaN(Date.parse(v))).withMessage('Fecha de promesa no válida'),
  body('closing.closingDate').optional().custom((v) => !v || !isNaN(Date.parse(v))).withMessage('Fecha de cierre no válida'),
];

const businessIdParam = [param('id').isMongoId().withMessage('Identificador no válido')];

const stageRules = [
  body('stage')
    .notEmpty()
    .withMessage('La etapa es obligatoria')
    .isIn(STAGES)
    .withMessage('Etapa no válida'),
];

module.exports = {
  businessRules: [...businessRules, validate],
  businessUpdateRules: [...businessUpdateRules, validate],
  businessIdParam: [...businessIdParam, validate],
  stageRules: [...stageRules, validate],
};
