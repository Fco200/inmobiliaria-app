'use strict';

// Flujo oficial de etapas de un negocio inmobiliario.
// El orden es el que se muestra en el kanban, el historial y el selector.
const STAGE_ORDER = [
  'PROMESA',
  'INTEGRACION',
  'AVALUO',
  'REVISION_AVALUO',
  'NOTARIA',
  'DICTAMEN_PRESUPUESTO',
  'FIRMA',
  'PAGO',
  'ENTREGA',
  'concluido',
  'cancelado',
  'PAUSA',
];

const STAGE_LABELS = {
  PROMESA: 'Promesa',
  INTEGRACION: 'Integración',
  AVALUO: 'Avalúo',
  REVISION_AVALUO: 'Revisión de avalúo',
  NOTARIA: 'Notaría',
  DICTAMEN_PRESUPUESTO: 'Dictamen / Presupuesto',
  FIRMA: 'Firma',
  PAGO: 'Pago',
  ENTREGA: 'Entrega',
  concluido: 'Concluido',
  cancelado: 'Cancelado',
  PAUSA: 'Pausa',
  // Etiquetas heredadas (se conservan para pintar registros viejos sin migrar).
  INSCRIPCION: 'Inscripción',
  DICTAMEN: 'Dictamen',
  CONCLUIDO: 'Concluido',
  CANCELADO: 'Cancelado',
  CANCELADO_DEFINITIVO: 'Cancelado definitivo',
  REVISION: 'Revisión de avalúo',
  NOTARIAS: 'Notaría',
  integracion: 'Integración',
  avaluo: 'Avalúo',
  revision: 'Revisión de avalúo',
  notarias: 'Notaría',
  firma: 'Firma',
  pago: 'Pago',
  entrega: 'Entrega',
};

// Etapas viejas que se normalizan a una etapa canónica.
const STAGE_ALIASES = {
  INSCRIPCION: 'PROMESA',
  DICTAMEN: 'DICTAMEN_PRESUPUESTO',
  REVISION: 'REVISION_AVALUO',
  NOTARIAS: 'NOTARIA',
  CONCLUIDO: 'concluido',
  CANCELADO: 'cancelado',
  CANCELADO_DEFINITIVO: 'cancelado',
  integracion: 'INTEGRACION',
  avaluo: 'AVALUO',
  revision: 'REVISION_AVALUO',
  notarias: 'NOTARIA',
  firma: 'FIRMA',
  pago: 'PAGO',
  entrega: 'ENTREGA',
  // Etapas de embudos anteriores del módulo de negocios.
  perfilado: 'PROMESA',
  promesa: 'PROMESA',
  nuevo: 'PROMESA',
  prospecto: 'PROMESA',
  contactado: 'PROMESA',
  seguimiento: 'PROMESA',
  cita: 'PROMESA',
  captacion: 'PROMESA',
  integracion_expedientes: 'INTEGRACION',
  negociacion: 'PROMESA',
  contrato: 'PROMESA',
  postventa: 'ENTREGA',
};

const CANONICAL_STAGES = new Set(STAGE_ORDER);

/** Devuelve la etapa canónica para un código nuevo o heredado. */
function normalizeStage(stage) {
  const value = String(stage == null ? '' : stage).trim();
  if (!value) return '';
  if (CANONICAL_STAGES.has(value)) return value;
  return STAGE_ALIASES[value] || value;
}

function stageLabel(stage) {
  const code = normalizeStage(stage);
  return STAGE_LABELS[code] || STAGE_LABELS[stage] || String(stage || '').replace(/_/g, ' ');
}

function stageOrder(stage) {
  const index = STAGE_ORDER.indexOf(normalizeStage(stage));
  return index < 0 ? 0 : index;
}

module.exports = {
  STAGE_ORDER,
  STAGE_LABELS,
  STAGE_ALIASES,
  CANONICAL_STAGES,
  normalizeStage,
  stageLabel,
  stageOrder,
};
