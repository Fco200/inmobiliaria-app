'use strict';

// Flujo de negocios configurable. Las etapas viven en la base de datos (ProcessFlow)
// y el administrador las edita desde Configuración. Si todavía no hay configuración
// guardada, se usa el flujo predeterminado de constants/business-stages.

const { STAGE_ORDER, STAGE_LABELS, normalizeStage } = require('../constants/business-stages');

const KEY = 'businessFlow';
const TTL_MS = 30 * 1000;
// Etapas que el resto del sistema usa para cerrar, cancelar o pausar: no se borran.
const SYSTEM_CODES = ['concluido', 'cancelado', 'PAUSA'];
const DEFAULT_COLORS = {
  PROMESA: '#6366f1',
  INTEGRACION: '#0ea5e9',
  AVALUO: '#14b8a6',
  REVISION_AVALUO: '#22c55e',
  NOTARIA: '#eab308',
  DICTAMEN_PRESUPUESTO: '#f97316',
  FIRMA: '#ef4444',
  PAGO: '#a855f7',
  ENTREGA: '#0f766e',
  concluido: '#1f9d55',
  cancelado: '#dc2626',
  PAUSA: '#64748b',
};

let cache = null;
let cacheAt = 0;

function defaultStages() {
  return STAGE_ORDER.map((code, index) => ({
    code,
    label: STAGE_LABELS[code] || code,
    color: DEFAULT_COLORS[code] || '#64748b',
    order: index,
    active: true,
    system: SYSTEM_CODES.includes(code),
    next: [],
  }));
}

function buildCache(stages) {
  const sorted = stages.slice().sort((a, b) => a.order - b.order);
  const byCode = new Map(sorted.map((s) => [s.code, s]));
  // Los nombres personalizados se publican en STAGE_LABELS para que cualquier
  // mensaje del sistema (notificaciones, historial) muestre el nombre elegido.
  sorted.forEach((s) => { STAGE_LABELS[s.code] = s.label; });
  cache = { stages: sorted, byCode };
  cacheAt = Date.now();
  return cache;
}

// Carga el flujo (desde la base de datos o el predeterminado) si hace falta.
async function flow() {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  const ProcessFlow = require('../models/processFlow.model');
  const doc = await ProcessFlow.findOne({ key: KEY }).lean();
  const stages = doc && Array.isArray(doc.stages) && doc.stages.length ? doc.stages : defaultStages();
  return buildCache(stages);
}

// Usable para negocios nuevos o cambios de etapa: activa o de sistema.
function isUsable(code) {
  const normalized = normalizeStage(code);
  if (!cache) return STAGE_ORDER.includes(normalized);
  const stage = cache.byCode.get(normalized);
  return Boolean(stage && (stage.active || stage.system));
}

// ¿Puede pasar un negocio de `from` a `to`? Sin reglas en `from`, cualquier cambio vale.
function allowedNext(from, to) {
  const a = normalizeStage(from);
  const b = normalizeStage(to);
  if (a === b || !cache) return true;
  const stage = cache.byCode.get(a);
  if (!stage || !stage.next || !stage.next.length) return true;
  return stage.next.includes(b);
}

function nextLabels(from) {
  const stage = cache && cache.byCode.get(normalizeStage(from));
  if (!stage || !stage.next || !stage.next.length) return [];
  return stage.next.map((code) => STAGE_LABELS[code] || code);
}

// Respuesta para la interfaz (configuración y selectores de negocio).
function describe() {
  const stages = cache ? cache.stages : defaultStages();
  const active = stages.filter((s) => s.active || s.system).map((s) => s.code);
  const colors = {};
  const labels = {};
  stages.forEach((s) => { colors[s.code] = s.color; labels[s.code] = s.label; });
  return {
    stages: stages.map((s) => ({
      code: s.code,
      label: s.label,
      color: s.color,
      order: s.order,
      active: s.active,
      system: s.system,
      next: s.next || [],
    })),
    byProcess: { comprador: active, vendedor: active },
    order: stages.map((s) => s.code),
    labels,
    colors,
    next: Object.fromEntries(stages.map((s) => [s.code, s.next || []])),
  };
}

function slugCode(label) {
  return String(label || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

// Valida y guarda el flujo que envió el administrador.
// input: [{ code?, label, color?, active?, next? }] en el orden deseado.
async function saveFlow(input) {
  const current = (await flow()).byCode;
  if (!Array.isArray(input) || !input.length) {
    throw Object.assign(new Error('Agrega al menos una etapa.'), { statusCode: 400 });
  }

  const used = new Set();
  const built = input.map((row, index) => {
    const label = String((row && row.label) || '').trim().slice(0, 60);
    if (!label) throw Object.assign(new Error(`La etapa ${index + 1} necesita un nombre.`), { statusCode: 400 });

    let code = String((row && row.code) || '').trim();
    const existing = code ? current.get(code) : null;
    if (!existing) {
      code = slugCode(label) || `ETAPA_${index + 1}`;
      // Un código nuevo nunca reutiliza el de una etapa existente ni de sistema,
      // para que los negocios que ya están en esa etapa no cambien de significado.
      let unique = code;
      let n = 2;
      while (used.has(unique) || current.has(unique) || SYSTEM_CODES.includes(unique)) {
        unique = `${code}_${n}`;
        n += 1;
      }
      code = unique;
    }
    if (used.has(code)) {
      throw Object.assign(new Error(`La etapa "${label}" está repetida.`), { statusCode: 400 });
    }
    used.add(code);

    const system = Boolean(existing && existing.system) || SYSTEM_CODES.includes(code);
    const color = /^#[0-9a-fA-F]{6}$/.test(String((row && row.color) || '')) ? row.color : '#64748b';
    return {
      code,
      label,
      color,
      order: index,
      active: system ? true : row.active !== false,
      system,
      next: Array.isArray(row.next) ? row.next.map(String) : [],
    };
  });

  SYSTEM_CODES.forEach((code) => {
    if (!used.has(code)) {
      throw Object.assign(new Error(`La etapa del sistema "${STAGE_LABELS[code] || code}" no se puede quitar.`), { statusCode: 400 });
    }
  });
  if (!built.some((s) => s.active && !s.system)) {
    throw Object.assign(new Error('Deja al menos una etapa activa para los negocios.'), { statusCode: 400 });
  }

  // Las transiciones solo pueden apuntar a etapas que existen en el flujo.
  built.forEach((stage) => {
    stage.next = stage.next.filter((code) => used.has(code) && code !== stage.code);
  });

  const ProcessFlow = require('../models/processFlow.model');
  await ProcessFlow.findOneAndUpdate(
    { key: KEY },
    { $set: { key: KEY, stages: built } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return buildCache(built);
}

module.exports = {
  flow,
  isUsable,
  allowedNext,
  nextLabels,
  describe,
  saveFlow,
  SYSTEM_CODES,
};
