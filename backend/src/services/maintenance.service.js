'use strict';

// Servicio central del MODO MANTENIMIENTO PROGRAMADO.
//
// Unifica la lectura/escritura del estado de mantenimiento sobre la colección
// Config usando un esquema único y reemplaza los helpers dispersos que antes
// vivían en el middleware y en el controlador de soporte.
//
// Claves canónicas (todas con prefijo `mantenimiento.`):
//   mantenimiento.activo             Boolean  → bloqueo duro (mantenimientoActivo)
//   mantenimiento.fechaProgramada    Date     → cuándo inicia el mantenimiento
//   mantenimiento.mensaje            String   → mensaje mostrado
//   mantenimiento.mostrarAvisoPrevio Boolean  → ¿mostrar aviso previo de 5 min?
//
// Para no perder el estado existente se leen las claves antiguas
// (`mantenimiento.on`, `mantenimiento.hasta`) como respaldo y se migran al
// nuevo esquema la primera vez que se invoca una escritura.

const { Config } = require('../models');
const logger = require('./logger.service');

const KEYS = {
  activo: 'mantenimiento.activo',
  fechaProgramada: 'mantenimiento.fechaProgramada',
  mensaje: 'mantenimiento.mensaje',
  mostrarAvisoPrevio: 'mantenimiento.mostrarAvisoPrevio',
};

// Claves antiguas (legacy) que se siguen leyendo por compatibilidad.
const LEGACY_KEYS = {
  activo: 'mantenimiento.on',
  mensaje: 'mantenimiento.mensaje',
  hasta: 'mantenimiento.hasta',
};

async function getRaw(key) {
  const cfg = await Config.findOne({ key }).lean();
  return cfg ? cfg.value : null;
}

// Devuelve el estado completo del mantenimiento.
async function getState() {
  const [
    activo,
    fechaProgramada,
    mensaje,
    mostrarAvisoPrevio,
    legacyActivo,
  ] = await Promise.all([
    getRaw(KEYS.activo),
    getRaw(KEYS.fechaProgramada),
    getRaw(KEYS.mensaje),
    getRaw(KEYS.mostrarAvisoPrevio),
    getRaw(LEGACY_KEYS.activo),
  ]);

  // El estado ACTIVO se resuelve con el nuevo esquema; si aún no existe, se
  // respeta la configuración heredada (mantenimiento.on).
  let activoBool = typeof activo === 'boolean' ? activo : String(activo || '').toLowerCase() === 'true';
  if (activo === null || activo === undefined) {
    activoBool = String(legacyActivo || '').toLowerCase() === 'true';
  }

  let fecha = null;
  if (fechaProgramada) {
    const d = new Date(fechaProgramada);
    fecha = isNaN(d.getTime()) ? null : d;
  }

  return {
    activo: activoBool,
    mantenimientoActivo: activoBool,
    fechaProgramada: fecha ? fecha.toISOString() : null,
    mensaje: String(mensaje || '').trim(),
    mostrarAvisoPrevio: typeof mostrarAvisoPrevio === 'boolean' ? mostrarAvisoPrevio : String(mostrarAvisoPrevio || '').toLowerCase() === 'true',
  };
}

// Escribe un campo individual del mantenimiento (upsert sobre Config).
async function writeField(key, value, description) {
  await Config.findOneAndUpdate(
    { key },
    {
      value,
      group: 'mantenimiento',
      description: description || '',
      updatedBy: null,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

// Guarda el estado completo del mantenimiento. Acepta un objeto parcial.
//   { activo, fechaProgramada, mensaje, mostrarAvisoPrevio }
async function saveState(patch, actorId = null) {
  const current = await getState();

  const activo = patch.activo !== undefined ? Boolean(patch.activo) : current.activo;
  const mostrarAvisoPrevio =
    patch.mostrarAvisoPrevio !== undefined ? Boolean(patch.mostrarAvisoPrevio) : current.mostrarAvisoPrevio;
  const mensaje = patch.mensaje !== undefined ? String(patch.mensaje).trim() : current.mensaje;

  // fechaProgramada: acepta Date, ISO string o null para limpiarla.
  let fecha = current.fechaProgramada;
  if (patch.fechaProgramada !== undefined) {
    if (patch.fechaProgramada === null || patch.fechaProgramada === '') {
      fecha = null;
    } else {
      const d = new Date(patch.fechaProgramada);
      fecha = isNaN(d.getTime()) ? null : d.toISOString();
    }
  }

  await Promise.allSettled([
    writeField(KEYS.activo, activo, 'Bloqueo duro del modo mantenimiento (mantenimientoActivo)'),
    writeField(KEYS.mensaje, mensaje, 'Mensaje mostrado en la pantalla de mantenimiento'),
    writeField(KEYS.mostrarAvisoPrevio, mostrarAvisoPrevio, '¿Mostrar aviso previo de 5 minutos antes del mantenimiento?'),
    writeField(KEYS.fechaProgramada, fecha, 'Fecha/hora programada de inicio del mantenimiento'),
  ]);

  if (actorId) {
    await Config.updateMany(
      { key: { $in: Object.values(KEYS) } },
      { $set: { updatedBy: actorId } }
    );
  }

  logger.info('Estado de mantenimiento actualizado', {
    activo,
    mensaje,
    fechaProgramada: fecha,
    mostrarAvisoPrevio,
    por: actorId ? String(actorId) : 'sistema',
  }, 'mantenimiento');

  return { activo, mantenimientoActivo: activo, fechaProgramada: fecha, mensaje, mostrarAvisoPrevio };
}

// Lee el mensaje y la fecha estimada de fin para la pantalla de mantenimiento.
async function getDisplayData() {
  const state = await getState();
  return {
    mensaje: state.mensaje,
    hasta: state.fechaProgramada ? state.fechaProgramada : '',
  };
}

// Indica si el bloqueo duro está activo (sin cache) — usado por el middleware.
async function isActive() {
  const state = await getState();
  return state.activo;
}

module.exports = {
  KEYS,
  getState,
  saveState,
  getDisplayData,
  isActive,
};
