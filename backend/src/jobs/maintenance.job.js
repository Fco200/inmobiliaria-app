'use strict';

// Job de MANTENIMIENTO PROGRAMADO.
//
// Comprueba cada pocos segundos si hay un mantenimiento programado con
// fechaProgramada a punto de iniciar o ya vencida y, en ese caso, dispara los
// eventos Socket.io correspondientes:
//
//   mantenimiento-alerta   → aviso previo a los clientes conectados cuando el
//                            mantenimiento está próximo (a <= WINDOW_MS de
//                            empezar y si mostrarAvisoPrevio es true). Con esto
//                            elCRM inicia la cuenta regresiva de 5 minutos en
//                            roles Asesor/Operador.
//
//   mantenimiento-iniciado → se emite cuando llega la fechaProgramada y se
//                            activa el bloqueo duro (activo=true). Los clientes
//                            con rol Asesor/Operador hacen auto-logout.
//
// El job también autoprograma la activación: cuando fechaProgramada ya pasó y
// el mantenimiento aún no estaba activo, lo activa automáticamente.

const maintenanceService = require('../services/maintenance.service');
const logger = require('../services/logger.service');

const CHECK_INTERVAL_MS = 15 * 1000; // cada 15 s
const ALERT_WINDOW_MS = 5 * 60 * 1000; // 5 minutos antes del inicio

let timer = null;
let io = null;

function setIo(instance) {
  io = instance;
}

function emit(event, payload) {
  if (!io) return;
  try {
    io.emit(event, payload);
  } catch (e) {
    logger.warn(`No se pudo emitir ${event} por Socket.io`, { error: e.message }, 'mantenimiento');
  }
}

async function runMaintenanceJob() {
  try {
    const state = await maintenanceService.getState();
    if (!state.fechaProgramada) return;

    const target = new Date(state.fechaProgramada);
    const now = Date.now();
    const diff = target.getTime() - now;

    // Aviso previo: dentro de la ventana de alerta y con aviso habilitado.
    if (state.mostrarAvisoPrevio && !state.activo && diff <= ALERT_WINDOW_MS && diff >= 0) {
      emit('mantenimiento-alerta', {
        mensaje: state.mensaje,
        fechaProgramada: target.toISOString(),
        segundos: Math.ceil(diff / 1000),
      });
    }

    // Ya venció la hora programada: activa el bloqueo duro si no estaba activo.
    if (diff <= 0 && !state.activo) {
      logger.warn('Mantenimiento programado activado automáticamente por fechaProgramada', {
        fechaProgramada: target.toISOString(),
        mensaje: state.mensaje,
      }, 'mantenimiento');
      await maintenanceService.saveState({ activo: true });
      emit('mantenimiento-iniciado', {
        mensaje: state.mensaje,
        fechaProgramada: target.toISOString(),
      });
    }
  } catch (e) {
    logger.warn('Error en el job de mantenimiento programado', { error: e.message }, 'mantenimiento');
  }
}

function startMaintenanceJob() {
  if (timer) return;
  timer = setInterval(runMaintenanceJob, CHECK_INTERVAL_MS);
  timer.unref();
  console.log('[Job] Programado: mantenimiento programado.');
}

function stopMaintenanceJob() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  setIo,
  startMaintenanceJob,
  stopMaintenanceJob,
  runMaintenanceJob,
  emit,
};
