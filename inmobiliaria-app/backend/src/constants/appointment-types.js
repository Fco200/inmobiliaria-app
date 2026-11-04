'use strict';

// Tipos de cita en el orden exacto que los ofrece el formulario:
// Visita propiedad, Oficina, Promesa, Avalúo, Seguimiento, Firma Notario,
// Entrega, Comisiones, Otro (especificar).
// 'firma' es un valor legado: se conserva en el enum del modelo para que los
// documentos antiguos sigan siendo válidos, pero ya no aparece en la UI.
const APPOINTMENT_TYPES = [
  'visita_propiedad',
  'oficina',
  'promesa',
  'avaluo',
  'seguimiento',
  'firma_notario',
  'entrega',
  'comisiones',
  'otro',
  'firma',
];

// Medios de pago que la UI ofrece en "Se puede vender con".
const PROPERTY_PAYMENT_METHODS = ['contado', 'infonavit', 'banco', 'fovissste', 'todos', 'otro'];

module.exports = { APPOINTMENT_TYPES, PROPERTY_PAYMENT_METHODS };
