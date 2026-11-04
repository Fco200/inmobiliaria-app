'use strict';

// Migración de NEGOCIOS: embudo viejo -> embudo actual + un negocio por cliente.
//
// Qué hace, en este orden (el orden importa):
//  1. Renombra la etapa "perfilado" a "seguimiento" en los negocios y en su
//     bitácora de etapas, para que el embudo de negocios hable el mismo idioma
//     que el de clientes ("Seguimiento" es la etapa que sigue a la cita).
//  2. Detecta clientes con MÁS de un negocio ACTIVO y cancela los sobrantes,
//     dejando el más avanzado. Sin esto no se puede crear el índice único que
//     se aplica en el paso 4.
//  3. Reapunta `Cliente.negocioId` al negocio que sobrevive, para que la
//     insignia "Negocio vinculado" y el botón "Ver negocio" no queden
//     apuntando a un negocio cancelado.
//  4. Crea los índices únicos parciales de `buyerClient` y `sellerClient`.
//     Son NO destructivos: solo crean lo que falte, no borran índices.
//
// Regla de negocio que queda vigente a partir de aquí:
//   un cliente no puede tener dos negocios activos a la vez (ni como comprador
//   ni como vendedor). Un negocio concluido o cancelado NO bloquea: el cliente
//   puede volver a comprar/rentar más adelante.
//
// Es IDEMPOTENTE: se puede ejecutar las veces que haga falta.
//
// Uso:  npm run migrate:negocios
//   o: node scripts/migrar-negocios-seguimiento.js

const connectDB = require('../src/config/db');
const { Business, BusinessStage, Client } = require('../src/models');
// El embudo se importa del controlador para no duplicarlo aquí: si mañana se
// agrega o renombra una etapa, esta migración sigue siendo correcta.
const { STAGE_ORDER, STAGE_LABELS } = require('../src/controllers/business.controller');

const ETAPA_VIEJA = 'perfilado';
const ETAPA_NUEVA = 'seguimiento';

const ordenEtapa = (stage) => {
  const i = STAGE_ORDER.indexOf(stage);
  return i < 0 ? 0 : i;
};

// Referencia a un ObjectId o a un documento poblado: siempre su id en texto.
const refId = (valor) => String((valor && (valor._id || valor)) || '');

// Orden de preferencia para quedarse con el negocio "bueno" de cada cliente:
// activo > concluido > cancelado; a igualdad, el más avanzado del embudo; y
// si sigue el empate, el modificado más recientemente.
function puntaje(negocio) {
  const estado = { activo: 2, concluido: 1, cancelado: 0 }[negocio.status] || 0;
  return [estado, ordenEtapa(negocio.currentStage), new Date(negocio.updatedAt || 0).getTime()];
}

function esMejor(a, b) {
  const pa = puntaje(a);
  const pb = puntaje(b);
  for (let i = 0; i < pa.length; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i];
  }
  return false;
}

async function migrar() {
  const conn = await connectDB();
  if (!conn) {
    console.error('No hay conexión con MongoDB: no se pudo ejecutar la migración.');
    return false;
  }

  // ── 1) Perfilado -> Seguimiento ───────────────────────────────────────
  const negocios = await Business.updateMany(
    { currentStage: ETAPA_VIEJA },
    { $set: { currentStage: ETAPA_NUEVA } }
  );
  console.log(`[Negocios] Etapa ${ETAPA_VIEJA} -> ${ETAPA_NUEVA}: ${negocios.modifiedCount || 0} negocio(s).`);

  const etapas = await BusinessStage.updateMany(
    { stageCode: ETAPA_VIEJA },
    { $set: { stageCode: ETAPA_NUEVA, name: STAGE_LABELS[ETAPA_NUEVA] } }
  );
  console.log(`[Negocios] Bitácora de etapas actualizada: ${etapas.modifiedCount || 0} registro(s).`);

  // Los negocios con la etapa vieja en `currentStage` tampoco deben seguir
  // marcados como "en proceso" con ese código.
  const etapasAbiertas = await BusinessStage.updateMany(
    { stageCode: ETAPA_NUEVA, status: 'en_proceso' },
    { $set: { name: STAGE_LABELS[ETAPA_NUEVA] } }
  );
  if (etapasAbiertas.modifiedCount) {
    console.log(`[Negocios] Etapa abierta renombrada: ${etapasAbiertas.modifiedCount} registro(s).`);
  }

  // ── 2) Un negocio activo por cliente ──────────────────────────────────
  const activos = await Business.find({ status: 'activo' })
    .select('_id name currentStage status updatedAt buyerClient sellerClient')
    .lean();

  // clienteId -> negocios activos en los que participa
  const porCliente = new Map();
  activos.forEach((negocio) => {
    ['buyerClient', 'sellerClient'].forEach((campo) => {
      const id = refId(negocio[campo]);
      if (!id) return;
      if (!porCliente.has(id)) porCliente.set(id, []);
      porCliente.get(id).push(negocio);
    });
  });

  const duplicados = [];
  for (const [clienteId, lista] of porCliente.entries()) {
    // El mismo negocio puede aparecer dos veces si el cliente es a la vez
    // comprador y vendedor: se cuenta una sola vez.
    const unicos = Array.from(new Map(lista.map((n) => [String(n._id), n])).values());
    if (unicos.length < 2) continue;

    unicos.sort((a, b) => (esMejor(b, a) ? 1 : -1));
    const ganador = unicos[0];
    for (const perdedor of unicos.slice(1)) {
      duplicados.push({ clienteId, ganador, perdedor });
    }
  }

  if (!duplicados.length) {
    console.log('[Negocios] No hay clientes con más de un negocio activo.');
  }

  const ahora = new Date();
  for (const { clienteId, ganador, perdedor } of duplicados) {
    await Business.updateOne(
      { _id: perdedor._id },
      { $set: { status: 'cancelado', currentStage: 'cancelado', finishedAt: ahora } }
    );
    // Se deja rastro en la bitácora para que la cancelación no parezca
    // automática ni se pierda la etapa desde la que venía.
    await BusinessStage.create({
      business: perdedor._id,
      stageCode: 'cancelado',
      name: STAGE_LABELS.cancelado,
      order: ordenEtapa('cancelado'),
      startedAt: ahora,
      finishedAt: ahora,
      status: 'completada',
      comments: `Cancelado automáticamente: el cliente ya tenía el negocio "${ganador.name}" activo.`
        + ` Etapa anterior: ${STAGE_LABELS[perdedor.currentStage] || perdedor.currentStage}.`,
    });
    console.log(`[Negocios] Cancelado "${perdedor.name}" (duplicado de "${ganador.name}", cliente ${clienteId}).`);
  }

  // ── 3) Reapuntar Cliente.negocioId ────────────────────────────────────
  const todos = await Business.find({})
    .select('_id name status currentStage updatedAt buyerClient sellerClient')
    .lean();

  const mejorPorCliente = new Map();
  todos.forEach((negocio) => {
    ['buyerClient', 'sellerClient'].forEach((campo) => {
      const id = refId(negocio[campo]);
      if (!id) return;
      const actual = mejorPorCliente.get(id);
      if (!actual || esMejor(negocio, actual)) mejorPorCliente.set(id, negocio);
    });
  });

  const operaciones = Array.from(mejorPorCliente.entries()).map(([clienteId, negocio]) => ({
    updateOne: {
      filter: { _id: clienteId },
      update: { $set: { negocioId: negocio._id } },
    },
  }));
  if (operaciones.length) {
    const resultado = await Client.bulkWrite(operaciones, { ordered: false });
    console.log(`[Negocios] Cliente.negocioId reapuntado: ${resultado.modifiedCount || 0} cliente(s).`);
  }

  // ── 4) Índices únicos parciales ───────────────────────────────────────
  try {
    await Business.createIndexes();
    console.log('[Negocios] Índices verificados (cliente único por negocio activo).');
  } catch (error) {
    console.error('[Negocios] NO se pudieron crear los índices únicos:', error.message);
    console.error('  Revisa que no queden clientes con dos negocios activos y vuelve a ejecutar.');
    await conn.close();
    return false;
  }

  const total = await Business.countDocuments({});
  console.log(`[Negocios] Listo. Negocios en la base: ${total}.`);
  await conn.close();
  return true;
}

if (require.main === module) {
  migrar()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((error) => {
      console.error('[Negocios] Error:', error.message);
      process.exit(1);
    });
}

module.exports = { migrar };