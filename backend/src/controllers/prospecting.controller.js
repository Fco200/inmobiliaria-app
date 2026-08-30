'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const buildCrud = require('../utils/crud');
const { ProspectingActivity, Client } = require('../models');
const { logActivity } = require('../services/log.service');

const prospectingCrud = buildCrud(ProspectingActivity, {
  populate: ['user'],
  searchFields: ['location', 'observations'],
  beforeCreate: (body, req) => {
    if (!body.user) body.user = req.user._id;
    return body;
  },
});

const list = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 25);
  const filter = {};

  if (req.query.type) filter.type = req.query.type;
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = new Date(req.query.from);
    if (req.query.to) filter.date.$lte = new Date(req.query.to);
  }

  if (['admin', 'gerencia'].includes(req.user.role.code)) {
    if (req.query.user) filter.user = req.query.user;
  } else {
    filter.user = req.user._id;
  }

  const query = ProspectingActivity.find(filter).populate('user');
  const [total, items] = await Promise.all([
    ProspectingActivity.countDocuments(filter),
    query.skip((page - 1) * limit).limit(limit).sort({ date: -1 }),
  ]);

  res.json({
    success: true,
    data: items,
    meta: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

const create = asyncHandler(async (req, res) => {
  const activity = await ProspectingActivity.create({
    ...req.body,
    user: req.body.user || req.user._id,
  });
  await logActivity({
    entityType: 'ProspectingActivity',
    entityId: activity._id,
    user: req.user._id,
    action: 'creacion',
    message: `Se registró la actividad de prospección (${activity.type})`,
  });
  res.status(201).json({ success: true, data: activity });
});

const get = prospectingCrud.get;
const remove = prospectingCrud.remove;

const update = asyncHandler(async (req, res) => {
  const activity = await ProspectingActivity.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!activity) return res.status(404).json({ success: false, message: 'Actividad no encontrada' });
  res.json({ success: true, data: activity });
});

const summary = asyncHandler(async (req, res) => {
  const user = req.user;
  const filter = {};
  if (!['admin', 'gerencia'].includes(user.role.code)) filter.user = user._id;
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = new Date(req.query.from);
    if (req.query.to) filter.date.$lte = new Date(req.query.to);
  }

  const [activities, funnel] = await Promise.all([
    ProspectingActivity.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$type',
          investment: { $sum: '$investment' },
          prospects: { $sum: '$prospectsObtained' },
          contacts: { $sum: '$contacts' },
          count: { $sum: 1 },
        },
      },
      { $sort: { investment: -1 } },
    ]),
    Client.aggregate([
      {
        $match: {
          ...(filter.user ? { responsibleUser: filter.user } : {}),
          ...(filter.date ? { joinedAt: filter.date } : {}),
        },
      },
      { $group: { _id: '$funnelStage', count: { $sum: 1 } } },
    ]),
  ]);

  const total = activities.reduce(
    (acc, a) => {
      acc.investment += a.investment || 0;
      acc.prospects += a.prospects || 0;
      acc.contacts += a.contacts || 0;
      acc.count += a.count;
      return acc;
    },
    { investment: 0, prospects: 0, contacts: 0, count: 0 }
  );

  const funnelMap = { prospecto: 0, cita: 0, negociacion: 0, promesa: 0, cierre: 0 };
  funnel.forEach((f) => {
    funnelMap[f._id] = f.count;
  });

  res.json({
    success: true,
    data: {
      byType: activities,
      total,
      funnel: funnelMap,
      byStage: funnel,
    },
  });
});

module.exports = { list, get, create, update, remove, summary };
