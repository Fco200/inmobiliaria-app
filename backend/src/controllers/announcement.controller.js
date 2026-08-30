'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const { Announcement } = require('../models');

// Código de rol robusto: el rol viene poblado como documento ({code, name}) o
// puede llegar como string; nunca debe romper por undefined.
function roleCode(user) {
  if (!user || !user.role) return '';
  return typeof user.role === 'object' ? (user.role.code || '') : user.role;
}

function isBossRole(user) {
  const role = roleCode(user);
  return role === 'admin' || role === 'gerencia';
}

const listAnnouncements = asyncHandler(async (req, res) => {
  const announcements = await Announcement.find()
    .populate('author', 'name username role')
    .sort({ createdAt: -1 })
    .limit(50);

  res.json({ success: true, data: announcements });
});

const createAnnouncement = asyncHandler(async (req, res) => {
  if (!req.user || !req.user._id) {
    return res.status(401).json({ success: false, message: 'No autorizado' });
  }
  if (!isBossRole(req.user)) {
    return res.status(403).json({ success: false, message: 'Solo administradores y gerencia pueden crear avisos' });
  }

  const title = String((req.body && req.body.title) || '').trim().slice(0, 200);
  const messageText = String((req.body && req.body.message) || '').trim().slice(0, 2000);
  const priority = (req.body && req.body.priority) || 'normal';

  if (!title) {
    return res.status(400).json({ success: false, message: 'El título es obligatorio' });
  }
  if (!messageText) {
    return res.status(400).json({ success: false, message: 'El mensaje es obligatorio' });
  }
  if (!['normal', 'importante', 'urgente'].includes(priority)) {
    return res.status(400).json({ success: false, message: 'Prioridad inválida' });
  }

  const announcement = await Announcement.create({
    title,
    message: messageText,
    priority,
    author: req.user._id,
    readBy: [req.user._id],
  });

  const populated = await announcement.populate('author', 'name username role');

  const io = req.app.get('io');
  if (io) {
    io.emit('new-announcement', populated);
  }

  res.status(201).json({ success: true, data: populated });
});

const markAnnouncementRead = asyncHandler(async (req, res) => {
  if (!req.user || !req.user._id) {
    return res.status(401).json({ success: false, message: 'No autorizado' });
  }

  const announcement = await Announcement.findById(req.params.id);
  if (!announcement) {
    return res.status(404).json({ success: false, message: 'Aviso no encontrado' });
  }

  if (!announcement.readBy.some((id) => id && id.toString() === req.user._id.toString())) {
    announcement.readBy.push(req.user._id);
    await announcement.save();
  }

  res.json({ success: true, message: 'Marcado como leído' });
});

const deleteAnnouncement = asyncHandler(async (req, res) => {
  if (!req.user || !req.user._id) {
    return res.status(401).json({ success: false, message: 'No autorizado' });
  }
  if (!isBossRole(req.user)) {
    return res.status(403).json({ success: false, message: 'No autorizado' });
  }

  const announcement = await Announcement.findByIdAndDelete(req.params.id);
  if (!announcement) {
    return res.status(404).json({ success: false, message: 'Aviso no encontrado' });
  }

  const io = req.app.get('io');
  if (io) {
    io.emit('delete-announcement', { id: req.params.id });
  }

  res.json({ success: true, message: 'Aviso eliminado' });
});

module.exports = {
  listAnnouncements,
  createAnnouncement,
  markAnnouncementRead,
  deleteAnnouncement,
};
