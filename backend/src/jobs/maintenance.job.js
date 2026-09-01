'use strict';

// Job de MANTENIMIENTO PROGRAMADO.
//
// Comprueba periódicamente el estado del mantenimiento y resuelve las
// transiciones de fase disparando los eventos Socket.io correspondientes:
//
//   mantenimiento-alerta         → aviso previo a los clientes conectados cuando
//                                   hay un mantenimiento programado a futuro con
//                                   `mostrarAvisoPrevio` (los asesores ven un banner).
//
//   mantenimiento-countdown      → se emite cuando la ventana de gracia de 5 min
//                                   (enCuentaRegresiva) está activa; los clientes
//                                   sincronizan su cuenta regresiva con finCuentaRegresiva.
//
//   mantenimiento-iniciado       → cuando la cuenta regresiva expiró o llegó la
//                                   fecha programada: se activa el bloqueo duro.
//                                   Los Asesores/Operadores hacen auto-logout.
//
//   mantenimiento-desactivado    → se emite cuando se apaga el modo.

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
    const now = Date.now();

    // 1) Cuenta regresiva expirada → activa el bloqueo duro.
    if (
      state.enCuentaRegresiva &&
      state.finCuentaRegresiva &&
      new Date(state.finCuentaRegresiva).getTime() <= now &&
      !state.mantenimientoActivo
    ) {
      logger.warn('Cuenta regresiva de mantenimiento expirada; activando bloqueo duro', {
        finCuentaRegresiva: state.finCuentaRegresiva,
        mensaje: state.mensaje,
      }, 'mantenimiento');
      emit('mantenimiento-countdown', {
        mensaje: state.mensaje,
        finCuentaRegresiva: state.finCuentaRegresiva,
        fin: true,
      });
      const activated = await maintenanceService.activate();
      emit('mantenimiento-iniciado', {
        mensaje: activated.mensaje,
        fechaProgramada: activated.fechaProgramada,
      });
      return;
    }

    // 2) Cuenta regresiva activa (aún no expira) → avisar para sincronizar.
    if (state.enCuentaRegresiva && state.finCuentaRegresiva) {
      const diff = new Date(state.finCuentaRegresiva).getTime() - now;
      if (diff > 0) {
        emit('mantenimiento-countdown', {
          mensaje: state.mensaje,
          finCuentaRegresiva: state.finCuentaRegresiva,
          segundos: Math.ceil(diff / 1000),
        });
      }
      return;
    }

    // 3) Mantenimiento programado a futuro.
    if (state.fechaProgramada) {
      const target = new Date(state.fechaProgramada);
      const diff = target.getTime() - now;

      // Aviso previo (banner) cuando está cerca y hay aviso habilitado.
      if (state.mostrarAvisoPrevio && !state.mantenimientoActivo && diff <= ALERT_WINDOW_MS && diff >= 0) {
        emit('mantenimiento-alerta', {
          mensaje: state.mensaje,
          fechaProgramada: target.toISOString(),
          segundos: Math.ceil(diff / 1000),
        });
      }

      // Llegó la hora programada → inicia la ventana de gracia o activa directo.
      if (diff <= 0 && !state.mantenimientoActivo) {
        if (state.mostrarAvisoPrevio) {
          logger.warn('Fecha programada alcanzada; iniciando cuenta regresiva (aviso previo)', {
            fechaProgramada: target.toISOString(),
            mensaje: state.mensaje,
          }, 'mantenimiento');
          const count = await maintenanceService.startCountdown(state.mensaje);
          emit('mantenimiento-countdown', {
            mensaje: count.mensaje,
            finCuentaRegresiva: count.finCuentaRegresiva,
          });
        } else {
          logger.warn('Fecha programada alcanzada; activando mantenimiento', {
            fechaProgramada: target.toISOString(),
            mensaje: state.mensaje,
          }, 'mantenimiento');
          const activated = await maintenanceService.activate();
          emit('mantenimiento-iniciado', {
            mensaje: activated.mensaje,
            fechaProgramada: activated.fechaProgramada,
          });
        }
      }
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
