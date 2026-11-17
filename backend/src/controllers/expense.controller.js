'use strict';

const buildCrud = require('../utils/crud');
const asyncHandler = require('../middlewares/asyncHandler');
const { isBoss, isCustomRole, hasPermission } = require('../utils/scope');
const { toCsv, sendCsv } = require('../utils/csv');
const { Expense } = require('../models');

const expenseCrud = buildCrud(Expense, {
  populate: ['user', 'business'],
  searchFields: ['concept', 'activity', 'observations'],
  ownerField: 'user',
  widePermission: 'expenses_manage',
  // La barra de filtros permite acotar por negocio, categoría y fechas.
  extraFilters: { business: 'business', category: 'category' },
  dateField: 'date',
});

function seesAllExpenses(req) {
  return isBoss(req) || (isCustomRole(req) && hasPermission(req, 'expenses_manage'));
}

// Exporta los gastos a CSV con el mismo alcance del listado.
const exportCsv = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.business) filter.business = req.query.business;
  if (req.query.category) filter.category = req.query.category;
  if (!seesAllExpenses(req)) {
    filter.user = req.user._id;
  } else if (req.query.user) {
    filter.user = req.query.user;
  }
  // Mismos filtros de fecha/búsqueda que el listado: la "relación de gastos"
  // exportada debe coincidir con lo que el usuario ve en pantalla.
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.dateFrom || '') ? new Date(`${req.query.dateFrom}T00:00:00`) : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.dateTo || '') ? new Date(`${req.query.dateTo}T23:59:59.999`) : null;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }
  const term = String(req.query.q || '').trim();
  if (term) {
    const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = ['concept', 'activity', 'observations'].map((field) => ({
      [field]: { $regex: safe, $options: 'i' },
    }));
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
