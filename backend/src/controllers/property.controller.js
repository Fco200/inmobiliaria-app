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

function normalizeFolio(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ').slice(0, 60);
}

function isFolioDuplicateError(err) {
  if (!err) return false;
  if (err.code === 11000) {
    const keyPattern = err.keyPattern || {};
    const keyValue = err.keyValue || {};
    if (keyPattern.folio || (keyValue && Object.prototype.hasOwnProperty.call(keyValue, 'folio'))) return true;
    if (typeof err.message === 'string' && /folio/i.test(err.message)) return true;
  }
  return false;
}

async function nextAutomaticFolio(extra = 0) {
  const year = new Date().getFullYear();
  const docs = await Property.find({ folio: { $regex: `^INMO-\\d+-${year}$` } })
    .select('folio')
    .lean();
  let max = 0;
  docs.forEach((doc) => {
    const folio = String(doc.folio || '');
    const match = folio.match(/^INMO-(\d+)-(\d{4})$/);
    if (match && Number(match[2]) === year) {
      const num = Number(match[1]);
      if (!Number.isNaN(num) && num > max) max = num;
    }
  });
  let seq = max + 1 + Number(extra || 0);
  let candidate;
  do {
    candidate = `INMO-${String(seq).padStart(3, '0')}-${year}`;
    seq += 1;
    // avoid infinite loop
    if (seq > max + 5000) break;
  } while (await Property.exists({ folio: candidate }));
  return candidate;
}

async function resolveUniqueFolio(requested, excludeId) {
  let base = normalizeFolio(requested);
  if (!base) return nextAutomaticFolio();
  // try base first
  let candidate = base;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (attempt === 0) {
      candidate = base;
    } else {
      candidate = `${base}-${attempt + 1}`;
    }
    const query = { folio: candidate };
    if (excludeId) query._id = { $ne: excludeId };
    const exists = await Property.exists(query);
    if (!exists) return candidate;
  }
  // fallback
  return nextAutomaticFolio(1000 + Math.floor(Math.random() * 1000));
}

const propertyCrud = buildCrud(Property, {
  populate: ['owner', 'responsibleUser'],
  searchFields: ['address', 'zone', 'city', 'state', 'description'],
  ownerField: 'responsibleUser',
  extraFilters: { operationType: 'operationType', type: 'type', owner: 'owner' },
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

// Las notificaciones internas de tipo "nueva_propiedad" ("Se publicó una casa…
// coincide con los intereses de X") se desactivaron porque llenaban la campana
// con avisos que el equipo no utiliza. Se pueden reactivar con la variable de
// entorno NOTIFY_INTERESTED_CLIENTS=true sin tocar el código.
const NOTIFY_INTERESTED_CLIENTS = /^(1|true|si|sí)$/i.test(
  String(process.env.NOTIFY_INTERESTED_CLIENTS || 'false')
);

// Ejecuta tareas secundarias (correos, avisos automáticos) DESPUÉS de responder
// al cliente. Antes el guardado de una propiedad esperaba a enviar el
// newsletter a todos los suscriptores, uno por uno, y por eso el asesor veía
// que "se tardaba en subir la propiedad".
function runInBackground(label, task) {
  setImmediate(() => {
    Promise.resolve()
      .then(task)
      .catch((error) => console.error(`[Segundo plano] ${label}:`, error && error.message));
  });
}

// Catálogo LIGERO de propiedades para selects con búsqueda (citas, negocios,
// documentos, inventario, egresos). Devuelve solo _id, folio, tipo, operación y
// ubicación para no arrastrar el documento completo, y acepta ?q para filtrar
// en el servidor (escalable: el select nunca despliega toda la lista).
const options = asyncHandler(async (req, res) => {
  const filter = {};
  const and = [];
  // Un asesor ve sus propiedades y también las publicadas en el inventario
  // general (que es la misma lista que alimenta el selector de negocios). Un
  // jefe ve todas y puede acotar con ?asesor=.
  if (!isBoss(req)) {
    and.push({ $or: [{ responsibleUser: req.user._id }, { isPublished: true }] });
  } else if (req.query.asesor) {
    filter.responsibleUser = req.query.asesor;
  }
  if (req.query.operationType) filter.operationType = req.query.operationType;
  if (req.query.type) filter.type = req.query.type;

  const q = String(req.query.q || '').trim();
  if (q) {
    // La etiqueta visible se arma con varios campos ("Casa · Calle 1 ·
    // Colonia · Folio"), así que se busca por PALABRAS: cada palabra debe
    // existir en alguno de los campos. Antes se comparaba la frase completa
    // contra cada campo y por eso escribir la etiqueta literal no filtraba.
    const stopWords = new Set(['folio', 'propiedad', 'de', 'del', 'la', 'las', 'el', 'los', 'y', 'en']);
    const tokens = String(q)
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t && !stopWords.has(t.toLowerCase()));
    const fields = ['folio', 'type', 'operationType', 'zone', 'city', 'state', 'address'];
    if (tokens.length) {
      tokens.forEach((token) => {
        const term = String(token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        and.push({
          $or: fields.map((field) => ({ [field]: { $regex: term, $options: 'i' } })),
        });
      });
    } else {
      // Si solo escribió palabras vacías ("folio", "de la", etc.), se usa la
      // frase tal cual para no dejar la lista sin filtro.
      const term = String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      and.push({
        $or: fields.map((field) => ({ [field]: { $regex: term, $options: 'i' } })),
      });
    }
  }
  if (and.length) filter.$and = and;

  const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);
  const items = await Property.find(filter)
    .select('folio type operationType zone city state address')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  // `label`/`subtitle` ya armados para el select remoto. La CALLE va antes que
  // la colonia para distinguir propiedades parecidas de la misma zona.
  const data = items.map((p) => {
    const tipo = p.type
      ? String(p.type).charAt(0).toUpperCase() + String(p.type).slice(1)
      : '';
    const ubicacion = [p.zone, p.city].filter(Boolean).join(', ');
    const label = [tipo, p.address, ubicacion].filter(Boolean).join(' · ') || p.folio || 'Propiedad';
    return {
      ...p,
      label,
      subtitle: p.folio ? `Folio ${p.folio}` : '',
    };
  });

  res.json({ success: true, data });
});

// Avisa a los clientes cuyo embudo/intención y presupuesto coinciden con la
// propiedad.
//
// `excludeUserId` es quien publicó la propiedad: NUNCA debe recibir el aviso de
// su propia publicación (era la causa de que al asesor le llegara el aviso de
// "nueva propiedad" que él mismo había generado).
async function notifyInterestedClients(property, excludeUserId) {
  if (!NOTIFY_INTERESTED_CLIENTS) return 0;
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
  const body = { ...(req.body || {}) };
  if (body.photos !== undefined) body.photos = normalizePhotos(body.photos);
  // El asesor responsable siempre debe ser el usuario que sube la propiedad
  body.responsibleUser = req.user._id;

  const requestedFolio = body.folio;
  let property = null;
  let lastErr = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      let folioToUse;
      if (attempt === 0) {
        folioToUse = await resolveUniqueFolio(requestedFolio);
      } else {
        folioToUse = await resolveUniqueFolio(requestedFolio ? `${requestedFolio}-${attempt + 1}` : '');
      }
      const createBody = { ...body, folio: folioToUse };
      property = await Property.create(createBody);
      break;
    } catch (err) {
      lastErr = err;
      if (isFolioDuplicateError(err)) {
        continue;
      }
      await deletePhotosFromStorage(body.photos);
      throw err;
    }
  }
  if (!property) {
    await deletePhotosFromStorage(body.photos);
    if (lastErr) throw lastErr;
    throw new Error('No se pudo generar un folio único para la propiedad');
  }
  await logActivity({
    entityType: 'Property',
    entityId: property._id,
    user: req.user._id,
    action: 'creacion',
    message: `Se registró la propiedad (${property.type} en ${property.zone || property.city || 'sin ubicación'})`,
  });

  // Si se registró ya compartida, aparece de inmediato en el inventario general.
  if (property.isPublished) {
    await syncInventoryOnPublish(property, true, property.responsibleUser);
  }

  // Se responde YA con la propiedad creada. Los correos/avisos secundarios se
  // procesan en segundo plano para que el asesor no tenga que esperar (y pueda
  // cerrar la ventana) mientras se subieron las fotos.
  res.status(201).json({ success: true, data: property });

  runInBackground('avisos de propiedad creada', async () => {
    await notifyInterestedClients(property, req.user._id);
    await notifyNewsletter(property);
    if (property.isPublished) await notifyAdvisorPublished(property, 0);
  });
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

  const body = req.body ? { ...req.body } : {};
  if (body.responsibleUser === undefined) {
    // No cambiar el responsable si no viene explícito; pero para asegurar
    // consistencia con la solicitud, si es el propio usuario se mantiene
  }

  Object.assign(property, body);
  if (req.body.photos !== undefined) property.photos = normalizePhotos(req.body.photos);

  if (req.body.price !== undefined && Number(req.body.price) !== previousPrice) {
    property.priceHistory.push({
      price: Number(req.body.price),
      date: new Date(),
      user: req.user._id,
    });
  }

  if (req.body.folio !== undefined) {
    const requestedFolio = req.body.folio;
    if (normalizeFolio(requestedFolio) !== String(property.folio || '').trim()) {
      let saved = null;
      let lastErr = null;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
          let folioToUse;
          if (attempt === 0) {
            folioToUse = await resolveUniqueFolio(requestedFolio, property._id);
          } else {
            folioToUse = await resolveUniqueFolio(requestedFolio ? `${requestedFolio}-${attempt + 1}` : '', property._id);
          }
          property.folio = folioToUse;
          await property.save();
          saved = property;
          break;
        } catch (err) {
          lastErr = err;
          if (isFolioDuplicateError(err)) {
            continue;
          }
          throw err;
        }
      }
      if (!saved) {
        if (lastErr) throw lastErr;
        throw new Error('No se pudo actualizar el folio');
      }
    } else {
      await property.save();
    }
  } else {
    await property.save();
  }

  const nowPublished = Boolean(property.isPublished);
  const justPublished = nowPublished && !previousPublished;
  if (nowPublished !== previousPublished) {
    await syncInventoryOnPublish(property, nowPublished, req.body.assignedAgent || property.responsibleUser);
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

  // Publicar desde la edición avisa a clientes interesados y al asesor, pero
  // sin retrasar la respuesta (el envío de correos puede tardar varios segundos).
  if (justPublished) {
    runInBackground('avisos de publicación', async () => {
      const interesados = await notifyInterestedClients(property, req.user._id);
      await notifyNewsletter(property);
      await notifyAdvisorPublished(property, interesados);
    });
  }
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

  const justPublished = isPublished && !previousPublished;

  await logActivity({
    entityType: 'Property',
    entityId: property._id,
    user: req.user._id,
    action: isPublished ? 'publicar' : 'despublicar',
    message: isPublished ? 'Propiedad publicada en inventario' : 'Propiedad despublicada',
  });

  // Con la generación de avisos "nueva_propiedad" desactivada, esta llamada
  // devuelve 0 de inmediato. Se conserva para poder reactivarla con
  // NOTIFY_INTERESTED_CLIENTS=true.
  const notified = isPublished ? await notifyInterestedClients(property, req.user._id) : 0;

  res.json({
    success: true,
    message: isPublished ? 'Propiedad publicada' : 'Propiedad despublicada',
    notifiedClients: notified,
    data: property,
  });

  // El newsletter y el correo al asesor se envían después de responder.
  if (justPublished) {
    runInBackground('avisos de publicación', async () => {
      await notifyNewsletter(property);
      await notifyAdvisorPublished(property, notified);
    });
  }
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

module.exports = { list, get, options, create, update, remove, togglePublish, market, uploadPhotos, notifyInterestedClients };
