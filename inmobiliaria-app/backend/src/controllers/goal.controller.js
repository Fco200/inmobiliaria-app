'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const buildCrud = require('../utils/crud');
const { isBoss } = require('../utils/scope');
const { Goal } = require('../models');
const { updateGoalsAuto } = require('../services/goal-auto.service');

const goalCrud = buildCrud(Goal, {
  populate: ['user'],
  searchFields: ['name', 'description'],
  ownerField: 'user',
});

const list = asyncHandler(async (req, res) => {
  await updateGoalsAuto();

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 25);
  const filter = {};

  if (req.query.q) {
    filter.$or = [
      { name: { $regex: req.query.q, $options: 'i' } },
      { description: { $regex: req.query.q, $options: 'i' } },
    ];
  }
  if (req.query.status) filter.status = req.query.status;

  // admin/gerencia ven todas las metas (filtro opcional ?user=);
  // cada asesor solo ve las suyas.
  if (!isBoss(req)) {
    filter.user = req.user._id;
  } else if (req.query.user) {
    filter.user = req.query.user;
  }

  const query = Goal.find(filter).populate('user');
  const [total, items] = await Promise.all([
    Goal.countDocuments(filter),
    query.skip((page - 1) * limit).limit(limit).sort({ createdAt: -1 }),
  ]);

  res.json({
    success: true,
    data: items,
    meta: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

const syncAuto = asyncHandler(async (req, res) => {
  const updated = await updateGoalsAuto();
  res.json({ success: true, message: 'Metas actualizadas automáticamente con los ingresos.', data: { updated } });
});

module.exports = {
  list,
  get: goalCrud.get,
  create: goalCrud.create,
  update: goalCrud.update,
  remove: goalCrud.remove,
  syncAuto,
};
