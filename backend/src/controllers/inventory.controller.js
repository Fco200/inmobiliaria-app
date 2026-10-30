'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const { Inventory, Property } = require('../models');
const { logActivity } = require('../services/log.service');
const { notifyInterestedClients } = require('./property.controller');

function isBoss(user) {
  return ['admin', 'direccion', 'gerencia', 'superadmin'].includes(user.role && user.role.code);
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
      // propiedad o tiene el inventario asignado. Las propiedades EXTERNAS
      // (ajenas al equipo) nunca aparecen aquí, solo en el inventario general.
      const props = await Property.find(
        { responsibleUser: req.user._id, isExternal: { $ne: true } },
        '_id'
      ).lean();
      const minePropIds = props.map((p) => p._id);
      const externals = await Property.find({ isExternal: true }).select('_id').lean();
      filter.property = { $nin: externals.map((p) => p._id) };
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

// Inventario General: propiedades que los asesores COMPARTIERON desde "Captar
// Propiedades" (isPublished). El filtro por publicación se retiró del módulo:
// solo aparece lo compartido. Disponible para cualquier usuario autenticado
// (los jefes la administran; el equipo la consulta) con filtros por asesor,
// tipo, operación, estado y rango de precio.
const PROPERTY_TYPE_VALUES = ['casa', 'departamento', 'local', 'bodega', 'rancho', 'terreno', 'playa', 'otro'];
const PROPERTY_STATUS_VALUES = ['disponible', 'en_proceso', 'apartada', 'vendida', 'rentada', 'inactiva'];
const PROPERTY_PAYMENT_VALUES = ['contado', 'infonavit', 'banco', 'fovissste', 'todos', 'otro'];

function toList(value) {
  return String(value == null ? '' : value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

const generalList = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 25);
  // Solo se muestran las propiedades compartidas al inventario general.
  const filter = { isPublished: true };

  if (req.query.assignedAgent) filter.assignedAgent = req.query.assignedAgent;

  // Filtros de la PROPIEDAD (viven en el documento Property, no en Inventory):
  // se resuelven primero los IDs que cumplen y se acotan sobre `property`.
  const propFilter = {};
  const propConditions = [];

  const types = toList(req.query.type).filter((t) => PROPERTY_TYPE_VALUES.includes(t));
  if (types.length) propConditions.push({ type: types.length > 1 ? { $in: types } : types[0] });

  const operations = toList(req.query.operationType);
  if (operations.length) propConditions.push({ operationType: operations.length > 1 ? { $in: operations } : operations[0] });

  const statuses = toList(req.query.status).filter((s) => PROPERTY_STATUS_VALUES.includes(s));
  if (statuses.length) propConditions.push({ status: statuses.length > 1 ? { $in: statuses } : statuses[0] });

  // Forma de financiamiento: Infonavit, Fovissste, Banco, Contado, etc.
  const payments = toList(req.query.paymentMethod).filter((p) => PROPERTY_PAYMENT_VALUES.includes(p));
  if (payments.length) propConditions.push({ paymentMethods: { $in: payments } });

  // Rango de precio "de X a Y".
  const min = parseFloat(req.query.minPrice);
  const max = parseFloat(req.query.maxPrice);
  const priceFilter = {};
  if (Number.isFinite(min)) priceFilter.$gte = min;
  if (Number.isFinite(max)) priceFilter.$lte = max;
  if (Object.keys(priceFilter).length) propConditions.push({ price: priceFilter });

  // Búsqueda de texto libre (folio, ubicación, tipo, descripción, asesor externo).
  const q = String(req.query.q || '').trim();
  const esc = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (q) {
    const term = esc(q);
    propConditions.push({
      $or: [
        { folio: { $regex: term, $options: 'i' } },
        { address: { $regex: term, $options: 'i' } },
        { zone: { $regex: term, $options: 'i' } },
        { city: { $regex: term, $options: 'i' } },
        { type: { $regex: term, $options: 'i' } },
        { description: { $regex: term, $options: 'i' } },
        { externalAdvisor: { $regex: term, $options: 'i' } },
      ],
    });
  }

  if (propConditions.length) {
    propFilter.$and = propConditions;
    const propIds = await Property.find(propFilter, '_id').lean();
    const ids = propIds.map((p) => p._id);
    filter.property = ids.length ? { $in: ids } : { $in: [] };
  }

  const [total, items] = await Promise.all([
    Inventory.countDocuments(filter),
    Inventory.find(filter)
      // Proyección: la tarjeta solo necesita los campos que se muestran en la
      // lista y el detalle, no el documento completo ni los historiales.
      .populate('property', 'folio type operationType price ticketValue zone city state address photos description characteristics paymentMethods paymentMethodsOther status isExternal externalAdvisor isPublished owner ownerName responsibleUser')
      .populate('assignedAgent', 'name photo')
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  res.json({
    success: true,
    data: items,
    meta: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// Folio correlativo con reintento ante colisiones del índice único.
async function nextFolio() {
  const year = new Date().getFullYear();
  const docs = await Property.find({
    $or: [
      { folio: { $regex: `^${year}-\\d+$` } },
      { folio: { $regex: `^INMO-\\d+-${year}$` } },
    ],
  })
    .select('folio')
    .lean();
  let max = 0;
  docs.forEach((doc) => {
    const folio = String(doc.folio || '');
    let match = folio.match(new RegExp(`^${year}-(\\d+)$`));
    if (match) {
      const num = Number(match[1]);
      if (!Number.isNaN(num) && num > max) max = num;
      return;
    }
    match = folio.match(/^INMO-(\d+)-(\d{4})$/);
    if (match && Number(match[2]) === year) {
      const num = Number(match[1]);
      if (!Number.isNaN(num) && num > max) max = num;
    }
  });
  for (let i = 0; i < 10; i += 1) {
    const folio = `${year}-${String(max + 1 + i).padStart(3, '0')}`;
    const exists = await Property.findOne({ folio }).select('_id').lean();
    if (!exists) return folio;
  }
  return `${year}-${Date.now().toString().slice(-6)}`;
}

// Sube una propiedad NUEVA al inventario general (crea Property + Inventory)
// en una sola llamada.
//  - Administración/gerencia: pueden asignar a cualquier asesor, definir el
//    folio y publicar de inmediato.
//  - Asesores: suben sus propias captaciones. Pasan a su nombre, se asignan a
//    ellos mismos y quedan SIN publicar hasta que administración las revise.
const uploadProperty = asyncHandler(async (req, res) => {
  const { type, operationType } = req.body || {};
  if (!type || !operationType) {
    return res.status(400).json({
      success: false,
      message: 'El tipo de inmueble y el tipo de operación son obligatorios',
    });
  }

  const boss = isBoss(req.user);
  let isPublished = req.body.isPublished === true;
  let assignedAgent = req.body.assignedAgent || null;

  if (!boss) {
    assignedAgent = req.user._id;
    isPublished = false;
  }

  const folio = await nextFolio();

  const property = await Property.create({
    folio,
    type,
    operationType,
    address: req.body.address || '',
    zone: req.body.zone || '',
    city: req.body.city || '',
    state: req.body.state || '',
    price: Number(req.body.price) || 0,
    ticketValue: Number(req.body.ticketValue) || 0,
    description: req.body.description || '',
    characteristics: req.body.characteristics || [],
    responsibleUser: assignedAgent || req.user._id,
    status: req.body.status || 'disponible',
    isPublished,
    // Propiedad externa (ajena al equipo): solo administración/gerencia puede
    // marcarla; los asesores siempre suben captaciones propias.
    isExternal: boss ? req.body.isExternal === true : false,
    externalAdvisor: boss && req.body.isExternal === true ? (req.body.externalAdvisor || '') : '',
  });

  const inventory = await Inventory.create({
    property: property._id,
    assignedAgent,
    isPublished,
  });

  await logActivity({
    entityType: 'Property',
    entityId: property._id,
    user: req.user._id,
    action: 'creacion',
    message: `Se subió una propiedad al inventario general (${property.type} en ${property.zone || property.city || 'sin ubicación'})`,
  });

  const notified = isPublished ? await notifyInterestedClients(property, req.user._id) : 0;

  await inventory.populate('property');
  await inventory.populate('assignedAgent');

  res.status(201).json({ success: true, data: inventory, notifiedClients: notified });
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

  // Mantener la sincronía con la propiedad: si cambió el estado de
  // publicación aquí, se refleja en Property para que la property aparezca
  // (o desaparezca) del catálogo público (landing).
  if (typeof req.body.isPublished === 'boolean') {
    await Property.findByIdAndUpdate(inventory.property, { isPublished: req.body.isPublished });
  }

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
  const inventory = await Inventory.findById(req.params.id).populate('property');
  if (!inventory) return res.status(404).json({ success: false, message: 'Registro no encontrado' });

  const isPublished = req.body.isPublished === true;

  // Publicar/despublicar: administración/gerencia siempre; el asesor asignado
  // y el responsable de la propiedad también (el botón "Despublicar" se muestra
  // a todos, así que la API debe acompañarlo).
  if (!isPublished && !isBoss(req.user)) {
    const assigned = String(inventory.assignedAgent || '') === String(req.user._id);
    const responsible = String((inventory.property && inventory.property.responsibleUser) || '') === String(req.user._id);
    if (!assigned && !responsible) {
      return res.status(403).json({ success: false, message: 'No tienes acceso a despublicar esta propiedad.' });
    }
  }

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
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(60, parseInt(req.query.limit, 10) || 24);
  const filter = { isPublished: true };
  if (req.query.operationType) filter.operationType = req.query.operationType;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.city) filter.city = req.query.city;
  if (req.query.zone) filter.zone = req.query.zone;
  if (req.query.paymentMethod) filter.paymentMethods = { $in: toList(req.query.paymentMethod) };

  const query = {};
  if (req.query.minPrice) query.price = { $gte: Number(req.query.minPrice) };
  if (req.query.maxPrice) query.price = { ...(query.price || {}), $lte: Number(req.query.maxPrice) };

  const [total, items] = await Promise.all([
    Inventory.countDocuments(filter),
    Inventory.find(filter)
      // Proyección: el catálogo público solo necesita los campos visibles.
      .populate({
        path: 'property',
        select: 'type operationType price ticketValue zone city state description photos address characteristics paymentMethods',
        match: query.price ? { price: query.price } : {},
      })
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ publishedAt: -1, createdAt: -1 })
      .lean(),
  ]);

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

  res.json({
    success: true,
    data: properties,
    meta: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

module.exports = { list, generalList, get, create, uploadProperty, update, remove, togglePublish, publicList };
