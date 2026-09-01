'use strict';

// Controller de configuración global del mantenimiento (capa pública/API).
// Exposición:
//   GET  /api/config/mantenimiento  → estado (público, para que el CRM sepa si
//                                      hay un mantenimiento activo o programado).
//   POST /api/config/mantenimiento  → escrito por admin/gerencia/superadmin para
//                                      programar o activar mantenimiento.

const asyncHandler = require('../middlewares/asyncHandler');
const maintenanceService = require('../services/maintenance.service');
const maintenanceJob = require('../jobs/maintenance.job');
const logger = require('../services/logger.service');

// GET público: estado del mantenimiento (activo/programado/aviso previo/mensaje).
const getMantenimientoPublico = asyncHandler(async (req, res) => {
  const state = await maintenanceService.getState();
  const ahora = new Date();
  const programado = Boolean(state.fechaProgramada) && !state.activo;
  let cuentaRegresiva = null;
  if (programado && state.mostrarAvisoPrevio && state.fechaProgramada) {
    const diff = new Date(state.fechaProgramada).getTime() - ahora.getTime();
    cuentaRegresiva = Math.max(0, Math.ceil(diff / 1000));
  }

  res.json({
    success: true,
    data: {
      activo: state.activo,
      mantenimientoActivo: state.mantenimientoActivo,
      mensaje: state.mensaje,
      fechaProgramada: state.fechaProgramada,
      mostrarAvisoPrevio: state.mostrarAvisoPrevio,
      programado,
      cuentaRegresiva,
    },
  });
});

// POST protegido: programa/actualiza/activa/desactiva el mantenimiento.
// Body: { activo, mensaje, fechaProgramada, mostrarAvisoPrevio }
const setMantenimiento = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const state = await maintenanceService.saveState(
    {
      activo: body.activo !== undefined ? body.activo : undefined,
      mensaje: body.mensaje !== undefined ? body.mensaje : undefined,
      fechaProgramada: body.fechaProgramada !== undefined ? body.fechaProgramada : undefined,
      mostrarAvisoPrevio: body.mostrarAvisoPrevio !== undefined ? body.mostrarAvisoPrevio : undefined,
    },
    req.user._id
  );

  maintenanceJob.emit(
    state.activo ? 'mantenimiento-iniciado' : 'mantenimiento-desactivado',
    {
      mensaje: state.mensaje,
      fechaProgramada: state.fechaProgramada,
    }
  );

  logger.warn(`Mantenimiento actualizado vía /api/config/mantenimiento por ${req.user.email || req.user.username}`, {
    por: req.user.email || req.user.username,
    activo: state.activo,
    mensaje: state.mensaje,
    fechaProgramada: state.fechaProgramada,
    mostrarAvisoPrevio: state.mostrarAvisoPrevio,
  }, 'mantenimiento');

  res.json({
    success: true,
    message: 'Configuración de mantenimiento guardada',
    data: {
      activo: state.activo,
      mantenimientoActivo: state.activo,
      mensaje: state.mensaje,
      fechaProgramada: state.fechaProgramada,
      mostrarAvisoPrevio: state.mostrarAvisoPrevio,
      programado: Boolean(state.fechaProgramada) && !state.activo,
    },
  });
});

module.exports = {
  getMantenimientoPublico,
  setMantenimiento,
};
