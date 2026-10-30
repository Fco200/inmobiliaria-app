'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const { Meeting, User } = require('../models');
const { isBoss } = require('../utils/scope');
const { pushNative } = require('../services/notification.service');

// Lista reuniones. Todos los autenticados pueden verlas (son eventos de
// equipo). Admite filtros por rango de fechas y estado.
const list = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 100);
  const filter = {};

  if (req.query.q) {
    filter.$or = [
      { title: { $regex: req.query.q, $options: 'i' } },
      { description: { $regex: req.query.q, $options: 'i' } },
    ];
  }
  if (req.query.status) filter.status = req.query.status;

  // Rango por fechas (por defecto: próximas + recientes).
  if (req.query.start || req.query.end) {
    filter.start = {};
    if (req.query.start) filter.start.$gte = new Date(req.query.start);
    if (req.query.end) filter.start.$lte = new Date(req.query.end);
    if (!Object.keys(filter.start).length) delete filter.start;
  }
  if (req.query.from || req.query.to) {
    filter.start = filter.start || {};
    if (req.query.from) filter.start.$gte = new Date(req.query.from);
    if (req.query.to) filter.start.$lte = new Date(req.query.to);
  }

  const query = Meeting.find(filter).populate('createdBy', 'name photo');
  const [total, items] = await Promise.all([
    Meeting.countDocuments(filter),
    query.skip((page - 1) * limit).limit(limit).sort({ start: 1 }),
  ]);

  res.json({
    success: true,
    data: items,
    meta: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

const get = asyncHandler(async (req, res) => {
  const meeting = await Meeting.findById(req.params.id).populate('createdBy', 'name photo');
  if (!meeting) return res.status(404).json({ success: false, message: 'Reunión no encontrada.' });
  res.json({ success: true, data: meeting });
});

// Solo administración y gerencia publican/editan reuniones.
const create = asyncHandler(async (req, res) => {
  if (!isBoss(req)) {
    return res.status(403).json({ success: false, message: 'Solo administración y gerencia pueden publicar reuniones.' });
  }
  const { title, description, location, start, end, status } = req.body;
  if (!title || !start || !end) {
    return res.status(400).json({ success: false, message: 'Título, fecha de inicio y fecha de fin son obligatorios.' });
  }
  if (new Date(end) <= new Date(start)) {
    return res.status(400).json({ success: false, message: 'La fecha de fin debe ser posterior a la de inicio.' });
  }
  const meeting = await Meeting.create({
    title,
    description: description || '',
    location: location || '',
    start: new Date(start),
    end: new Date(end),
    status: status || 'programada',
    createdBy: req.user._id,
  });
  const populated = await Meeting.findById(meeting._id).populate('createdBy', 'name photo');

  // Push NATIVO a todo el equipo activo (incluso con equipo bloqueado).
  try {
    const users = await User.find({ status: { $ne: 'inactivo' } }).select('_id');
    await pushNative(users.map((u) => u._id), {
      title: 'Nueva reunión',
      body: `${title}${location ? ` · ${location}` : ''}`,
      tag: `meeting-${meeting._id}`,
      url: 'calendar.html',
    });
  } catch (e) { /* la reunión se publica igual aunque el push falle */ }

  res.status(201).json({ success: true, message: 'Reunión publicada.', data: populated });
});

const update = asyncHandler(async (req, res) => {
  if (!isBoss(req)) {
    return res.status(403).json({ success: false, message: 'Solo administración y gerencia pueden editar reuniones.' });
  }
  const meeting = await Meeting.findById(req.params.id);
  if (!meeting) return res.status(404).json({ success: false, message: 'Reunión no encontrada.' });

  const allowed = ['title', 'description', 'location', 'start', 'end', 'status'];
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) meeting[key] = key === 'start' || key === 'end' ? new Date(req.body[key]) : req.body[key];
  });
  if (meeting.end && meeting.start && new Date(meeting.end) <= new Date(meeting.start)) {
    return res.status(400).json({ success: false, message: 'La fecha de fin debe ser posterior a la de inicio.' });
  }
  await meeting.save();
  const populated = await Meeting.findById(meeting._id).populate('createdBy', 'name photo');
  res.json({ success: true, message: 'Reunión actualizada.', data: populated });
});

const remove = asyncHandler(async (req, res) => {
  if (!isBoss(req)) {
    return res.status(403).json({ success: false, message: 'Solo administración y gerencia pueden eliminar reuniones.' });
  }
  const meeting = await Meeting.findById(req.params.id);
  if (!meeting) return res.status(404).json({ success: false, message: 'Reunión no encontrada.' });
  await meeting.deleteOne();
  res.json({ success: true, message: 'Reunión eliminada.' });
});

module.exports = { list, get, create, update, remove };
