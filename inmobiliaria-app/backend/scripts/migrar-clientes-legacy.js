'use strict';

// Migración UNICA de clientes legacy hacia el nuevo esquema del módulo de Clientes.
// Ejecutar una sola vez:  node scripts/migrar-clientes-legacy.js   (o npm run migrate:clientes)
// Solo RELLENA los campos canónicos que faltan a partir de los campos viejos.
// NUNCA pisa datos canónicos ya capturados. NO borra información.
//
// Mapeos:
//  name           -> nombre
//  phone          -> telefono
//  joinedAt       -> fechaRegistro
//  notes          -> notasGenerales
//  responsibleUser-> asesorAsignado
//  type           -> servicio          (comprador->Comprar, vendedor->Vender, rentar/alquilar->Rentar)
//  contactMedium  -> medio             (redes->Facebook, sitio_web->Portal Inmobiliario, lona->Lona/Rótulo,
//                                        referido->Recomendación, tarjeta->Otro)
//  metodoPago     -> formaPago         (infonavit->Infonavit, credito_*->Bancario, efectivo->Contado, otro->Otro)
//  buyerInfo.budget        -> capacidad
//  buyerInfo.desiredZone   -> zona
//  buyerInfo.desiredFeatures -> queBusca
//  funnelStage    -> etapaActual       (ver ETAPA_MAP) + re-sincroniza funnelStage a 'canonico'
//  fecha basada en updatedAt/joinedAt  -> ultVez
//  interacciones canal 'llamada'       -> totalLlamadas  (si el cliente no tenía contador)
//  si historialEtapas está vacío       -> entrada inicial de migración

const connectDB = require('../src/config/db');
const { Client, Interaction } = require('../src/models');

// Etapa del embudo legacy -> etapa del ciclo de vida nuevo.
// "perfilado" del embudo viejo equivale a la etapa PERFILADO del embudo nuevo
// (se recorre antes de la cita); "contacto" es el paso intermedio sin perfil
// definido y corresponde a SEGUIMIENTO.
const ETAPA_MAP = {
  prospecto: 'PROSPECTO',
  perfilado: 'PERFILADO',
  contacto: 'SEGUIMIENTO',
  cita: 'CITA',
  negociacion: 'NEGOCIACION_CIERRE',
  promesa: 'NEGOCIACION_CIERRE',
  cierre: 'NEGOCIACION_CIERRE',
  postventa: 'POSTVENTA',
  descartado: 'DESCARTADO',
};

// Etapa nueva -> funnelStage sincronizado (mismo mapeo que el controlador).
const STAGE_TO_FUNNEL = {
  PROSPECTO: 'prospecto',
  PERFILADO: 'contacto',
  SEGUIMIENTO: 'contacto',
  CITA: 'cita',
  NEGOCIACION_CIERRE: 'negociacion',
  POSTVENTA: 'postventa',
  DESCARTADO: 'descartado',
};

const TYPE_TO_SERVICIO = {
  comprador: 'Comprar',
  vendedor: 'Vender',
  rentar: 'Rentar',
  alquilar: 'Alquilar',
};

const MEDIUM_TO_MEDIO = {
  redes: 'Facebook',
  sitio_web: 'Portal Inmobiliario',
  lona: 'Lona/Rótulo',
  referido: 'Recomendación',
  tarjeta: 'Otro',
};

const METODO_TO_FORMA = {
  infonavit: 'Infonavit',
  credito_bancario: 'Bancario',
  credito_hipotecario: 'Bancario',
  efectivo: 'Contado',
  otro: 'Otro',
};

const hasText = (v) => typeof v === 'string' && String(v).trim().length > 0;

async function main() {
  const connection = await connectDB();
  if (!connection) {
    console.error('No se pudo conectar a MongoDB. Revisa MONGODB_URI en .env');
    process.exit(1);
  }

  // Conteos de llamadas por cliente (solo canal 'llamada').
  const callCounts = new Map();
  try {
    const rows = await Interaction.aggregate([
      { $match: { channel: 'llamada' } },
      { $group: { _id: '$client', count: { $sum: 1 } } },
    ]);
    rows.forEach((r) => callCounts.set(String(r._id), r.count));
  } catch (error) {
    console.warn('No se pudieron contabilizar llamadas históricas:', error.message);
  }

  const clients = await Client.find({}).lean().cursor();
  let reviewed = 0;
  let updated = 0;
  const issues = [];

  for await (const raw of clients) {
    reviewed += 1;
    const doc = new Client(raw); // hidrata para detectar getters/campos reales
    const rawDoc = raw;
    let changed = false;

    // ── Datos básicos ───────────────────────────────────────────────────
    if (!hasText(doc.nombre) && hasText(rawDoc.name)) {
      doc.nombre = String(rawDoc.name).trim();
      changed = true;
    }
    if (!hasText(doc.telefono) && hasText(rawDoc.phone)) {
      doc.telefono = String(rawDoc.phone).trim();
      changed = true;
    }
    if (!doc.fechaRegistro && rawDoc.joinedAt) {
      doc.fechaRegistro = new Date(rawDoc.joinedAt);
      changed = true;
    }
    if (!hasText(doc.notasGenerales) && hasText(rawDoc.notes)) {
      doc.notasGenerales = String(rawDoc.notes).trim();
      changed = true;
    }
    if (!doc.asesorAsignado && rawDoc.responsibleUser) {
      doc.asesorAsignado = rawDoc.responsibleUser;
      changed = true;
    }

    // ── Perfil del cliente ──────────────────────────────────────────────────
    const servicioMap = TYPE_TO_SERVICIO[String(rawDoc.type || '').toLowerCase()];
    if (!servicioMap && rawDoc.type) {
      issues.push(`#${rawDoc._id}: type "${rawDoc.type}" sin mapeo; servicio sin cambios`);
    }
    if (servicioMap && !doc.servicio) {
      doc.servicio = servicioMap;
      changed = true;
    }
    const medioMap = MEDIUM_TO_MEDIO[String(rawDoc.contactMedium || '').toLowerCase()];
    if (!medioMap && rawDoc.contactMedium) {
      issues.push(`#${rawDoc._id}: contactMedium "${rawDoc.contactMedium}" sin mapeo; medio sin cambios`);
    }
    if (medioMap && !doc.medio) {
      doc.medio = medioMap;
      changed = true;
    }
    const buyerInfo = rawDoc.buyerInfo && typeof rawDoc.buyerInfo === 'object' ? rawDoc.buyerInfo : {};
    if (!(Number(doc.capacidad) > 0) && Number(buyerInfo.budget) > 0) {
      doc.capacidad = Number(buyerInfo.budget);
      changed = true;
    }
    if (!hasText(doc.zona) && hasText(buyerInfo.desiredZone)) {
      doc.zona = String(buyerInfo.desiredZone).trim();
      changed = true;
    }
    if (!hasText(doc.queBusca) && hasText(buyerInfo.desiredFeatures)) {
      doc.queBusca = String(buyerInfo.desiredFeatures).trim();
      changed = true;
    }
    if (!doc.formaPago) {
      const metodo = METODO_TO_FORMA[String(rawDoc.metodoPago || '').toLowerCase()];
      const pagoLibre = String(buyerInfo.paymentMethod || '').trim();
      if (metodo) {
        doc.formaPago = metodo;
        changed = true;
      } else if (pagoLibre === 'Contado' || pagoLibre === 'Infonavit' || pagoLibre === 'Fovissste' || pagoLibre === 'Bancario') {
        doc.formaPago = pagoLibre;
        changed = true;
      } else if (hasText(pagoLibre)) {
        issues.push(`#${rawDoc._id}: paymentMethod "${pagoLibre}" sin mapeo; formaPago sin cambios`);
      }
    }

    // ── Etapa y últimos contactos ───────────────────────────────────────
    if (!doc.etapaActual) {
      const funnel = String(rawDoc.funnelStage || 'prospecto').toLowerCase();
      doc.etapaActual = ETAPA_MAP[funnel] || 'PROSPECTO';
      doc.funnelStage = STAGE_TO_FUNNEL[doc.etapaActual] || 'prospecto';
      changed = true;
    } else if (rawDoc.etapaActual && !rawDoc.funnelStage) {
      doc.funnelStage = STAGE_TO_FUNNEL[doc.etapaActual] || 'prospecto';
      changed = true;
    }

    if (!doc.ultVez) {
      doc.ultVez = rawDoc.updatedAt || rawDoc.joinedAt || doc.fechaRegistro || Date.now();
      changed = true;
    }

    const callCount = callCounts.get(String(rawDoc._id)) || 0;
    if (callCount > 0 && !(Number(doc.totalLlamadas) > 0)) {
      doc.totalLlamadas = callCount;
      changed = true;
    }

    // ── Bitácora inicial de migración ───────────────────────────────────
    if (!doc.historialEtapas || !doc.historialEtapas.length) {
      doc.historialEtapas.push({
        etapaAnterior: null,
        etapaNueva: doc.etapaActual,
        nota: 'Migración de datos legacy al nuevo ciclo de vida',
        usuario: null,
        fecha: doc.fechaRegistro || Date.now(),
      });
      changed = true;
    }

    if (!changed) continue;

    try {
      await doc.save({ validateBeforeSave: false });
      updated += 1;
      if (updated % 50 === 0) console.log(`... ${updated} clientes actualizados`);
    } catch (error) {
      issues.push(`#${rawDoc._id}: ${error.message}`);
    }
  }

  console.log('\n── Resumen de migración de clientes ──');
  console.log(`  Clientes revisados : ${reviewed}`);
  console.log(`  Clientes migrados  : ${updated}`);
  if (issues.length) {
    console.log(`  Advertencias       : ${issues.length}`);
    issues.slice(0, 25).forEach((i) => console.log(`    - ${i}`));
    if (issues.length > 25) console.log(`    ... y ${issues.length - 25} más`);
  } else {
    console.log('  Advertencias       : 0');
  }

  await connection.close();
  process.exit(0);
}

main();