'use strict';

const { body, param } = require('express-validator');
const validate = require('../middlewares/validate');


// Se aceptan las etapas canónicas y los códigos heredados; el controlador los
// normaliza antes de guardar para que la base quede siempre en el flujo nuevo.


const captadorExternoRules = [
  body('captadorExternalName').optional({ values: 'falsy' }).isString().isLength({ max: 140 }).withMessage('El nombre del captador externo es demasiado largo'),
  body('captadorExternalPhone').optional({ values: 'falsy' }).isString().isLength({ max: 30 }).withMessage('El teléfono del captador externo no es válido'),
  body('captadorExternalEmail').optional({ values: 'falsy' }).isEmail().withMessage('El correo del captador externo no es válido'),
  body('ticketValue').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('El valor ticket no puede ser negativo'),
];

const businessRules = [
  ...captadorExternoRules,
  body('name').notEmpty().withMessage('El nombre del negocio es obligatorio'),
  body('mainAdvisor').optional().isMongoId().withMessage('Asesor principal no válido'),
  body('asesor_captador_id').optional({ values: 'falsy' }).isMongoId().withMessage('Asesor captador no válido'),
  body('asesor_cliente_id').optional({ values: 'falsy' }).isMongoId().withMessage('Asesor de cliente no válido'),
  body('cliente_id').optional({ values: 'falsy' }).isMongoId().withMessage('Cliente no válido'),
  body('buyerClient').optional({ values: 'falsy' }).isMongoId().withMessage('Comprador no válido'),
  body('buyerExternalName').optional({ values: 'falsy' }).isString().isLength({ max: 140 }).withMessage('El nombre del comprador externo es demasiado largo'),
  body('sellerClient').optional({ values: 'falsy' }).isMongoId().withMessage('Vendedor no válido'),
  body('sellerExternalName').optional({ values: 'falsy' }).isString().isLength({ max: 140 }).withMessage('El nombre del vendedor externo es demasiado largo'),
  body('partnerAdvisorName').optional({ values: 'falsy' }).isString().isLength({ max: 140 }).withMessage('El nombre del asesor externo es demasiado largo'),
  body('property').optional({ values: 'falsy' }).isMongoId().withMessage('Propiedad no válida'),
  body('processType').optional().isIn(['comprador', 'vendedor']).withMessage('Tipo de proceso no válido'),
  body('valueOperation').optional().isFloat({ min: 0 }).withMessage('El valor de la operación no puede ser negativo'),
  body('currentStage').optional({ values: 'falsy' }).isString().trim().notEmpty().withMessage('Etapa no válida'),
  body('fecha_cierre').optional({ values: 'falsy' }).custom((v) => !v || !isNaN(Date.parse(v))).withMessage('Fecha de cierre estimada no válida'),
];

const businessUpdateRules = [
  ...captadorExternoRules,
  body('name').optional().notEmpty().withMessage('El nombre del negocio no puede estar vacío'),
  body('mainAdvisor').optional().isMongoId().withMessage('Asesor principal no válido'),
  body('asesor_captador_id').optional({ values: 'falsy' }).isMongoId().withMessage('Asesor captador no válido'),
  body('asesor_cliente_id').optional({ values: 'falsy' }).isMongoId().withMessage('Asesor de cliente no válido'),
  body('cliente_id').optional({ values: 'falsy' }).isMongoId().withMessage('Cliente no válido'),
  body('buyerClient').optional({ values: 'falsy' }).isMongoId().withMessage('Comprador no válido'),
  body('buyerExternalName').optional({ values: 'falsy' }).isString().isLength({ max: 140 }).withMessage('El nombre del comprador externo es demasiado largo'),
  body('sellerClient').optional({ values: 'falsy' }).isMongoId().withMessage('Vendedor no válido'),
  body('sellerExternalName').optional({ values: 'falsy' }).isString().isLength({ max: 140 }).withMessage('El nombre del vendedor externo es demasiado largo'),
  body('partnerAdvisorName').optional({ values: 'falsy' }).isString().isLength({ max: 140 }).withMessage('El nombre del asesor externo es demasiado largo'),
  body('property').optional({ values: 'falsy' }).isMongoId().withMessage('Propiedad no válida'),
  body('partnerAdvisor').optional({ values: 'falsy' }).custom((v) => !v || /^[0-9a-fA-F]{24}$/.test(v)).withMessage('Compañero no válido'),
  body('processType').optional().isIn(['comprador', 'vendedor']).withMessage('Tipo de proceso no válido'),
  body('valueOperation').optional().isFloat({ min: 0 }).withMessage('El valor de la operación no puede ser negativo'),
  body('currentStage').optional({ values: 'falsy' }).isString().trim().notEmpty().withMessage('Etapa no válida'),
  body('status').optional().isIn(['activo', 'concluido', 'cancelado']).withMessage('Estado no válido'),
  body('fecha_cierre').optional({ values: 'falsy' }).custom((v) => !v || !isNaN(Date.parse(v))).withMessage('Fecha de cierre estimada no válida'),
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
    .isString().trim().notEmpty()
    .withMessage('Etapa no válida'),
];

module.exports = {
  businessRules: [...businessRules, validate],
  businessUpdateRules: [...businessUpdateRules, validate],
  businessIdParam: [...businessIdParam, validate],
  stageRules: [...stageRules, validate],
};
