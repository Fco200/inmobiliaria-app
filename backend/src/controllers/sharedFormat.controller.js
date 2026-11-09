'use strict';

const path = require('path');
const asyncHandler = require('../middlewares/asyncHandler');
const { SharedFormat } = require('../models');
const storage = require('../services/storage.service');
const { logActivity } = require('../services/log.service');
const { isBoss } = require('../utils/scope');

const MAX_NAME = 160;

// GET /api/formatos/compartidos — lo ven todos los usuarios autenticados.
const listSharedFormats = asyncHandler(async (req, res) => {
  const items = await SharedFormat.find({})
    .sort({ createdAt: -1 })
    .populate('uploadedBy', 'name username')
    .lean();
  res.json({ success: true, data: items });
});

// POST /api/formatos/compartidos  multipart: name (texto) + archivo (cualquier formato permitido)
const uploadSharedFormat = asyncHandler(async (req, res) => {
  const name = String((req.body && req.body.name) || '').trim().slice(0, MAX_NAME);
  if (!name) {
    return res.status(400).json({ success: false, message: 'Escribe el nombre del formato.' });
  }
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Selecciona un archivo válido (PDF, Word, Excel o imagen).' });
  }

  await storage.persistFile(req.file);
  const fileUrl = `/uploads/${req.file.filename}`;

  const item = await SharedFormat.create({
    name,
    fileUrl,
    fileName: req.file.originalname || req.file.filename,
    mimeType: req.file.mimetype || '',
    size: req.file.size || 0,
    uploadedBy: req.user._id,
  });

  await logActivity({
    entityType: 'Document',
    entityId: item._id,
    user: req.user._id,
    action: 'subir_formato_compartido',
    message: `Subió el formato "${name}"`,
  });

  const populated = await item.populate('uploadedBy', 'name username');
  res.status(201).json({ success: true, message: 'Formato guardado. Ya está disponible para el equipo.', data: populated });
});

// GET /api/formatos/compartidos/:id/descargar — entrega el archivo con sesión.
const downloadSharedFormat = asyncHandler(async (req, res) => {
  const item = await SharedFormat.findById(req.params.id).lean();
  if (!item) return res.status(404).json({ success: false, message: 'Formato no encontrado.' });

  const key = storage.fileKeyFromUrl(item.fileUrl) || path.basename(item.fileUrl || '');
  const buffer = await storage.readFileBuffer(key);
  if (!buffer) return res.status(404).json({ success: false, message: 'El archivo ya no está disponible.' });

  const safeName = String(item.fileName || item.name || 'formato')
    .replace(/[\r\n"]/g, '')
    .trim() || 'formato';
  const asciiName = safeName.replace(/[^a-zA-Z0-9._-]/g, '_');
  res.setHeader('Content-Type', item.mimeType || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`
  );
  res.setHeader('Cache-Control', 'private, max-age=60');
  return res.send(buffer);
});

// PATCH /api/formatos/compartidos/:id — cambia el nombre y/o reemplaza el archivo.
// Lo puede hacer quien lo subió o un perfil de dirección.
const updateSharedFormat = asyncHandler(async (req, res) => {
  const item = await SharedFormat.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'Formato no encontrado.' });

  const isOwner = String(item.uploadedBy) === String(req.user._id);
  if (!isBoss(req) && !isOwner) {
    return res.status(403).json({ success: false, message: 'Solo quien lo subió o dirección puede editarlo.' });
  }

  const name = String((req.body && req.body.name) || '').trim().slice(0, MAX_NAME);
  if (req.body && req.body.name !== undefined && !name) {
    return res.status(400).json({ success: false, message: 'El nombre del formato no puede estar vacío.' });
  }
  if (name) item.name = name;

  let oldFileUrl = null;
  if (req.file) {
    await storage.persistFile(req.file);
    oldFileUrl = item.fileUrl;
    item.fileUrl = `/uploads/${req.file.filename}`;
    item.fileName = req.file.originalname || req.file.filename;
    item.mimeType = req.file.mimetype || '';
    item.size = req.file.size || 0;
  }

  await item.save();
  if (oldFileUrl && oldFileUrl !== item.fileUrl) {
    await storage.deleteFileIfUnused(oldFileUrl).catch(() => {});
  }

  await logActivity({
    entityType: 'Document',
    entityId: item._id,
    user: req.user._id,
    action: 'actualizar_formato_compartido',
    message: `Actualizó el formato "${item.name}"${req.file ? ' (archivo reemplazado)' : ''}`,
  });

  const populated = await item.populate('uploadedBy', 'name username');
  res.json({ success: true, message: 'Formato actualizado.', data: populated });
});

// DELETE /api/formatos/compartidos/:id — quien lo subió o un perfil de dirección.
const removeSharedFormat = asyncHandler(async (req, res) => {
  const item = await SharedFormat.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'Formato no encontrado.' });

  const isOwner = String(item.uploadedBy) === String(req.user._id);
  if (!isBoss(req) && !isOwner) {
    return res.status(403).json({ success: false, message: 'Solo quien lo subió o dirección puede eliminarlo.' });
  }

  const fileUrl = item.fileUrl;
  await item.deleteOne();
  await storage.deleteFileIfUnused(fileUrl).catch(() => {});

  await logActivity({
    entityType: 'Document',
    entityId: item._id,
    user: req.user._id,
    action: 'eliminar_formato_compartido',
    message: `Eliminó el formato "${item.name}"`,
  });

  res.json({ success: true, message: 'Formato eliminado.' });
});

module.exports = { listSharedFormats, uploadSharedFormat, updateSharedFormat, downloadSharedFormat, removeSharedFormat };
