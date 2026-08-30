'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const { Inventory, Property } = require('../models');
const { logActivity } = require('../services/log.service');

function isBoss(user) {
  return ['admin', 'gerencia'].includes(user.role && user.role.code);
}

const list = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 25);
  const boss = isBoss(req.user);

  const filter = {};
  if (boss) {
    if (req.query.isPublished !== undefined && req.query.isPublished !== '') {
      filter.isPublished = req.query.isPublished === 'true';
    }
    if (req.query.assignedAgent) filter.assignedAgent = req.query.assignedAgent;
    // Filtrar por el asesor responsable de la propiedad (?responsibleUser=id).
    if (req.query.responsibleUser) {
      const props = await Property.find(
        { responsibleUser: req.query.responsibleUser },
        '_id'
      ).lean();
      const ids = props.map((p) => p._id);
      filter.property = ids.length ? { $in: ids } : { $in: [] };
    }
  } else {
    // Los asesores trabajan sobre lo publicado + lo que les fue asignado.
    if (req.query.mine === 'true') {
      // "Mi inventario": propiedades donde el asesor es responsable de la
      // propiedad o tiene el inventario asignado.
      const props = await Property.find(
        { responsibleUser: req.user._id },
        '_id'
      ).lean();
      const minePropIds = props.map((p) => p._id);
      filter.$or = [
        { assignedAgent: req.user._id },
        { property: minePropIds.length ? { $in: minePropIds } : { $in: [] } },
      ];
    } else {
      filter.$or = [{ isPublished: true }, { assignedAgent: req.user._id }];
    }
  }

  const [total, items] = await Promise.all([
    Inventory.countDocuments(filter),
    Inventory.find(filter)
      .populate('property')
      .populate('assignedAgent')
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 }),
  ]);

  res.json({
    success: true,
    data: items,
    meta: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

const get = asyncHandler(async (req, res) => {
  const inventory = await Inventory.findById(req.params.id)
    .populate('property')
    .populate('assignedAgent');
  if (!inventory) {
    return res.status(404).json({ success: false, message: 'Registro no encontrado' });
  }
  if (!isBoss(req.user)) {
    const isMine = String(inventory.assignedAgent && inventory.assignedAgent._id) === String(req.user._id);
    if (!isMine && !inventory.isPublished) {
      return res.status(403).json({ success: false, message: 'No tienes acceso a este registro' });
    }
  }
  res.json({ success: true, data: inventory });
});

const create = asyncHandler(async (req, res) => {
  if (!isBoss(req.user)) {
    return res.status(403).json({ success: false, message: 'Solo administración y gerencia agregan al inventario' });
  }

  const { propertyId } = req.body;
  if (!propertyId) {
    return res.status(400).json({ success: false, message: 'Se requiere la propiedad' });
  }

  const property = await Property.findById(propertyId);
  if (!property) {
    return res.status(404).json({ success: false, message: 'Propiedad no encontrada' });
  }

  const existing = await Inventory.findOne({ property: propertyId });
  if (existing) {
    return res.status(409).json({ success: false, message: 'La propiedad ya está en el inventario' });
  }

  const inventory = await Inventory.create({
    property: propertyId,
    assignedAgent: req.body.assignedAgent || null,
    isPublished: property.isPublished === true,
  });

  await logActivity({
    entityType: 'Inventory',
    entityId: inventory._id,
    user: req.user._id,
    action: 'creacion',
    message: 'Propiedad agregada al inventario',
  });

  res.status(201).json({ success: true, data: inventory });
});

const update = asyncHandler(async (req, res) => {
  const inventory = await Inventory.findById(req.params.id);
  if (!inventory) return res.status(404).json({ success: false, message: 'Registro no encontrado' });

  if (!isBoss(req.user)) {
    const isMine = String(inventory.assignedAgent) === String(req.user._id);
    if (!isMine) {
      return res.status(403).json({ success: false, message: 'Solo puedes editar propiedades que te fueron asignadas' });
    }
    const allowed = ['observations'];
    const keys = Object.keys(req.body);
    if (keys.some((key) => !allowed.includes(key))) {
      return res.status(403).json({ success: false, message: 'Solo puedes actualizar las observaciones' });
    }
  }

  Object.assign(inventory, req.body);
  await inventory.save();
  await inventory.populate('property');
  await inventory.populate('assignedAgent');

  res.json({ success: true, data: inventory });
});

const remove = asyncHandler(async (req, res) => {
  if (!isBoss(req.user)) {
    return res.status(403).json({ success: false, message: 'Solo administración y gerencia pueden quitar del inventario' });
  }

  const inventory = await Inventory.findByIdAndDelete(req.params.id);
  if (!inventory) return res.status(404).json({ success: false, message: 'Registro no encontrado' });
  await Property.findByIdAndUpdate(inventory.property, { isPublished: false });

  await logActivity({
    entityType: 'Inventory',
    entityId: inventory._id,
    user: req.user._id,
    action: 'eliminacion',
    message: 'Propiedad quitada del inventario',
  });

  res.json({ success: true, message: 'Registro eliminado del inventario' });
});

const togglePublish = asyncHandler(async (req, res) => {
  if (!isBoss(req.user)) {
    return res.status(403).json({ success: false, message: 'Solo administración y gerencia publican el inventario' });
  }

  const inventory = await Inventory.findById(req.params.id).populate('property');
  if (!inventory) return res.status(404).json({ success: false, message: 'Registro no encontrado' });

  const isPublished = req.body.isPublished === true;
  inventory.isPublished = isPublished;
  if (isPublished) inventory.publishedAt = new Date();
  else inventory.unpublishedAt = new Date();
  await inventory.save();

  await Property.findByIdAndUpdate(inventory.property._id, { isPublished });

  await logActivity({
    entityType: 'Inventory',
    entityId: inventory._id,
    user: req.user._id,
    action: isPublished ? 'publicar' : 'despublicar',
    message: isPublished ? 'Inventario publicado' : 'Inventario despublicado',
  });

  res.json({ success: true, message: isPublished ? 'Inventario publicado' : 'Inventario despublicado', data: inventory });
});

const publicList = asyncHandler(async (req, res) => {
  const filter = { isPublished: true };
  if (req.query.operationType) filter.operationType = req.query.operationType;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.city) filter.city = req.query.city;
  if (req.query.zone) filter.zone = req.query.zone;

  const query = {};
  if (req.query.minPrice) query.price = { $gte: Number(req.query.minPrice) };
  if (req.query.maxPrice) query.price = { ...(query.price || {}), $lte: Number(req.query.maxPrice) };

  const items = await Inventory.find(filter)
    .populate({
      path: 'property',
      match: query.price ? { price: query.price } : {},
    })
    .lean();

  const properties = items
    .filter((item) => item.property)
    .map((item) => ({
      id: item.property._id,
      type: item.property.type,
      operationType: item.property.operationType,
      price: item.property.price,
      ticketValue: item.property.ticketValue,
      zone: item.property.zone,
      city: item.property.city,
      state: item.property.state,
      description: item.property.description,
      photos: item.property.photos,
      address: item.property.address,
      characteristics: item.property.characteristics,
    }));

  res.json({ success: true, data: properties });
});

module.exports = { list, get, create, update, remove, togglePublish, publicList };
