'use strict';

// Migración SEGUIMIENTO (Perfilado → Seguimiento).
//
// Qué hace:
//  1. Los clientes que estaban en la etapa "PERFILADO" pasan a "SEGUIMIENTO"
//     ("Seguimiento" es ahora la etapa que aparece después de la cita).
//  2. `funnelStage` se re-sincroniza con la etapa canónica.
//  3. Completa la operación de los clientes que solo tienen el campo legado
//     `type`: comprar -> Comprar | vendedor -> Vender | rentar -> Rentar |
//     alquilar -> Alquilar.
//  4. Pasa la forma de pago "Efectivo" a "Contado" (esa opción se retiró del
//     formulario).
//
// Es IDEMPOTENTE: se puede ejecutar las veces que haga falta y no toca los
// clientes que ya están migrados.
//
// Uso:  npm run migrate:seguimiento
//   o: node scripts/migrar-clientes-seguimiento.js

const connectDB = require('../src/config/db');
const { Client } = require('../src/models');

// ⚠️ PRECAUCIÓN: la etapa PERFILADO volvió a ser una etapa plena del embudo
// (se recorre antes de la cita). Esta migración convertiría a SEGUIMIENTO los
// clientes que hoy están en PERFILADO a propósito, así que ahora exige una
// confirmación explícita y por defecto no hace nada.
// PowerShell:  $env:CONFIRMAR_MIGRACION_PERFILADO='1'; node scripts/migrar-clientes-seguimiento.js
// bash:        CONFIRMAR_MIGRACION_PERFILADO=1 node scripts/migrar-clientes-seguimiento.js
if (process.env.CONFIRMAR_MIGRACION_PERFILADO !== '1') {
  console.log('[Migración] Detenida: la etapa PERFILADO ya es válida de nuevo en el embudo.');
  console.log('[Migración] Si de verdad quieres convertir PERFILADO -> SEGUIMIENTO, vuelve a');
  console.log('[Migración] ejecutar el script con CONFIRMAR_MIGRACION_PERFILADO=1.');
  process.exit(0);
}

// El campo legado `type` se escribía con dos grafías según el origen
// ("comprador" en la migración antigua, "comprar" en el enum del modelo),
// por eso se aceptan ambas.
const LEGADO_A_SERVICIO = {
  comprar: 'Comprar',
  comprador: 'Comprar',
  vender: 'Vender',
  vendedor: 'Vender',
  rentar: 'Rentar',
  alquilar: 'Alquilar',
};

const STAGE_TO_FUNNEL = {
  PROSPECTO: 'prospecto',
  SEGUIMIENTO: 'contacto',
  CITA: 'cita',
  NEGOCIACION_CIERRE: 'negociacion',
  POSTVENTA: 'postventa',
  DESCARTADO: 'descartado',
};

// Convierte { a: 1, b: 2 } en las ramas de un $switch de agregación.
function switchExpression(mapa, defaultExpression) {
  return {
    $switch: {
      branches: Object.entries(mapa).map(([valor, resultado]) => ({
        case: { $eq: ['$etapaActual', valor] },
        then: resultado,
      })),
      default: defaultExpression,
    },
  };
}

// Reescribe un campo de cada elemento de historialEtapas cuando vale
// 'PERFILADO'. El operador posicional $[] no es válido dentro del $set de una
// actualización con pipeline, por eso se usa $map + $mergeObjects.
function reescribirHistorial(campo) {
  return {
    $set: {
      historialEtapas: {
        $map: {
          input: { $ifNull: ['$historialEtapas', []] },
          as: 'h',
          in: {
            $mergeObjects: [
              '$$h',
              {
                [campo]: {
                  $cond: [{ $eq: [`$$h.${campo}`, 'PERFILADO'] }, 'SEGUIMIENTO', `$$h.${campo}`],
                },
              },
            ],
          },
        },
      },
    },
  };
}

async function migrar() {
  const conn = await connectDB();
  if (!conn) {
    console.error('No hay conexión con MongoDB: no se pudo ejecutar la migración.');
    return false;
  }

  // 1) Perfilado -> Seguimiento (etapa actual y bitácora).
  const etapas = await Client.updateMany(
    { etapaActual: 'PERFILADO' },
    [{ $set: { etapaActual: 'SEGUIMIENTO' } }]
  );
  console.log(`[Migración] Etapa Perfilado -> Seguimiento: ${etapas.modifiedCount || 0} cliente(s).`);

  const historialAnterior = await Client.updateMany(
    { 'historialEtapas.etapaAnterior': 'PERFILADO' },
    [reescribirHistorial('etapaAnterior')]
  );
  console.log(`[Migración] Bitácora (etapa anterior): ${historialAnterior.modifiedCount || 0} cliente(s).`);

  const historialNueva = await Client.updateMany(
    { 'historialEtapas.etapaNueva': 'PERFILADO' },
    [reescribirHistorial('etapaNueva')]
  );
  console.log(`[Migración] Bitácora (etapa nueva): ${historialNueva.modifiedCount || 0} cliente(s).`);

  // 2) funnelStage coherente con la etapa canónica.
  const funnel = await Client.updateMany(
    { etapaActual: { $in: Object.keys(STAGE_TO_FUNNEL) } },
    [{ $set: { funnelStage: switchExpression(STAGE_TO_FUNNEL, '$funnelStage') } }]
  );
  console.log(`[Migración] funnelStage sincronizado: ${funnel.modifiedCount || 0} cliente(s).`);

  // 3) Operación a partir del campo legado `type`.
  const operaciones = await Client.updateMany(
    {
      $or: [{ servicio: { $in: ['', null] } }, { servicio: { $exists: false } }],
      type: { $in: Object.keys(LEGADO_A_SERVICIO) },
    },
    [{
      $set: {
        servicio: {
          $switch: {
            branches: Object.entries(LEGADO_A_SERVICIO).map(([legacy, servicio]) => ({
              case: { $eq: ['$type', legacy] },
              then: servicio,
            })),
            default: '$servicio',
          },
        },
      },
    }]
  );
  console.log(`[Migración] Operación completada desde el campo legado: ${operaciones.modifiedCount || 0} cliente(s).`);

  // 4) "Efectivo" ya no es una forma de pago válida del formulario.
  const pagos = await Client.updateMany(
    { formaPago: /^efectivo$/i },
    [{ $set: { formaPago: 'Contado' } }]
  );
  console.log(`[Migración] Forma de pago "Efectivo" -> "Contado": ${pagos.modifiedCount || 0} cliente(s).`);

  const total = await Client.countDocuments({});
  console.log(`[Migración] Listo. Clientes en la base: ${total}.`);
  return true;
}

if (require.main === module) {
  migrar()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((error) => {
      console.error('[Migración] Error:', error.message);
      process.exit(1);
    });
}

module.exports = { migrar };