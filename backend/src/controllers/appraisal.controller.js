'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const { Appraisal } = require('../models');
const { isBoss, hasRole, isCustomRole, hasPermission } = require('../utils/scope');

// Quién puede crear, editar, eliminar y marcar checklist. Los asesores solo ven.
const APPRAISAL_MANAGER_ROLES = ['admin', 'gerencia', 'asistencia', 'escrituracion'];

function canManageAppraisals(req) {
  return isBoss(req)
    || hasRole(req, APPRAISAL_MANAGER_ROLES)
    || (isCustomRole(req) && hasPermission(req, 'appraisals_manage'));
}

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nonEmpty = (value) => value !== undefined && value !== null && String(value).trim() !== '';

const PROPERTY_FIELDS = 'folio type operationType zone city address status';
const EDITABLE = ['property', 'business', 'appraisalDate', 'appraiser', 'appraiserCP', 'constructionM2', 'landM2', 'concludedValue', 'notes'];

function buildFilter(query) {
  const filter = {};
  if (nonEmpty(query.property)) filter.property = query.property;
  if (nonEmpty(query.business)) filter.business = query.business;
  if (nonEmpty(query.appraiser)) filter.appraiser = { $regex: escapeRegex(query.appraiser.trim()), $options: 'i' };
  if (nonEmpty(query.appraiserCP)) filter.appraiserCP = { $regex: escapeRegex(query.appraiserCP.trim()), $options: 'i' };
  if (nonEmpty(query.q)) {
    const term = escapeRegex(String(query.q).trim());
    filter.$or = [
      { appraiser: { $regex: term, $options: 'i' } },
      { appraiserCP: { $regex: term, $options: 'i' } },
      { notes: { $regex: term, $options: 'i' } },
    ];
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.dateFrom || '')) {
    filter.appraisalDate = { ...(filter.appraisalDate || {}), $gte: new Date(`${query.dateFrom}T00:00:00`) };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.dateTo || '')) {
    filter.appraisalDate = { ...(filter.appraisalDate || {}), $lte: new Date(`${query.dateTo}T23:59:59.999`) };
  }
  const ranges = [
    ['minValue', 'maxValue', 'concludedValue'],
    ['minConstruction', 'maxConstruction', 'constructionM2'],
    ['minLand', 'maxLand', 'landM2'],
  ];
  ranges.forEach(([minKey, maxKey, field]) => {
    const min = parseFloat(query[minKey]);
    const max = parseFloat(query[maxKey]);
    const range = {};
    if (Number.isFinite(min)) range.$gte = min;
    if (Number.isFinite(max)) range.$lte = max;
    if (Object.keys(range).length) filter[field] = range;
  });
  return filter;
}

// GET /api/avaluos — lo ven todos los usuarios autenticados.
const list = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 15);
  const filter = buildFilter(req.query);
  const [total, items] = await Promise.all([
    Appraisal.countDocuments(filter),
    Appraisal.find(filter)
      .select('-bitacora')
      .populate('property', PROPERTY_FIELDS)
      .sort({ appraisalDate: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);
  res.json({ success: true, data: items, meta: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const get = asyncHandler(async (req, res) => {
  const item = await Appraisal.findById(req.params.id).populate('property', PROPERTY_FIELDS);
  if (!item) return res.status(404).json({ success: false, message: 'Avalúo no encontrado.' });
  res.json({ success: true, data: item });
});

function pickBody(body) {
  const data = {};
  EDITABLE.forEach((key) => {
    if (body[key] !== undefined) data[key] = body[key] === '' ? null : body[key];
  });
  return data;
}

const create = asyncHandler(async (req, res) => {
  const data = pickBody(req.body || {});
  const item = await Appraisal.create({
    ...data,
    createdBy: req.user._id,
    bitacora: [{ user: req.user._id, userName: req.user.name || req.user.username || '', action: 'creacion', message: 'Se registró el avalúo.' }],
  });
  const populated = await item.populate('property', PROPERTY_FIELDS);
  res.status(201).json({ success: true, data: populated });
});

const update = asyncHandler(async (req, res) => {
  const item = await Appraisal.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'Avalúo no encontrado.' });
  const data = pickBody(req.body || {});
  const changed = Object.keys(data).filter((key) => String(item[key] ?? '') !== String(data[key] ?? ''));
  Object.assign(item, data);
  if (changed.length) {
    item.bitacora.push({
      user: req.user._id,
      userName: req.user.name || req.user.username || '',
      action: 'actualizacion',
      message: `Actualizó: ${changed.join(', ')}.`,
    });
  }
  await item.save();
  const populated = await item.populate('property', PROPERTY_FIELDS);
  res.json({ success: true, data: populated });
});

const remove = asyncHandler(async (req, res) => {
  const item = await Appraisal.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'Avalúo no encontrado.' });
  await item.deleteOne();
  res.json({ success: true, message: 'Avalúo eliminado.' });
});

// PUT /api/avaluos/:id/checklist — reemplaza la lista de pendientes.
const saveChecklist = asyncHandler(async (req, res) => {
  const item = await Appraisal.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'Avalúo no encontrado.' });
  const items = Array.isArray(req.body && req.body.checklist) ? req.body.checklist : [];
  item.checklist = items
    .filter((entry) => entry && String(entry.text || '').trim())
    .map((entry) => ({
      text: String(entry.text).trim().slice(0, 240),
      done: Boolean(entry.done),
      createdBy: entry._id ? entry.createdBy || null : req.user._id,
    }));
  await item.save();
  res.json({ success: true, data: item.checklist });
});

// POST /api/avaluos/:id/bitacora — agrega una nota a la bitácora.
const addBitacora = asyncHandler(async (req, res) => {
  const message = String((req.body && req.body.message) || '').trim().slice(0, 500);
  if (!message) return res.status(400).json({ success: false, message: 'Escribe la nota.' });
  const item = await Appraisal.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'Avalúo no encontrado.' });
  item.bitacora.push({
    user: req.user._id,
    userName: req.user.name || req.user.username || '',
    action: 'nota',
    message,
  });
  await item.save();
  res.status(201).json({ success: true, data: item.bitacora });
});

module.exports = { list, get, create, update, remove, saveChecklist, addBitacora, canManageAppraisals };
