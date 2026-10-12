'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const { ActivityLog } = require('../models');
const { toCsv, sendCsv } = require('../utils/csv');
const { isBoss } = require('../utils/scope');

const list = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
  const filter = {};

  if (req.query.entityType) filter.entityType = req.query.entityType;
  if (req.query.entityId) filter.entityId = req.query.entityId;
  if (req.query.user) filter.user = req.query.user;

  const query = ActivityLog.find(filter).populate('user', 'name photo');
  const [total, items] = await Promise.all([
    ActivityLog.countDocuments(filter),
    query.skip((page - 1) * limit).limit(limit).sort({ createdAt: -1 }),
  ]);

  res.json({
    success: true,
    data: items,
    meta: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// Borra el historial de actividad del usuario que lo pide. Solo afecta las
// acciones propias (user = req.user), el registro del resto del equipo queda
// intacto.
const clearMine = asyncHandler(async (req, res) => {
  const result = await ActivityLog.deleteMany({ user: req.user._id });
  res.json({
    success: true,
    message: 'Historial de actividad borrado',
    data: { deleted: result.deletedCount || 0 },
  });
});

// Exporta la actividad a CSV (respetando el alcance del listado: sin filtro de
// usuario extra el asesor solo ve la suya; gerencia puede filtrar por ?user=).
const exportCsv = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.entityType) filter.entityType = req.query.entityType;
  if (req.query.entityId) filter.entityId = req.query.entityId;
  if (!isBoss(req)) {
    filter.user = req.user._id;
  } else if (req.query.user) {
    filter.user = req.query.user;
  }

  const items = await ActivityLog.find(filter)
    .populate('user', 'name username')
    .sort({ createdAt: -1 })
    .limit(5000);

  const rows = items.map((a) => ({
    fecha: a.createdAt ? new Date(a.createdAt).toISOString() : '',
    usuario: (a.user && a.user.name) || (a.user && a.user.username) || '',
    accion: a.action || '',
    entidad: a.entityType || '',
    detalle: a.message || '',
  }));

  sendCsv(res, 'actividad.csv', toCsv(rows, [
    { key: 'fecha', label: 'Fecha' },
    { key: 'usuario', label: 'Usuario' },
    { key: 'accion', label: 'Acción' },
    { key: 'entidad', label: 'Entidad' },
    { key: 'detalle', label: 'Detalle' },
  ]));
});

module.exports = { list, clearMine, exportCsv };
