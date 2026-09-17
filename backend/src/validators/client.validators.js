'use strict';

const { body, param } = require('express-validator');
const validate = require('../middlewares/validate');

const ETAPAS = ['PROSPECTO', 'PERFILADO', 'SEGUIMIENTO', 'CITA', 'NEGOCIACION_CIERRE', 'POSTVENTA', 'DESCARTADO'];
const MEDIOS = ['WhatsApp', 'Facebook', 'Llamada', 'Portal Inmobiliario', 'Lona/Rótulo', 'Recomendación', 'Otro'];
const SERVICIOS = ['Comprar', 'Vender', 'Rentar', 'Otro'];
const FORMAS_PAGO = ['Contado', 'Infonavit', 'Fovissste', 'Bancario', 'Otro'];

// Creación de clientes: el nombre es obligatorio.
const clientRules = [
  body('nombre').trim().notEmpty().withMessage('El nombre del cliente es obligatorio'),
  body('telefono').optional().isLength({ min: 7, max: 20 }).withMessage('El teléfono no es válido'),
  body('email').optional().isEmail().withMessage('El correo no es válido'),
  body('medio').optional().isIn(MEDIOS).withMessage('Medio de contacto no válido'),
  body('servicio').optional().isIn(SERVICIOS).withMessage('Servicio no válido'),
  body('etapaActual').optional().isIn(ETAPAS).withMessage('Etapa no válida'),
  body('formaPago').optional().isIn(FORMAS_PAGO).withMessage('Forma de pago no válida'),
  body('vigencia').optional().isString().withMessage('Vigencia no válida'),
  body('asesorAsignado').optional().isMongoId().withMessage('Asesor no válido'),
  body('capacidad').optional().isNumeric().withMessage('Capacidad de pago no válida'),
];

// Actualización desde "Editar perfil": permite edición parcial sin nombre.
const clientUpdateRules = [
  body('nombre').optional().trim().notEmpty().withMessage('El nombre del cliente es obligatorio'),
  body('telefono').optional({ values: 'falsy' }).isLength({ min: 7, max: 20 }).withMessage('El teléfono no es válido'),
  body('email').optional({ values: 'falsy' }).isEmail().withMessage('El correo no es válido'),
  body('medio').optional().isIn(MEDIOS).withMessage('Medio de contacto no válido'),
  body('servicio').optional().isIn(SERVICIOS).withMessage('Servicio no válido'),
  body('etapaActual').optional().isIn(ETAPAS).withMessage('Etapa no válida'),
  body('formaPago').optional().isIn(FORMAS_PAGO).withMessage('Forma de pago no válida'),
  body('vigencia').optional().isString().withMessage('Vigencia no válida'),
  body('asesorAsignado').optional().isMongoId().withMessage('Asesor no válido'),
  body('capacidad').optional().isNumeric().withMessage('Capacidad de pago no válida'),
];

// Cambio de etapa: etapa válida + nota obligatoria.
const stageRules = [
  body('etapa').isIn(ETAPAS).withMessage('Etapa no válida'),
  body('nota').trim().notEmpty().withMessage('La nota es obligatoria'),
];

const clientIdParam = [param('id').isMongoId().withMessage('Identificador no válido')];

module.exports = {
  clientRules: [...clientRules, validate],
  clientUpdateRules: [...clientUpdateRules, validate],
  stageRules: [...stageRules, validate],
  clientIdParam: [...clientIdParam, validate],
};