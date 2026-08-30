'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const { Notification } = require('../models');
const { generateForUser } = require('../services/notification.service');

const list = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 25);
  const filter = { user: req.user._id };
  if (req.query.unread === 'true') filter.read = false;

  const [total, items] = await Promise.all([
    Notification.countDocuments(filter),
    Notification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
  ]);

  res.json({
    success: true,
    data: items,
    meta: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

const unreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({ user: req.user._id, read: false });
  res.json({ success: true, data: { unread: count } });
});

const markRead = asyncHandler(async (req, res) => {
  const notif = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { read: true, readAt: new Date() },
    { new: true }
  );
  if (!notif) return res.status(404).json({ success: false, message: 'Notificación no encontrada' });
  res.json({ success: true, data: notif });
});

const markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { read: true, readAt: new Date() });
  res.json({ success: true, message: 'Todas las notificaciones marcadas como leídas' });
});

async function ensure({ type, key, title, message, userId, data }) {
  const existing = await Notification.findOne({ user: userId, type, 'data.key': key });
  if (existing) return;
  await Notification.create({ user: userId, type, title, message, data: { key, ...data } });
}

const generate = asyncHandler(async (req, res) => {
  const created = await generateForUser(req.user._id);
  res.json({ success: true, message: 'Avisos generados', data: { generated: created.length } });
});

module.exports = { list, unreadCount, markRead, markAllRead, generate };
