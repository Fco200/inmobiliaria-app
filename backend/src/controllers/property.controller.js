'use strict';

const path = require('path');
const fs = require('fs');
const asyncHandler = require('../middlewares/asyncHandler');
const buildCrud = require('../utils/crud');
const { isBoss } = require('../utils/scope');
const { Property, Inventory, Client, Notification, Newsletter } = require('../models');
const { logActivity } = require('../services/log.service');
const { sendMail, mailNewProperty } = require('../services/mail.service');

const propertyCrud = buildCrud(Property, {
  populate: ['owner', 'responsibleUser'],
  searchFields: ['address', 'zone', 'city', 'state', 'description'],
  ownerField: 'responsibleUser',
  extraFilters: { operationType: 'operationType', type: 'type' },
  priceField: 'price',
});

const list = propertyCrud.list;
const get = propertyCrud.get;

function assertOwnership(req, property) {
  if (isBoss(req)) return true;
  const ownerId = String((property.responsibleUser && property.responsibleUser._id) || property.responsibleUser || '');
  return ownerId === String(req.user._id);
}

const INTENTIONS_BY_OPERATION = {
  venta: ['vender', 'comprar'],
  renta: ['rentar', 'alquilar'],
};

// Avisa a los clientes cuyo embudo/intención y presupuesto coinciden con la propiedad.
async function notifyInterestedClients(property) {
  const intentions = INTENTIONS_BY_OPERATION[property.operationType] || [];
  if (!intentions.length || !property.isPublished) return 0;

  try {
    const price = Number(property.price) || 0;
    // Coincidencia por campos legados (type) y canónicos (servicio):
    // los clientes nuevos solo tienen `servicio`, los viejos solo `type`.
    const venta = property.operationType === 'venta';
    const servicioMatch = venta ? ['Comprar'] : ['Rentar'];
    const clients = await Client.find({
      status: { $in: ['activo'] },
      $and: [
        { $or: [{ type: { $in: intentions } }, { servicio: { $in: servicioMatch } }] },
        { $or: [{ asesorAsignado: { $ne: null } }, { responsibleUser: { $ne: null } }] },
      ],
    });

    let notified = 0;
    for (const client of clients) {
      const targetUser = client.asesorAsignado || client.responsibleUser;
      const budget = client.buyerInfo && client.buyerInfo.budget ? Number(client.buyerInfo.budget) : 0;
      if (budget > 0 && price > budget * 1.15) continue; // supera el presupuesto (15% de holgura)

      const key = `prop-${property._id}-${client._id}`;
      const existing = await Notification.findOne({
        user: targetUser,
        type: 'nueva_propiedad',
        'data.key': key,
      });
      if (existing) continue;

      const place = [property.zone, property.city].filter(Boolean).join(', ') || 'sin ubicación';
      const priceText = price ? `$${price.toLocaleString('es-MX')}` : 'a definir';
      await Notification.create({
        user: targetUser,
        type: 'nueva_propiedad',
        title: 'Nueva propiedad para tu cliente',
        message: `Se publicó una ${property.type} en ${place} por ${priceText}. Coincide con los intereses de ${client.name}.`,
        data: { key, clientId: client._id, propertyId: property._id, price },
      });
      notified += 1;
    }
    return notified;
  } catch (error) {
    console.error('[Notificaciones] Error al notificar interesados:', error.message);
    return 0;
  }
}

// Avisa por correo a todos los suscriptores del newsletter cuando se publica
// una propiedad nueva. El envío no bloquea la operación si falla.
async function notifyNewsletter(property) {
  if (!property || !property.isPublished) return 0;
  try {
    const subs = await Newsletter.find({ status: 'suscrito' }).select('email').lean();
    let sent = 0;
    for (const sub of subs) {
      const ok = await sendMail({ ...mailNewProperty(property), to: sub.email });
      if (ok) sent += 1;
    }
    if (subs.length) {
      console.log(`[MAIL] Notificación de propiedad nueva enviada a ${sent}/${subs.length} suscriptores.`);
    }
    return sent;
  } catch (error) {
    console.error('[MAIL] Error al notificar a suscriptores del newsletter:', error.message);
    return 0;
  }
}

const create = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  if (!isBoss(req) || !body.responsibleUser) body.responsibleUser = req.user._id;
  
  // Generar folio INMO-###-AÑO
  const year = new Date().getFullYear();
  const count = await Property.countDocuments();
  const nextNum = String(count + 1).padStart(3, '0');
  body.folio = `INMO-${nextNum}-${year}`;
  
  const property = await Property.create(body);
  await logActivity({
    entityType: 'Property',
    entityId: property._id,
    user: req.user._id,
    action: 'creacion',
    message: `Se registró la propiedad (${property.type} en ${property.zone || property.city || 'sin ubicación'})`,
  });
  await notifyInterestedClients(property);
  await notifyNewsletter(property);
  res.status(201).json({ success: true, data: property });
});

const update = asyncHandler(async (req, res) => {
  const property = await Property.findById(req.params.id);
  if (!property) return res.status(404).json({ success: false, message: 'Propiedad no encontrada' });
  if (!assertOwnership(req, property)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a esta propiedad.' });
  }

  const previousStatus = property.status;
  const previousPrice = Number(property.price) || 0;
  const previousPublished = Boolean(property.isPublished);

  Object.assign(property, req.body);

  if (req.body.price !== undefined && Number(req.body.price) !== previousPrice) {
    property.priceHistory.push({
      price: Number(req.body.price),
      date: new Date(),
      user: req.user._id,
    });
  }

  await property.save();

  const nowPublished = Boolean(property.isPublished);
  if (nowPublished && !previousPublished) {
    await notifyNewsletter(property);
  }

  if (req.body.status && req.body.status !== previousStatus) {
    await logActivity({
      entityType: 'Property',
      entityId: property._id,
      user: req.user._id,
      action: 'cambio_estado',
      message: `La propiedad cambió de "${previousStatus}" a "${req.body.status}"`,
    });
  }

  await logActivity({
    entityType: 'Property',
    entityId: property._id,
    user: req.user._id,
    action: 'actualizacion',
    message: 'Se actualizó la propiedad',
  });

  res.json({ success: true, data: property });
});

const remove = asyncHandler(async (req, res) => {
  const property = await Property.findById(req.params.id);
  if (!property) return res.status(404).json({ success: false, message: 'Propiedad no encontrada' });
  if (!assertOwnership(req, property)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a esta propiedad.' });
  }

  await property.deleteOne();

  await Inventory.deleteMany({ property: property._id });
  await logActivity({
    entityType: 'Property',
    entityId: property._id,
    user: req.user._id,
    action: 'eliminacion',
    message: 'Se eliminó la propiedad',
  });

  res.json({ success: true, message: 'Propiedad eliminada' });
});

const togglePublish = asyncHandler(async (req, res) => {
  const property = await Property.findById(req.params.id);
  if (!property) {
    return res.status(404).json({ success: false, message: 'Propiedad no encontrada' });
  }
  if (!assertOwnership(req, property)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a esta propiedad.' });
  }

  const isPublished = req.body.isPublished === true;

  // Solo admin/gerencia pueden despublicar propiedades del inventario general.
  if (!isPublished && !isBoss(req)) {
    return res.status(403).json({ success: false, message: 'Solo un administrador puede despublicar propiedades del inventario general.' });
  }

  property.isPublished = isPublished;
  await property.save();

  if (isPublished) {
    await Inventory.findOneAndUpdate(
      { property: property._id },
      { $set: { isPublished: true, publishedAt: new Date(), assignedAgent: req.body.assignedAgent || null } },
      { upsert: true, new: true }
    );
  } else {
    await Inventory.findOneAndUpdate(
      { property: property._id },
      { $set: { isPublished: false, unpublishedAt: new Date() } }
    );
  }

  await logActivity({
    entityType: 'Property',
    entityId: property._id,
    user: req.user._id,
    action: isPublished ? 'publicar' : 'despublicar',
    message: isPublished ? 'Propiedad publicada en inventario' : 'Propiedad despublicada',
  });

  const notified = isPublished ? await notifyInterestedClients(property) : 0;

  res.json({
    success: true,
    message: isPublished ? 'Propiedad publicada' : 'Propiedad despublicada',
    notifiedClients: notified,
    data: property,
  });
});

// Añade una o varias fotos a una propiedad (multipart: campo "photos").
// El dueño de la propiedad o administración/gerencia pueden subirlas.
const uploadPhotos = asyncHandler(async (req, res) => {
  const property = await Property.findById(req.params.id);
  if (!property) return res.status(404).json({ success: false, message: 'Propiedad no encontrada' });
  if (!assertOwnership(req, property)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a esta propiedad.' });
  }

  const { IMAGE_EXTS } = require('../middlewares/upload');
  const files = req.files || [];
  if (!files.length) {
    return res.status(400).json({ success: false, message: 'No se recibieron fotos' });
  }

  const bad = files.find((f) => !IMAGE_EXTS.has(path.extname(f.originalname || '').slice(1).toLowerCase()));
  if (bad) {
    files.forEach((f) => fs.unlink(f.path, () => {}));
    return res.status(400).json({ success: false, message: 'Solo se permiten imágenes' });
  }

  // Sube las fotos al almacenamiento en la nube (R2) si está configurado.
  await require('../services/storage.service').persistFiles(files);

  const urls = files.map((f) => `/uploads/${f.filename}`);
  property.photos = [...(property.photos || []), ...urls];
  await property.save();

  await logActivity({
    entityType: 'Property',
    entityId: property._id,
    user: req.user._id,
    action: 'fotos',
    message: `Se agregaron ${files.length} ${files.length === 1 ? 'foto' : 'fotos'} a la propiedad`,
  });

  res.json({ success: true, data: { photos: property.photos } });
});

const market = asyncHandler(async (req, res) => {
  const property = await Property.findById(req.params.id);
  if (!property) return res.status(404).json({ success: false, message: 'Propiedad no encontrada' });

  const filter = {
    _id: { $ne: property._id },
    type: property.type,
    operationType: property.operationType,
    status: { $ne: 'inactiva' },
    price: { $gt: 0 },
  };
  if (property.city) filter.city = property.city;
  if (property.zone) filter.zone = property.zone;

  const similar = await Property.find(filter)
    .select('price city zone status')
    .sort({ createdAt: -1 })
    .limit(100);

  const prices = similar.map((p) => Number(p.price) || 0).filter((p) => p > 0);
  const stats = prices.length
    ? {
        count: prices.length,
        min: Math.min(...prices),
        max: Math.max(...prices),
        avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
      }
    : { count: 0, min: 0, max: 0, avg: 0 };

  res.json({ success: true, data: { ...stats, prices } });
});

module.exports = { list, get, create, update, remove, togglePublish, market, uploadPhotos, notifyInterestedClients };
