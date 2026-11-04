'use strict';

// Servicio central del MODO MANTENIMIENTO PROGRAMADO.
//
// Modelo en DOS FASES para dar a los usuarios tiempo de guardar su trabajo:
//
//   FASE CUENTA REGRESIVA (enCuentaRegresiva=true, mantenimientoActivo=false):
//     - El sistema sigue funcionando (el middleware NO bloquea la API).
//     - Los Asesores/Operadores ven un modal de cuenta regresiva calculado con
//       `finCuentaRegresiva` y la hora actual; al llegar a 00:00 se cierran.
//     - Admin/Superadmin no se interrumpen.
//
//   FASE ACTIVA (mantenimientoActivo=true):
//     - El bloqueo duro se aplica en el middleware: solo Admin y Superadmin
//       siguen accediendo; el resto recibe 503 y la pantalla de mantenimiento.
//     - La cuenta regresiva expira automáticamente a `finCuentaRegresiva`
//       (el job maintenance.job activa la fase ACTIVA al llegar a la hora).
//
// Claves canónicas (colección Config, prefijo `mantenimiento.`):
//   mantenimiento.activo             Boolean  → mantenimientoActivo (bloqueo duro)
//   mantenimiento.fechaProgramada    Date     → fecha/hora programada de INICIO
//   mantenimiento.hasta              Date     → fecha/hora estimada de FIN (auto-desactiva)
//   mantenimiento.mensaje            String   → mensaje personalizado del admin
//   mantenimiento.mostrarAvisoPrevio Boolean  → ¿mostrar aviso previo/banner?
//   mantenimiento.enCuentaRegresiva  Boolean  → ¿la cuenta regresiva de 5 min está activa?
//   mantenimiento.finCuentaRegresiva Date     → timestamp de expiración de los 5 min
//
// Por compatibilidad se sigue leyendo la clave legacy `mantenimiento.on` como
// respaldo de `activo`.

const { Config } = require('../models');
const logger = require('./logger.service');

const GRACE_MS = 5 * 60 * 1000; // ventana de gracia de 5 minutos

const KEYS = {
  activo: 'mantenimiento.activo',
  fechaProgramada: 'mantenimiento.fechaProgramada',
  hasta: 'mantenimiento.hasta',
  mensaje: 'mantenimiento.mensaje',
  mostrarAvisoPrevio: 'mantenimiento.mostrarAvisoPrevio',
  enCuentaRegresiva: 'mantenimiento.enCuentaRegresiva',
  finCuentaRegresiva: 'mantenimiento.finCuentaRegresiva',
};

// Claves antiguas (legacy) que se siguen leyendo por compatibilidad.
const LEGACY_KEYS = {
  activo: 'mantenimiento.on',
};

async function getRaw(key) {
  const cfg = await Config.findOne({ key }).lean();
  return cfg ? cfg.value : null;
}

// Lee el estado completo del mantenimiento.
async function getState() {
  const [
    activo,
    fechaProgramada,
    hasta,
    mensaje,
    mostrarAvisoPrevio,
    enCuentaRegresiva,
    finCuentaRegresiva,
    legacyActivo,
  ] = await Promise.all([
    getRaw(KEYS.activo),
    getRaw(KEYS.fechaProgramada),
    getRaw(KEYS.hasta),
    getRaw(KEYS.mensaje),
    getRaw(KEYS.mostrarAvisoPrevio),
    getRaw(KEYS.enCuentaRegresiva),
    getRaw(KEYS.finCuentaRegresiva),
    getRaw(LEGACY_KEYS.activo),
  ]);

  // Estado ACTIVO: se resuelve con el nuevo esquema; si aún no existe, se
  // respeta la configuración heredada (mantenimiento.on).
  let activoBool = typeof activo === 'boolean' ? activo : String(activo || '').toLowerCase() === 'true';
  if (activo === null || activo === undefined) {
    activoBool = String(legacyActivo || '').toLowerCase() === 'true';
  }

  const toIso = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  };

  const toBool = (v, fallback = false) =>
    typeof v === 'boolean' ? v : (v === null || v === undefined ? fallback : String(v).toLowerCase() === 'true');

  // Si hay cuenta regresiva que ya expiró y el bloqueo no se activó, se calcula
  // el estado como si el mantenimiento ya estuviera activo (ver también el job).
  const fin = toIso(finCuentaRegresiva);
  let enCuenta = toBool(enCuentaRegresiva, false);
  if (enCuenta && fin && new Date(fin).getTime() <= Date.now() && !activoBool) {
    activoBool = true;
    enCuenta = false;
  }

  return {
    activo: activoBool,
    mantenimientoActivo: activoBool,
    fechaProgramada: toIso(fechaProgramada),
    hasta: toIso(hasta),
    mensaje: String(mensaje || '').trim(),
    mostrarAvisoPrevio: toBool(mostrarAvisoPrevio, false),
    enCuentaRegresiva: enCuenta,
    finCuentaRegresiva: enCuenta ? fin : null,
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
//   { activo, fechaProgramada, mensaje, mostrarAvisoPrevio, enCuentaRegresiva, finCuentaRegresiva }
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

  // hasta: fecha/hora estimada de FIN (acepta Date, ISO string o null).
  let hasta = current.hasta;
  if (patch.hasta !== undefined) {
    if (patch.hasta === null || patch.hasta === '') {
      hasta = null;
    } else {
      const d = new Date(patch.hasta);
      hasta = isNaN(d.getTime()) ? null : d.toISOString();
    }
  }

  // enCuentaRegresiva / finCuentaRegresiva (la ventana de gracia de 5 min).
  let enCuenta = current.enCuentaRegresiva;
  let finCuenta = current.finCuentaRegresiva;
  if (patch.enCuentaRegresiva !== undefined) enCuenta = Boolean(patch.enCuentaRegresiva);
  if (patch.finCuentaRegresiva !== undefined) {
    if (patch.finCuentaRegresiva === null || patch.finCuentaRegresiva === '') {
      finCuenta = null;
    } else {
      const d = new Date(patch.finCuentaRegresiva);
      finCuenta = isNaN(d.getTime()) ? null : d.toISOString();
    }
  }
  // Si se desactiva la cuenta regresiva, se limpia su timestamp.
  if (!enCuenta) finCuenta = null;

  await Promise.allSettled([
    writeField(KEYS.activo, activo, 'Bloqueo duro del modo mantenimiento (mantenimientoActivo)'),
    writeField(KEYS.fechaProgramada, fecha, 'Fecha/hora programada de inicio del mantenimiento'),
    writeField(KEYS.hasta, hasta, 'Fecha/hora estimada de fin; al pasar se desactiva el mantenimiento'),
    writeField(KEYS.mensaje, mensaje, 'Mensaje personalizado mostrado en la pantalla de mantenimiento'),
    writeField(KEYS.mostrarAvisoPrevio, mostrarAvisoPrevio, '¿Mostrar aviso previo/banner de mantenimiento programado?'),
    writeField(KEYS.enCuentaRegresiva, enCuenta, '¿La cuenta regresiva de 5 minutos está activa?'),
    writeField(KEYS.finCuentaRegresiva, finCuenta, 'Timestamp de expiración de la ventana de gracia de 5 minutos'),
  ]);

  if (actorId) {
    await Config.updateMany(
      { key: { $in: Object.values(KEYS) } },
      { $set: { updatedBy: actorId } }
    );
  }

  logger.info('Estado de mantenimiento actualizado', {
    mantenimientoActivo: activo,
    enCuentaRegresiva: enCuenta,
    finCuentaRegresiva: finCuenta,
    mensaje,
    fechaProgramada: fecha,
    hasta,
    mostrarAvisoPrevio,
    por: actorId ? String(actorId) : 'sistema',
  }, 'mantenimiento');

  return { activo, mantenimientoActivo: activo, fechaProgramada: fecha, hasta, mensaje, mostrarAvisoPrevio, enCuentaRegresiva: enCuenta, finCuentaRegresiva: finCuenta };
}

// Inicia la cuenta regresiva de 5 minutos (ventana de gracia): deja el bloqueo
// duro apagado para que los asesores puedan guardar su trabajo antes del cierre.
async function startCountdown(mensaje = '', actorId = null) {
  const fin = new Date(Date.now() + GRACE_MS).toISOString();
  return saveState(
    { activo: false, enCuentaRegresiva: true, finCuentaRegresiva: fin, mensaje },
    actorId
  );
}

// Detiene la cuenta regresiva (sin activar el bloqueo).
async function stopCountdown(actorId = null) {
  return saveState({ enCuentaRegresiva: false, finCuentaRegresiva: null }, actorId);
}

// Activa el bloqueo duro y limpia la cuenta regresiva.
async function activate(actorId = null) {
  return saveState({ activo: true, enCuentaRegresiva: false, finCuentaRegresiva: null }, actorId);
}

// Desactiva TODO el mantenimiento (bloqueo + cuenta regresiva + programación).
async function disable(actorId = null) {
  return saveState(
    { activo: false, enCuentaRegresiva: false, finCuentaRegresiva: null, fechaProgramada: null, hasta: null },
    actorId
  );
}

// Lee el mensaje y la fecha estimada de fin para la pantalla de mantenimiento.
async function getDisplayData() {
  const state = await getState();
  return {
    mensaje: state.mensaje,
    hasta: state.hasta ? state.hasta : '',
  };
}

// Indica si el bloqueo duro está activo (sin cache) — usado por el middleware.
async function isActive() {
  const state = await getState();
  return state.mantenimientoActivo;
}

module.exports = {
  KEYS,
  GRACE_MS,
  getState,
  saveState,
  startCountdown,
  stopCountdown,
  activate,
  disable,
  getDisplayData,
  isActive,
};
