'use strict';

const buildCrud = require('../utils/crud');
const asyncHandler = require('../middlewares/asyncHandler');
const { isBoss } = require('../utils/scope');
const { toCsv, sendCsv } = require('../utils/csv');
const { Expense } = require('../models');

const expenseCrud = buildCrud(Expense, {
  populate: ['user', 'business'],
  searchFields: ['concept', 'activity', 'observations'],
  ownerField: 'user',
  // La barra de filtros permite acotar por negocio y por categoría.
  extraFilters: { business: 'business', category: 'category' },
});

// Exporta los gastos a CSV con el mismo alcance del listado.
const exportCsv = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.business) filter.business = req.query.business;
  if (req.query.category) filter.category = req.query.category;
  if (!isBoss(req)) {
    filter.user = req.user._id;
  } else if (req.query.user) {
    filter.user = req.query.user;
  }

  const items = await Expense.find(filter)
    .populate('user', 'name')
    .populate('business', 'name')
    .sort({ createdAt: -1 })
    .limit(5000);

  const rows = items.map((e) => ({
    fecha: e.date ? new Date(e.date).toISOString() : '',
    concepto: e.concept || '',
    actividad: e.activity || '',
    categoria: e.category || '',
    monto: Number(e.amount) || 0,
    negocio: (e.business && e.business.name) || '',
    observaciones: e.observations || '',
    usuario: (e.user && e.user.name) || '',
  }));

  sendCsv(res, 'gastos.csv', toCsv(rows, [
    { key: 'fecha', label: 'Fecha' },
    { key: 'usuario', label: 'Usuario' },
    { key: 'concepto', label: 'Concepto' },
    { key: 'actividad', label: 'Actividad' },
    { key: 'categoria', label: 'Categoría' },
    { key: 'monto', label: 'Monto' },
    { key: 'negocio', label: 'Negocio' },
    { key: 'observaciones', label: 'Observaciones' },
  ]));
});

module.exports = {
  list: expenseCrud.list,
  get: expenseCrud.get,
  create: expenseCrud.create,
  update: expenseCrud.update,
  remove: expenseCrud.remove,
  exportCsv,
};
