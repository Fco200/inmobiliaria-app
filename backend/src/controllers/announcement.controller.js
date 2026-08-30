'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const { Announcement } = require('../models');

const listAnnouncements = asyncHandler(async (req, res) => {
  const announcements = await Announcement.find()
    .populate('author', 'name username role')
    .sort({ createdAt: -1 })
    .limit(50);

  res.json({ success: true, data: announcements });
});

const createAnnouncement = asyncHandler(async (req, res) => {
  const role = req.user.role && (req.user.role.code || req.user.role);
  if (role !== 'admin' && role !== 'gerencia') {
    return res.status(403).json({ success: false, message: 'Solo administradores y gerencia pueden crear avisos' });
  }

  const { title, message, priority } = req.body;
  if (!title || !message) {
    return res.status(400).json({ success: false, message: 'Título y mensaje son obligatorios' });
  }

  const announcement = await Announcement.create({
    title,
    message,
    priority: priority || 'normal',
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
  const announcement = await Announcement.findById(req.params.id);
  if (!announcement) {
    return res.status(404).json({ success: false, message: 'Aviso no encontrado' });
  }

  if (!announcement.readBy.includes(req.user._id)) {
    announcement.readBy.push(req.user._id);
    await announcement.save();
  }

  res.json({ success: true, message: 'Marcado como leído' });
});

const deleteAnnouncement = asyncHandler(async (req, res) => {
  const role = req.user.role && (req.user.role.code || req.user.role);
  if (role !== 'admin' && role !== 'gerencia') {
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
