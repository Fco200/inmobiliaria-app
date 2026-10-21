'use strict';

const path = require('path');
const fs = require('fs');
const asyncHandler = require('../middlewares/asyncHandler');
const buildCrud = require('../utils/crud');
const { isBoss } = require('../utils/scope');
const { Property, Inventory, Client, Notification, Newsletter } = require('../models');
const { logActivity } = require('../services/log.service');
const { sendMail, mailNewProperty, mailPropertyPublishedToAdvisor } = require('../services/mail.service');
const { normalizePhotos } = require('../utils/photos');

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

// Avisa a los clientes cuyo embudo/intención y presupuesto coinciden con la
// propiedad.
//
// `excludeUserId` es quien publicó la propiedad: NUNCA debe recibir el aviso de
// su propia publicación (era la causa de que al asesor le llegara el aviso de
// "nueva propiedad" que él mismo había generado).
async function notifyInterestedClients(property, excludeUserId) {
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
      if (!targetUser) continue;
      // Quien publicó la propiedad no recibe el aviso de su propia captura.
      if (excludeUserId && String(targetUser) === String(excludeUserId)) continue;
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

// Avisa por CORREO al asesor responsable de la propiedad cuando ésta queda
// publicada en el inventario general. Es el "espejo" del newsletter: el
// suscriptor recibe la promoción y el asesor recibe la confirmación de que su
// propiedad ya está compartida. NUNCA se cae el flujo si el correo falla.
//
// `interestedClients` es cuántos clientes interesados se avisaron, para
// incluirlo en el correo.
async function notifyAdvisorPublished(property, interestedClients = 0) {
  if (!property || !property.isPublished) return false;
  try {
    // El asesor es el "responsibleUser" (o el propietario de la ficha si no hay
    // uno asignado). Se pide aparte con select('+email') porque el campo email
    // del usuario no se expone por defecto.
    const advisorId = property.responsibleUser || property.owner;
    if (!advisorId) return false;
    const User = require('../models/user.model');
    const advisor = await User.findById(advisorId).select('name email').lean();
    const email = (advisor && advisor.email) || '';
    if (!email) return false;
    const ok = await sendMail({
      ...mailPropertyPublishedToAdvisor(property, {
        advisorName: (advisor && advisor.name) || '',
        interestedClients,
      }),
      to: email,
    });
    if (ok) {
      console.log(`[MAIL] Aviso de publicación enviado al asesor ${email}.`);
    }
    return ok;
  } catch (error) {
    console.error('[MAIL] Error al notificar al asesor de la publicación:', error.message);
    return false;
  }
}

// Sincroniza la publicación de una propiedad con el inventario general:
//  - al publicar/compartir → se crea (o actualiza) su registro de inventario,
//    y así aparece en el módulo "Propiedades" para todo el equipo.
//  - al despublicar → se marca como no compartida y desaparece del inventario.
// La decisión de compartir vive en "Captar Propiedades" (aquí).
async function syncInventoryOnPublish(property, isPublished, assignedAgent) {
  if (isPublished) {
    const update = { isPublished: true, publishedAt: new Date() };
    if (assignedAgent) update.assignedAgent = assignedAgent;
    await Inventory.findOneAndUpdate(
      { property: property._id },
      { $set: update },
      { upsert: true, new: true }
    );
  } else {
    await Inventory.findOneAndUpdate(
      { property: property._id },
      { $set: { isPublished: false, unpublishedAt: new Date() } }
    );
  }
}

// Borra del almacenamiento las fotos de una propiedad. Se usa cuando se
// elimina la propiedad o cuando se le quitan fotos en la edición: los archivos
// que siguen en uso (por otra propiedad, documento o inventario) se quedan,
// los que quedan huérfanos se eliminan para no llenar la base de datos.
async function deletePhotosFromStorage(urls) {
  if (!Array.isArray(urls) || !urls.length) return 0;
  const storage = require('../services/storage.service');
  let removed = 0;
  for (const url of urls) {
    try {
      if (await storage.deleteFileIfUnused(url)) removed += 1;
    } catch (error) {
      console.warn('[Storage] No se pudo eliminar una foto:', error.message);
    }
  }
  return removed;
}

const create = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  if (body.photos !== undefined) body.photos = normalizePhotos(body.photos);
  if (!isBoss(req) || !body.responsibleUser) body.responsibleUser = req.user._id;
  
  // Generar folio INMO-###-AÑO
  const year = new Date().getFullYear();
  const count = await Property.countDocuments();
  const nextNum = String(count + 1).padStart(3, '0');
  body.folio = `INMO-${nextNum}-${year}`;
  
  const property = await Property.create(body).catch(async (error) => {
    // Si la creación falla (por ejemplo, la base de datos está sin espacio),
    // las fotos que se subieron antes quedan huérfanas ocupando storage.
    // Se borran aquí mismo para no acumular archivos sin uso.
    await deletePhotosFromStorage(body.photos);
    throw error;
  });
  await logActivity({
    entityType: 'Property',
    entityId: property._id,
    user: req.user._id,
    action: 'creacion',
    message: `Se registró la propiedad (${property.type} en ${property.zone || property.city || 'sin ubicación'})`,
  });
  await notifyInterestedClients(property, req.user._id);
  await notifyNewsletter(property);

  // Si se registró ya compartida, aparece de inmediato en el inventario general.
  if (property.isPublished) {
    await syncInventoryOnPublish(property, true, property.responsibleUser);
    // Aviso por correo al asesor responsable (además del newsletter).
    await notifyAdvisorPublished(property, 0);
  }

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
  const previousPhotos = Array.isArray(property.photos) ? [...property.photos] : [];

  Object.assign(property, req.body);
  if (req.body.photos !== undefined) property.photos = normalizePhotos(req.body.photos);

  if (req.body.price !== undefined && Number(req.body.price) !== previousPrice) {
    property.priceHistory.push({
      price: Number(req.body.price),
      date: new Date(),
      user: req.user._id,
    });
  }

  await property.save();

  const nowPublished = Boolean(property.isPublished);
  if (nowPublished !== previousPublished) {
    await syncInventoryOnPublish(property, nowPublished, req.body.assignedAgent || property.responsibleUser);
    // Publicar desde la edición también avisa a los asesores con clientes
    // interesados (nunca al propio autor de la publicación).
    if (nowPublished && !previousPublished) {
      const interesados = await notifyInterestedClients(property, req.user._id);
      await notifyNewsletter(property);
      await notifyAdvisorPublished(property, interesados);
    }
  }

  // Fotos quitadas en la edición: se borran del almacenamiento si ya ninguna
  // otra ficha las referencia (si no, quedarían huérfanas ocupando espacio).
  if (req.body.photos !== undefined) {
    const kept = new Set((property.photos || []).map(String));
    const removedPhotos = previousPhotos.filter((p) => !kept.has(String(p)));
    if (removedPhotos.length) await deletePhotosFromStorage(removedPhotos);
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
  // Fotos de la propiedad eliminada: sin el registro ya nada las referencia,
  // así que se borran del almacenamiento para no dejar archivos huérfanos.
  await deletePhotosFromStorage(property.photos);
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

  // Estado previo: se guarda ANTES de modificar el documento para poder
  // detectar la transición publicar/despublicar. Antes esta variable no
  // existía en este ámbito y lanzaba "previousPublished is not defined",
  // lo que devolvía un error 500 al publicar aunque la propiedad sí se
  // guardara (y el resto del flujo, incluido el aviso a los interesados,
  // nunca se ejecutaba).
  const previousPublished = Boolean(property.isPublished);

  // Quien es dueño de la propiedad (o la tiene asignada) puede publicar y
  // despublicar; la restricción anterior dejaba botón y API desincronizados.
  property.isPublished = isPublished;
  await property.save();

  await syncInventoryOnPublish(property, isPublished, req.body.assignedAgent || null);

  if (isPublished && !previousPublished) {
    await notifyNewsletter(property);
  }

  await logActivity({
    entityType: 'Property',
    entityId: property._id,
    user: req.user._id,
    action: isPublished ? 'publicar' : 'despublicar',
    message: isPublished ? 'Propiedad publicada en inventario' : 'Propiedad despublicada',
  });

  const notified = isPublished ? await notifyInterestedClients(property, req.user._id) : 0;

  // Aviso por correo al asesor responsable (nunca al propio autor, que ya sabe
  // que publicó): cierra el ciclo para que el flujo quede limpio.
  if (isPublished && !previousPublished) {
    await notifyAdvisorPublished(property, notified);
  }

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

  const { IMAGE_EXTS, MIME_EXTS } = require('../middlewares/upload');
  const files = req.files || [];
  if (!files.length) {
    return res.status(400).json({ success: false, message: 'No se recibieron fotos' });
  }

  const bad = files.find((f) => {
    // En móviles/WA la foto puede venir sin extensión en el nombre: se toma
    // la que corresponda al MIME para no rechazar imágenes válidas.
    const ext = path.extname(f.originalname || '').slice(1).toLowerCase();
    return !IMAGE_EXTS.has(ext) && !MIME_EXTS[f.mimetype];
  });
  if (bad) {
    // Los archivos viven solo en memoria (multer.memoryStorage): no hay nada
    // que borrar del disco, basta descartar el buffer.
    files.forEach((f) => { if (f.path) fs.unlink(f.path, () => {}); });
    return res.status(400).json({ success: false, message: 'Solo se permiten imágenes' });
  }

  // Sube las fotos al almacenamiento en la nube (R2) si está configurado.
  // Se sube UNA por una y se toleran fallos individuales: si una imagen no se
  // puede persistir, las demás SÍ se guardan (antes un solo error abortaba el
  // lote completo y el asesor veía que "se quedó en 6 de 12").
  const storageSvc = require('../services/storage.service');
  const saved = [];
  const failed = [];
  for (const file of files) {
    try {
      await storageSvc.persistFile(file);
      saved.push(file);
    } catch (error) {
      failed.push({ name: file.originalname || file.filename || 'imagen', reason: error.message });
      console.error('[Fotos] No se pudo guardar una imagen:', error.message);
    }
  }

  if (!saved.length) {
    return res.status(500).json({
      success: false,
      message: 'No se pudo guardar ninguna fotografía. Intenta de nuevo con imágenes JPG o PNG.',
      failed,
    });
  }

  const urls = saved.map((f) => `/uploads/${f.filename}`);
  property.photos = [...(property.photos || []), ...urls];
  await property.save();

  await logActivity({
    entityType: 'Property',
    entityId: property._id,
    user: req.user._id,
    action: 'fotos',
    message: `Se agregaron ${saved.length} ${saved.length === 1 ? 'foto' : 'fotos'} a la propiedad`,
  });

  res.json({
    success: true,
    data: { photos: property.photos, added: saved.length, failed },
    // Mensaje explícito de cuántas entraron y cuántas no, para que el frontend
    // lo muestre y el proceso quede limpio (nada de "se quedó a medias").
    message: failed.length
      ? `Se agregaron ${saved.length} de ${files.length} fotos. ${failed.length} no se pudieron guardar.`
      : `Se agregaron ${saved.length} ${saved.length === 1 ? 'foto' : 'fotos'}.`,
  });
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
