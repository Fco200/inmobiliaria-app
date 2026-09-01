'use strict';

// Controller de configuración global del mantenimiento (capa pública/API).
// Exposición:
//   GET  /api/config/mantenimiento  → estado (público, nunca bloqueado por el
//                                      middleware de mantenimiento).
//   POST /api/config/mantenimiento  → escrito por admin/gerencia/superadmin para
//                                      programar o activar mantenimiento.

const asyncHandler = require('../middlewares/asyncHandler');
const maintenanceService = require('../services/maintenance.service');
const maintenanceJob = require('../jobs/maintenance.job');
const logger = require('../services/logger.service');

// Construye la respuesta pública normalizada con el esquema solicitado y
// valores derivados para el frontend (cuentaRegresiva, programado, activo).
function publicPayload(state) {
  const ahora = new Date();
  const now = ahora.getTime();

  const fechaProgramada = state.fechaProgramada;
  const finCuenta = state.finCuentaRegresiva;
  const finTime = finCuenta ? new Date(finCuenta).getTime() : null;

  // Segundos restantes de la ventana de gracia (cuenta regresiva en vivo).
  let cuentaRegresiva = null;
  if (state.enCuentaRegresiva && finTime !== null) {
    cuentaRegresiva = Math.max(0, Math.ceil((finTime - now) / 1000));
  }

  // Mantenimiento programado a futuro (aviso previo).
  const programado = Boolean(fechaProgramada) && !state.mantenimientoActivo;

  return {
    mantenimientoActivo: state.mantenimientoActivo,
    activo: state.mantenimientoActivo,
    fechaProgramada,
    mensaje: state.mensaje,
    mostrarAvisoPrevio: state.mostrarAvisoPrevio,
    enCuentaRegresiva: state.enCuentaRegresiva,
    finCuentaRegresiva: state.enCuentaRegresiva ? finCuenta : null,
    cuentaRegresiva,
    programado,
    serverTime: ahora.toISOString(),
  };
}

// GET público: estado del mantenimiento.
const getMantenimientoPublico = asyncHandler(async (req, res) => {
  const state = await maintenanceService.getState();
  res.json({ success: true, data: publicPayload(state) });
});

// POST protegido: programa/actualiza/activa/desactiva el mantenimiento.
// Body: { activo, inmediato, mensaje, fechaProgramada, mostrarAvisoPrevio }
//   - `inmediato: true`  → inicia la ventana de gracia de 5 min (cuenta regresiva)
//                           sin bloquear de golpe, y guarda el mensaje exacto.
//   - `activo: true` sin `inmediato` → activa el bloqueo duro al instante.
//   - `inmediato: false`/omitido con `activo:false` → guarda la configuración
//                           (mensaje + programación) sin activar nada.
const setMantenimiento = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const inmediato = body.inmediato === true || body.inmediato === 'true';

  let state;
  if (inmediato) {
    // Ventana de gracia: cuenta regresiva de 5 min. Si no se indica un mensaje,
    // se conserva el que ya estuviera configurado.
    let msg = body.mensaje;
    if (msg === undefined) {
      const cur = await maintenanceService.getState();
      msg = cur.mensaje;
    }
    state = await maintenanceService.startCountdown(msg, req.user._id);
    // Aplicar programación/aviso si vinieron.
    if (body.fechaProgramada !== undefined || body.mostrarAvisoPrevio !== undefined) {
      state = await maintenanceService.saveState(
        {
          fechaProgramada: body.fechaProgramada !== undefined ? body.fechaProgramada : undefined,
          mostrarAvisoPrevio: body.mostrarAvisoPrevio !== undefined ? body.mostrarAvisoPrevio : undefined,
        },
        req.user._id
      );
    }
  } else if (body.activo === true || body.activo === 'true') {
    // Activación inmediatamente dura (bloqueo al instante).
    state = await maintenanceService.activate(req.user._id);
    const extra = {};
    if (body.mensaje !== undefined) extra.mensaje = body.mensaje;
    if (body.fechaProgramada !== undefined) extra.fechaProgramada = body.fechaProgramada;
    if (body.mostrarAvisoPrevio !== undefined) extra.mostrarAvisoPrevio = body.mostrarAvisoPrevio;
    if (Object.keys(extra).length) {
      state = await maintenanceService.saveState(extra, req.user._id);
    }
  } else if (body.activo === false || body.activo === 'false') {
    // Desactivación completa (por si se desactiva el interruptor).
    if (body.mensaje === undefined && body.fechaProgramada === undefined && body.mostrarAvisoPrevio === undefined) {
      state = await maintenanceService.disable(req.user._id);
    } else {
      state = await maintenanceService.saveState(
        {
          activo: false,
          mensaje: body.mensaje !== undefined ? body.mensaje : undefined,
          fechaProgramada: body.fechaProgramada !== undefined ? body.fechaProgramada : undefined,
          mostrarAvisoPrevio: body.mostrarAvisoPrevio !== undefined ? body.mostrarAvisoPrevio : undefined,
        },
        req.user._id
      );
    }
  } else {
    // Solo guardar programación/mensaje sin tocar el estado de bloqueo.
    state = await maintenanceService.saveState(
      {
        mensaje: body.mensaje !== undefined ? body.mensaje : undefined,
        fechaProgramada: body.fechaProgramada !== undefined ? body.fechaProgramada : undefined,
        mostrarAvisoPrevio: body.mostrarAvisoPrevio !== undefined ? body.mostrarAvisoPrevio : undefined,
      },
      req.user._id
    );
  }

  // Emite eventos Socket.io según la transición de estado.
  if (inmediato || (state.mantenimientoActivo && body.activo)) {
    if (inmediato) {
      maintenanceJob.emit('mantenimiento-countdown', {
        mensaje: state.mensaje,
        finCuentaRegresiva: state.finCuentaRegresiva,
      });
    }
    if (state.mantenimientoActivo) {
      maintenanceJob.emit('mantenimiento-iniciado', {
        mensaje: state.mensaje,
        fechaProgramada: state.fechaProgramada,
      });
    }
  } else if (state.mantenimientoActivo === false && (state.enCuentaRegresiva === false) && (body.activo === false || body.activo === 'false')) {
    maintenanceJob.emit('mantenimiento-desactivado', { mensaje: state.mensaje });
  }

  logger.warn(`Mantenimiento actualizado vía /api/config/mantenimiento por ${req.user.email || req.user.username}`, {
    por: req.user.email || req.user.username,
    mantenimientoActivo: state.mantenimientoActivo,
    enCuentaRegresiva: state.enCuentaRegresiva,
    finCuentaRegresiva: state.finCuentaRegresiva,
    mensaje: state.mensaje,
    fechaProgramada: state.fechaProgramada,
    mostrarAvisoPrevio: state.mostrarAvisoPrevio,
    inmediato,
  }, 'mantenimiento');

  res.json({
    success: true,
    message: 'Configuración de mantenimiento guardada',
    data: publicPayload(state),
  });
});

module.exports = {
  getMantenimientoPublico,
  setMantenimiento,
  publicPayload,
};
