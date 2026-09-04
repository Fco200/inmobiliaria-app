'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const buildCrud = require('../utils/crud');
const { isBoss } = require('../utils/scope');
const { Document } = require('../models');
const { logActivity } = require('../services/log.service');

const documentCrud = buildCrud(Document, {
  populate: ['uploadedBy', 'client', 'property', 'business'],
  ownerField: 'uploadedBy',
});

const populate = ['uploadedBy', 'client', 'property', 'business'];

function assertOwnership(req, doc) {
  if (isBoss(req)) return true;
  const ownerId = String((doc.uploadedBy && doc.uploadedBy._id) || doc.uploadedBy || '');
  return ownerId === String(req.user._id);
}

const list = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 25);
  const filter = {};

  if (req.query.q) {
    filter.$or = [
      { name: { $regex: req.query.q, $options: 'i' } },
      { observations: { $regex: req.query.q, $options: 'i' } },
    ];
  }
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.client) filter.client = req.query.client;
  if (req.query.property) filter.property = req.query.property;
  if (req.query.business) filter.business = req.query.business;

  // admin/gerencia ven todos los documentos; cada asesor solo los suyos.
  if (!isBoss(req)) {
    filter.uploadedBy = req.user._id;
  } else if (req.query.mine === 'true' || req.query.uploadedBy) {
    filter.uploadedBy = req.query.mine === 'true' ? req.user._id : req.query.uploadedBy;
  }

  const query = Document.find(filter).populate(populate);
  const [total, items] = await Promise.all([
    Document.countDocuments(filter),
    query.skip((page - 1) * limit).limit(limit).sort({ createdAt: -1 }),
  ]);

  res.json({
    success: true,
    data: items,
    meta: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

const get = documentCrud.get;

async function trace(doc, user, action, message) {
  logActivity({ entityType: 'Document', entityId: doc._id, user, action, message });
  if (doc.client) {
    logActivity({ entityType: 'Client', entityId: doc.client, user, action, message });
  }
  if (doc.property) {
    logActivity({ entityType: 'Property', entityId: doc.property, user, action, message });
  }
  if (doc.business) {
    logActivity({ entityType: 'Business', entityId: doc.business, user, action, message });
  }
}

const create = asyncHandler(async (req, res) => {
  const doc = await Document.create({ ...req.body, uploadedBy: req.user._id });
  await trace(doc, req.user._id, 'documento', `Se registró el documento ${doc.name}`);
  res.status(201).json({ success: true, data: doc });
});

const update = asyncHandler(async (req, res) => {
  const doc = await Document.findById(req.params.id);
  if (!doc) return res.status(404).json({ success: false, message: 'Documento no encontrado' });
  if (!assertOwnership(req, doc)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este documento.' });
  }
  Object.assign(doc, req.body);
  await doc.save();
  await trace(doc, req.user._id, 'actualizacion', `Se actualizó el documento ${doc.name}`);
  res.json({ success: true, data: doc });
});

const remove = asyncHandler(async (req, res) => {
  const doc = await Document.findById(req.params.id);
  if (!doc) return res.status(404).json({ success: false, message: 'Documento no encontrado' });
  if (!assertOwnership(req, doc)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este documento.' });
  }
  await doc.deleteOne();
  res.json({ success: true, message: 'Documento eliminado' });
});

// Convierte errores de multer (archivo demasiado grande, etc.) en respuestas claras.
function uploadErrorHandler(err, req, res, next) {
  if (!err) return next();
  const multer = require('multer');
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'El archivo supera el límite de 15 MB' });
    }
    return res.status(400).json({ success: false, message: `No se pudo subir el archivo: ${err.code}` });
  }
  if (err && err.message && /Tipo de archivo no permitido/i.test(err.message)) {
    return res.status(400).json({ success: false, message: err.message });
  }
  return next(err);
}

const upload = [
  require('../middlewares/upload').upload.single('file'),
  uploadErrorHandler,
  require('../middlewares/upload').verifyUpload,
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No se recibió ningún archivo' });
    }

    // Sube el archivo al almacenamiento en la nube (R2) si está configurado;
    // en modo local no hace nada (el archivo ya quedó en /uploads).
    await require('../services/storage.service').persistFile(req.file);

    const data = {
      fileName: req.file.filename,
      originalName: req.file.originalname,
      fileUrl: `/uploads/${req.file.filename}`,
    };

    // Si viene información del documento (al menos el cliente o el nombre),
    // crea el registro completo en un solo paso.
    const { name, type, status, client, property, business, observations } = req.body;
    const wantsRecord = (client && client !== '') || (name && name !== '');

    if (wantsRecord) {
      const doc = await Document.create({
        name: name || req.file.originalname,
        type: type || 'otros',
        status: status || 'recibido',
        date: new Date(),
        uploadedBy: req.user._id,
        client: client || null,
        property: property || null,
        business: business || null,
        observations: observations || '',
        fileName: data.fileName,
        fileUrl: data.fileUrl,
      });
      await trace(doc, req.user._id, 'documento', `Se subió el documento ${doc.name}`);
      data.document = doc;
    }

    res.json({ success: true, data });
  }),
];

module.exports = { list, get, create, update, remove, upload };
