'use strict';

const { body, param } = require('express-validator');
const validate = require('../middlewares/validate');
const { PROPERTY_PAYMENT_METHODS } = require('../constants/appointment-types');

// `optional({ values: 'falsy' })`: el formulario manda `null`/'' en los campos
// vacíos; con `.optional()` simple, crear una propiedad sin propietario o sin
// precio fallaba con "Propietario no válido" / "El precio no puede ser negativo".
const propertyRules = [
  body('type').notEmpty().withMessage('El tipo de inmueble es obligatorio'),
  body('operationType')
    .notEmpty()
    .withMessage('El tipo de operación es obligatorio')
    .isIn(['venta', 'renta', 'compra_localizada'])
    .withMessage('El tipo de operación no es válido'),
  body('status')
    .optional({ values: 'falsy' })
    .isIn(['disponible', 'apartada', 'inactiva', 'concluida'])
    .withMessage('El estado de la propiedad no es válido'),
  body('price').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('El precio no puede ser negativo'),
  body('owner').optional({ values: 'falsy' }).isMongoId().withMessage('Propietario no válido'),
  body('responsibleUser').optional({ values: 'falsy' }).isMongoId().withMessage('Usuario responsable no válido'),
  // Propietario externo: texto libre cuando no existe en la cartera de clientes.
  body('ownerName').optional({ values: 'falsy' }).isString().isLength({ max: 140 }).withMessage('El nombre del propietario es demasiado largo'),
  body('paymentMethods').optional({ values: 'falsy' }).isArray().withMessage('Formas de pago no válidas'),
  body('paymentMethods.*').optional({ values: 'falsy' }).isIn(PROPERTY_PAYMENT_METHODS).withMessage('Forma de pago no válida'),
  body('paymentMethodsOther').optional({ values: 'falsy' }).isString().isLength({ max: 120 }).withMessage('La forma de pago "otra" es demasiado larga'),
  // Propiedad externa: asesor/empresa dueña del inmueble (texto libre).
  body('externalAdvisor').optional({ values: 'falsy' }).isString().isLength({ max: 140 }).withMessage('El nombre del asesor externo es demasiado largo'),
];

const propertyIdParam = [param('id').isMongoId().withMessage('Identificador no válido')];

module.exports = {
  propertyRules: [...propertyRules, validate],
  propertyIdParam: [...propertyIdParam, validate],
};
