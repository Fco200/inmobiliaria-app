'use strict';

const { body, param } = require('express-validator');
const validate = require('../middlewares/validate');

// 'PERFILADO' es una etapa legada: se acepta para que los registros anteriores
// a la migración (Perfilado → Seguimiento) puedan seguir guardándose, pero el
// flujo de la interfaz ya no la ofrece.
const ETAPAS = ['PROSPECTO', 'CITA', 'SEGUIMIENTO', 'NEGOCIACION_CIERRE', 'POSTVENTA', 'DESCARTADO', 'PERFILADO'];
const MEDIOS = ['WhatsApp', 'Facebook', 'Llamada', 'Portal', 'Portal Inmobiliario', 'Lona', 'Lona/Rótulo', 'Recomendación', 'Otro'];
// Cinco opciones exactas del formulario de operación + la variante "Otro".
const SERVICIOS = ['Vender', 'Comprar', 'Rentar', 'Alquilar', 'Otro'];
const TIPOS_PROPIEDAD = ['Casa', 'Departamento', 'Terreno', 'Local', 'Bodega', 'Rancho', 'Playa', 'Otro', ''];

// Creación de clientes: el nombre es obligatorio.
const clientRules = [
  body('nombre').trim().notEmpty().withMessage('El nombre del cliente es obligatorio'),
  body('telefono').optional().isLength({ min: 7, max: 20 }).withMessage('El teléfono no es válido'),
  body('email').optional().isEmail().withMessage('El correo no es válido'),
  body('medio').optional().isIn(MEDIOS).withMessage('Medio de contacto no válido'),
  body('servicio').optional().isIn(SERVICIOS).withMessage('Operación no válida'),
  body('servicioOtro').optional({ values: 'falsy' }).isString().isLength({ max: 120 }).withMessage('La operación "otro" es demasiado larga'),
  body('tipoPropiedad').optional().isIn(TIPOS_PROPIEDAD).withMessage('Tipo de propiedad no válido'),
  body('tipoPropiedadOtro').optional({ values: 'falsy' }).isString().isLength({ max: 120 }).withMessage('El tipo de propiedad "otro" es demasiado largo'),
  body('etapaActual').optional().isIn(ETAPAS).withMessage('Etapa no válida'),
  body('formaPago').optional().isString().isLength({ max: 120 }).withMessage('Forma de pago no válida'),
  body('formaPagoOtro').optional({ values: 'falsy' }).isString().isLength({ max: 120 }).withMessage('La forma de pago "otro" es demasiado larga'),
  body('asesorAsignado').optional().isMongoId().withMessage('Asesor no válido'),
  body('capacidad').optional().isNumeric().withMessage('Presupuesto no válido'),
];

// Actualización desde "Editar perfil": permite edición parcial sin nombre.
const clientUpdateRules = [
  body('nombre').optional().trim().notEmpty().withMessage('El nombre del cliente es obligatorio'),
  body('telefono').optional({ values: 'falsy' }).isLength({ min: 7, max: 20 }).withMessage('El teléfono no es válido'),
  body('email').optional().isEmail().withMessage('El correo no es válido'),
  body('medio').optional().isIn(MEDIOS).withMessage('Medio de contacto no válido'),
  body('servicio').optional().isIn(SERVICIOS).withMessage('Operación no válida'),
  body('servicioOtro').optional({ values: 'falsy' }).isString().isLength({ max: 120 }).withMessage('La operación "otro" es demasiado larga'),
  body('tipoPropiedad').optional().isIn(TIPOS_PROPIEDAD).withMessage('Tipo de propiedad no válido'),
  body('tipoPropiedadOtro').optional({ values: 'falsy' }).isString().isLength({ max: 120 }).withMessage('El tipo de propiedad "otro" es demasiado largo'),
  body('etapaActual').optional().isIn(ETAPAS).withMessage('Etapa no válida'),
  body('formaPago').optional().isString().isLength({ max: 120 }).withMessage('Forma de pago no válida'),
  body('formaPagoOtro').optional({ values: 'falsy' }).isString().isLength({ max: 120 }).withMessage('La forma de pago "otro" es demasiado larga'),
  body('asesorAsignado').optional().isMongoId().withMessage('Asesor no válido'),
  body('capacidad').optional().isNumeric().withMessage('Presupuesto no válido'),
];

// Cambio de etapa: etapa válida (etapaNueva o etapa) + nota obligatoria + datos del perfil opcionales.
const stageRules = [
  body('etapaNueva').optional().isIn(ETAPAS).withMessage('Etapa no válida'),
  body('etapa').optional().isIn(ETAPAS).withMessage('Etapa no válida'),
  body('nota').trim().notEmpty().withMessage('La nota es obligatoria'),
  body('datosEtapa').optional().isObject().withMessage('datosEtapa debe ser un objeto'),
];

const clientIdParam = [param('id').isMongoId().withMessage('Identificador no válido')];

module.exports = {
  clientRules: [...clientRules, validate],
  clientUpdateRules: [...clientUpdateRules, validate],
  stageRules: [...stageRules, validate],
  clientIdParam: [...clientIdParam, validate],
};