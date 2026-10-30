'use strict';

const { Property, Business, BusinessStage } = require('../models');
const {
  STAGE_ORDER,
  normalizeStage,
  stageLabel,
} = require('../constants/business-stages');

// ─────────────────────────────────────────────────────────────────────────────
// Migraciones de datos del inventario y de negocios.
//
// Son IDEMPOTENTES: se ejecutan en cada arranque del servidor y también desde
// `npm run migrate:folios`. No borran información: solo normalizan formatos y
// valores heredados para que la app trabaje con el catálogo nuevo.
// ─────────────────────────────────────────────────────────────────────────────

const FOLIO_RE = /^(\d{4})-(\d+)$/;
const LEGACY_FOLIO_RE = /^INMO-(\d+)-(\d{4})$/i;

function padSeq(value) {
  return String(Math.max(1, Number(value) || 1)).padStart(3, '0');
}

/**
 * Convierte todos los folios al formato `YYYY-###`.
 *  - `INMO-###-YYYY` → `YYYY-###`.
 *  - `YYYY-#`        → `YYYY-###` (relleno a 3 dígitos).
 *  - Sin folio o con un formato libre → se asigna el siguiente del año de alta.
 * Los folios ya válidos NO se tocan.
 */
async function migratePropertyFolios() {
  const docs = await Property.find({})
    .select('_id folio createdAt')
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  const used = new Set();
  const pending = [];
  const finalFolio = new Map();

  // Primera pasada: reserva los folios que ya están en formato definitivo.
  for (const doc of docs) {
    const raw = String(doc.folio || '').trim();
    const match = raw.match(FOLIO_RE);
    if (!match) {
      pending.push(doc);
      continue;
    }
    const candidate = `${match[1]}-${padSeq(match[2])}`;
    if (candidate === raw && !used.has(candidate)) {
      used.add(candidate);
      finalFolio.set(String(doc._id), raw);
    } else {
      // Válido pero sin relleno (2026-7) o repetido: se reasigna abajo.
      pending.push(doc);
    }
  }

  // Segunda pasada: asigna folio a los pendientes respetando el año.
  for (const doc of pending) {
    const raw = String(doc.folio || '').trim();
    let year = '';
    let seq = 1;

    const inmo = raw.match(LEGACY_FOLIO_RE);
    const modern = raw.match(FOLIO_RE);
    if (inmo) {
      year = inmo[2];
      seq = Number(inmo[1]) || 1;
    } else if (modern) {
      year = modern[1];
      seq = Number(modern[2]) || 1;
    } else {
      const date = doc.createdAt ? new Date(doc.createdAt) : new Date();
      year = String(Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear());
    }

    let candidate = `${year}-${padSeq(seq)}`;
    while (used.has(candidate)) {
      seq += 1;
      candidate = `${year}-${padSeq(seq)}`;
    }
    used.add(candidate);
    finalFolio.set(String(doc._id), candidate);
  }

  const operations = [];
  for (const doc of docs) {
    const target = finalFolio.get(String(doc._id));
    const current = String(doc.folio || '').trim();
    if (target && target !== current) {
      operations.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { folio: target } },
        },
      });
    }
  }

  if (operations.length) {
    await Property.bulkWrite(operations, { ordered: false });
  }
  return { total: docs.length, updated: operations.length };
}

/** Normaliza estados heredados del inventario. */
async function migratePropertyStatuses() {
  const maps = [
    { from: 'en_proceso', to: 'apartada' },
    { from: 'vendida', to: 'concluida' },
    { from: 'rentada', to: 'concluida' },
  ];
  let updated = 0;
  for (const { from, to } of maps) {
    const result = await Property.updateMany(
      { status: from },
      { $set: { status: to } }
    );
    updated += result.modifiedCount || 0;
  }
  return { updated };
}

/** Normaliza las etapas heredadas de negocios y de su bitácora. */
async function migrateBusinessStages() {
  const businesses = await Business.find({}).select('_id currentStage').lean();
  const stageRecords = await BusinessStage.find({}).select('_id stageCode').lean();

  const businessOps = [];
  businesses.forEach((doc) => {
    const next = normalizeStage(doc.currentStage);
    if (next && next !== doc.currentStage) {
      businessOps.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { currentStage: next } },
        },
      });
    }
  });

  const stageOps = [];
  stageRecords.forEach((doc) => {
    const next = normalizeStage(doc.stageCode);
    if (!next || next === doc.stageCode) return;
    const order = STAGE_ORDER.indexOf(next);
    stageOps.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: {
            stageCode: next,
            name: stageLabel(next),
            order: order < 0 ? 0 : order,
          },
        },
      },
    });
  });

  if (businessOps.length) await Business.bulkWrite(businessOps, { ordered: false });
  if (stageOps.length) await BusinessStage.bulkWrite(stageOps, { ordered: false });

  return { businesses: businessOps.length, stageRecords: stageOps.length };
}

/**
 * Ejecuta todas las migraciones. Nunca lanza: si una falla se registra el error
 * y el arranque del servidor continúa (la app sigue operando con los valores
 * heredados, que están contemplados en los enums de los modelos).
 */
async function runDataMigrations({ log = true } = {}) {
  const result = {};
  try {
    result.folios = await migratePropertyFolios();
  } catch (error) {
    result.folios = { error: error.message };
  }
  try {
    result.statuses = await migratePropertyStatuses();
  } catch (error) {
    result.statuses = { error: error.message };
  }
  try {
    result.stages = await migrateBusinessStages();
  } catch (error) {
    result.stages = { error: error.message };
  }

  if (log) {
    const folios = result.folios || {};
    const statuses = result.statuses || {};
    const stages = result.stages || {};
    if (folios.updated) {
      console.log(`[Migración] Folios normalizados: ${folios.updated}/${folios.total}.`);
    }
    if (statuses.updated) {
      console.log(`[Migración] Estados de propiedad normalizados: ${statuses.updated}.`);
    }
    if (stages.businesses || stages.stageRecords) {
      console.log(`[Migración] Etapas de negocio normalizadas: ${stages.businesses || 0} negocio(s), ${stages.stageRecords || 0} registro(s) de bitácora.`);
    }
    [result.folios, result.statuses, result.stages].forEach((item) => {
      if (item && item.error) console.warn('[Migración] Aviso:', item.error);
    });
  }

  return result;
}

module.exports = {
  runDataMigrations,
  migratePropertyFolios,
  migratePropertyStatuses,
  migrateBusinessStages,
};
