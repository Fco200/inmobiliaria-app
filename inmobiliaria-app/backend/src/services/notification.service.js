'use strict';

const {
  Notification,
  Appointment,
  Task,
  Goal,
  Document,
  Business,
  Property,
  Client,
  User,
  Inventory,
} = require('../models');

let ioRef = null;

// Permite inyectar la instancia de Socket.IO desde el arranque (server.js) para
// poder emitir los avisos nuevos en tiempo real a cada usuario.
function setIo(io) {
  ioRef = io;
}

// Emite el aviso nuevo en tiempo real al usuario dueño (Socket.IO).
function emitNew(doc) {
  try {
    if (!ioRef) return;
    ioRef.to(`user:${String(doc.user)}`).emit('new-notification', {
      _id: doc._id,
      type: doc.type,
      title: doc.title,
      message: doc.message,
      read: !!doc.read,
      createdAt: doc.createdAt,
    });
  } catch (e) {
    console.error('[Notificacion] Error emitiendo aviso en tiempo real:', e.message);
  }
}

async function ensure({ type, key, title, message, userId, data }) {
  const existing = await Notification.findOne({ user: userId, type, 'data.key': key });
  if (existing) return existing;
  const doc = await Notification.create({ user: userId, type, title, message, data: { key, ...data } });
  emitNew(doc);
  return doc;
}

// Crea varios avisos de una sola vez. Antes se creaban de uno en uno y cada
// uno hacía 2 viajes a MongoDB (findOne + create): con 50+ usuarios eso
// saturaba el pool de conexiones. Ahora los existentes se resuelven en UNA
// consulta y los nuevos se crean en paralelo.
//
// IMPORTANTE: se sigue usando Notification.create() (y no insertMany) para que
// se dispare el hook post('save') del modelo, que es el que envía la
// notificación push nativa al celular.
async function ensureMany(userId, items) {
  if (!items || !items.length) return [];
  try {
    const types = Array.from(new Set(items.map((i) => i.type)));
    const keys = items.map((i) => i.key);
    const existing = await Notification.find({
      user: userId,
      type: { $in: types },
      'data.key': { $in: keys },
    })
      .select('type data')
      .lean();

    const existingKeys = new Set(
      existing.map((d) => `${d.type}::${d.data && d.data.key}`)
    );
    const pending = items.filter((i) => !existingKeys.has(`${i.type}::${i.key}`));
    if (!pending.length) return [];

    const docs = await Promise.all(
      pending.map((item) =>
        Notification.create({
          user: userId,
          type: item.type,
          title: item.title,
          message: item.message,
          data: { key: item.key, ...(item.data || {}) },
        }).catch((error) => {
          console.error(`[Notificacion] Error creando aviso ${item.type}:`, error.message);
          return null;
        })
      )
    );

    const created = docs.filter(Boolean);
    created.forEach(emitNew);
    return created;
  } catch (error) {
    console.error('[Notificacion] Error en ensureMany:', error.message);
    return [];
  }
}

// Push NATIVO directo (sin crear un aviso en la lista de la app) para eventos
// de equipo o de alta frecuencia (anuncios, reuniones, mensajes de grupo). Así
// llegan AL CELULAR aunque el dispositivo esté bloqueado o la app cerrada.
// Nunca rompe el flujo que lo invoca.
async function pushNative(userIds, { title, body, url, tag, icon } = {}) {
  try {
    const push = require('./push.service');
    const ids = Array.from(new Set((userIds || []).filter(Boolean).map((id) => String(id))));
    if (!ids.length) return { sent: 0, total: 0 };
    const results = await Promise.all(
      ids.map((id) =>
        push
          .notifyUser(id, {
            title: String(title || 'INMOBLES'),
            body: String(body || ''),
            url: url || '/',
            tag: tag ? String(tag) : '',
            icon: icon || undefined,
          })
          .catch(() => null)
      )
    );
    return { sent: results.filter(Boolean).length, total: ids.length };
  } catch (error) {
    return { sent: 0, total: 0 };
  }
}

const DATE_OPTS = { hour: '2-digit', minute: '2-digit' };

async function generateForUser(userId) {
  const now = new Date();
  const created = [];
  // Todos los avisos candidatos se armed aquí y se crean de un solo lote.
  const items = [];

  // Las consultas se lanzan EN PARALELO: antes se ejecutaban una detrás de
  // otra (~15 round-trips a MongoDB por usuario). Con 50+ usuarios eso
  // saturaba el pool de conexiones y el job se atrasaba.
  const [
    upcoming24h,
    upcoming1h,
    upcoming,
    expiredAppointments,
    overdue,
    nearTasks,
    nearGoals,
    pendingDocs,
    slowStages,
    staleBusinesses,
    newlyCancelled,
    newProspects,
    apartadas,
    unpublishedInventory,
  ] = await Promise.all([
    // Recordatorio 1: 24 horas antes
    Appointment.find({
      user: userId,
      status: { $in: ['pendiente', 'confirmada'] },
      date: { $gte: new Date(now.getTime() + 23 * 60 * 60 * 1000), $lte: new Date(now.getTime() + 25 * 60 * 60 * 1000) },
    }).populate('client'),
    // Recordatorio 2: 1 hora antes
    Appointment.find({
      user: userId,
      status: { $in: ['pendiente', 'confirmada'] },
      date: { $gte: new Date(now.getTime() + 55 * 60 * 1000), $lte: new Date(now.getTime() + 65 * 60 * 1000) },
    }).populate('client'),
    // Cita próxima (24 horas)
    Appointment.find({
      user: userId,
      status: { $in: ['pendiente', 'confirmada'] },
      date: { $gte: now, $lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
    }).populate('client'),
    // Vencimientos: citas cuya fecha ya pasó y siguen sin marcar su resultado.
    Appointment.find({
      user: userId,
      status: { $in: ['pendiente', 'confirmada'] },
      date: { $lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    }).populate('client'),
    // Tareas vencidas.
    Task.find({
      assignedTo: userId,
      status: { $in: ['pendiente', 'en_proceso'] },
      date: { $lt: now },
    }),
    // Recordatorio de tarea próxima (próximas 2 horas).
    Task.find({
      assignedTo: userId,
      status: { $in: ['pendiente', 'en_proceso'] },
      date: { $gte: now, $lte: new Date(now.getTime() + 2 * 60 * 60 * 1000) },
    }),
    // Metas que vencen esta semana.
    Goal.find({
      user: userId,
      status: 'activa',
      endDate: { $lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), $gte: now },
    }),
    // Documentos pendientes de validar.
    Document.find({ status: 'pendiente', uploadedBy: userId }),
    // Negocios estancados en etapas que requieren acción.
    Business.find({
      mainAdvisor: userId,
      status: 'activo',
      currentStage: { $in: ['avaluo', 'firma', 'pago'] },
      updatedAt: { $lt: new Date(now.getTime() - 48 * 60 * 60 * 1000) },
    }),
    // Negocios sin actualización en 7 días.
    Business.find({
      mainAdvisor: userId,
      status: 'activo',
      updatedAt: { $lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
    }),
    // Negocios cancelados en las últimas 24 horas.
    Business.find({
      mainAdvisor: userId,
      status: 'cancelado',
      updatedAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    }),
    // Prospectos nuevos del último día.
    Client.find({
      asesorAsignado: userId,
      status: 'activo',
      createdAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    }),
    // Propiedades apartadas a cargo del usuario.
    Property.find({ status: 'apartada', responsibleUser: userId }),
    // Stock: propiedades del inventario del usuario sin publicar hace +7 días.
    Inventory.find({ assignedAgent: userId }).populate('property'),
  ]);

  for (const app of upcoming24h) {
    items.push({
      type: 'cita_recordatorio_24h',
      key: `appointment-24h-${app._id}`,
      title: 'Recordatorio: Cita en 24 horas',
      message: `Mañana tendrás una cita con ${app.client ? app.client.name : 'sin cliente'} a las ${app.date.toLocaleTimeString('es-MX', DATE_OPTS)}`,
      data: { entityId: app._id, date: app.date },
    });
  }

  for (const app of upcoming1h) {
    items.push({
      type: 'cita_recordatorio_1h',
      key: `appointment-1h-${app._id}`,
      title: '¡Cita en 1 hora!',
      message: `Tu cita con ${app.client ? app.client.name : 'sin cliente'} es a las ${app.date.toLocaleTimeString('es-MX', DATE_OPTS)}`,
      data: { entityId: app._id, date: app.date },
    });
  }

  for (const app of upcoming) {
    items.push({
      type: 'cita_proxima',
      key: `appointment-${app._id}`,
      title: 'Cita próxima',
      message: `Cita: ${app.client ? app.client.name : 'sin cliente'} el ${app.date.toLocaleDateString('es-MX')} a las ${app.date.toLocaleTimeString('es-MX', DATE_OPTS)}`,
      data: { entityId: app._id, date: app.date },
    });
  }

  for (const app of expiredAppointments) {
    items.push({
      type: 'cita_vencida',
      key: `appointment-expired-${app._id}`,
      title: 'Cita sin avance',
      message: `La cita con ${app.client ? app.client.name : 'sin cliente'} del ${app.date.toLocaleDateString('es-MX')} ya pasó y sigue sin registrar resultado.`,
      data: { entityId: app._id, date: app.date },
    });
  }

  for (const t of overdue) {
    items.push({
      type: 'tarea_vencida',
      key: `task-${t._id}`,
      title: 'Tarea vencida',
      message: `La tarea "${t.title}" venció el ${t.date.toLocaleDateString('es-MX')}.`,
      data: { entityId: t._id, date: t.date },
    });
  }

  for (const t of nearTasks) {
    items.push({
      type: 'tarea_proxima',
      key: `task-near-${t._id}`,
      title: 'Tarea próxima',
      message: `Tienes la tarea "${t.title}" a las ${t.date.toLocaleTimeString('es-MX', DATE_OPTS)}.`,
      data: { entityId: t._id, date: t.date },
    });
  }

  for (const g of nearGoals) {
    items.push({
      type: 'meta_proxima_vencer',
      key: `goal-${g._id}`,
      title: 'Meta próxima a vencer',
      message: `La meta "${g.name}" vence el ${g.endDate.toLocaleDateString('es-MX')}.`,
      data: { entityId: g._id, date: g.endDate },
    });
  }

  for (const d of pendingDocs) {
    items.push({
      type: 'documento_pendiente',
      key: `document-${d._id}`,
      title: 'Documento pendiente',
      message: `El documento "${d.name}" sigue pendiente de validar.`,
      data: { entityId: d._id },
    });
  }

  for (const b of slowStages) {
    const typeMap = { avaluo: 'avaluo_pendiente', firma: 'firma_pendiente', pago: 'pago_pendiente' };
    items.push({
      type: typeMap[b.currentStage],
      key: `business-${b._id}`,
      title: `${b.currentStage.charAt(0).toUpperCase() + b.currentStage.slice(1)} pendiente`,
      message: `El negocio "${b.name}" lleva más de 48 horas en la etapa de ${b.currentStage}.`,
      data: { entityId: b._id },
    });
  }

  for (const b of staleBusinesses) {
    items.push({
      type: 'negocio_sin_actualizacion',
      key: `stale-${b._id}`,
      title: 'Negocio sin actualizar',
      message: `El negocio "${b.name}" no se actualiza desde hace más de 7 días.`,
      data: { entityId: b._id },
    });
  }

  for (const b of newlyCancelled) {
    items.push({
      type: 'negocio_cancelado',
      key: `cancelled-${b._id}`,
      title: 'Negocio cancelado',
      message: `El negocio "${b.name}" fue cancelado.`,
      data: { entityId: b._id },
    });
  }

  for (const c of newProspects) {
    items.push({
      type: 'nuevo_prospecto',
      key: `prospect-${c._id}`,
      title: 'Nuevo prospecto',
      message: `Se registró el prospecto ${c.name}.`,
      data: { entityId: c._id },
    });
  }

  for (const p of apartadas) {
    items.push({
      type: 'propiedad_apartada',
      key: `apartada-${p._id}`,
      title: 'Propiedad apartada',
      message: `La propiedad en ${p.zone || ''} ${p.city || ''} está marcada como apartada.`,
      data: { entityId: p._id },
    });
  }

  for (const inv of unpublishedInventory) {
    if (inv.isPublished) continue;
    const since = inv.unpublishedAt || inv.createdAt;
    const days = Math.floor((now.getTime() - new Date(since).getTime()) / (24 * 60 * 60 * 1000));
    if (!since || days < 7) continue;
    const prop = inv.property || {};
    items.push({
      type: 'propiedad_sin_publicar',
      key: `inv-unpublished-${inv._id}`,
      title: 'Propiedad sin publicar',
      message: `La propiedad en ${prop.zone || ''} ${prop.city || ''} lleva ${days} días en tu inventario sin publicar.`,
      data: { entityId: inv.property ? inv.property._id : null },
    });
  }

  // Todos los avisos se crean en un solo lote: se resuelve en UNA consulta
  // cuáles ya existían y los nuevos se insertan en paralelo.
  const createdDocs = await ensureMany(userId, items);
  created.push(...createdDocs.map((doc) => doc.type));

  return created;
}

// Genera avisos automáticos para todos los usuarios del sistema (job programado).
// Los usuarios se procesan con CONCURRENCIA LIMITADA (no uno por uno): con 50+
// usuarios en el equipo el job secuencial tardaba minutos y bloqueaba el pool
// de conexiones de MongoDB durante todo ese tiempo.
const USER_BATCH_SIZE = 8;

async function generateForAllUsers() {
  const users = await User.find({ status: { $ne: 'inactivo' } }).select('_id');
  const totals = { users: users.length, notifications: 0 };

  for (let i = 0; i < users.length; i += USER_BATCH_SIZE) {
    const batch = users.slice(i, i + USER_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (u) => {
        try {
          const created = await generateForUser(u._id);
          return created.length;
        } catch (error) {
          console.error(`[NotificationJob] Error para el usuario ${u._id}:`, error.message);
          return 0;
        }
      })
    );
    totals.notifications += results.reduce((sum, n) => sum + n, 0);
  }
  return totals;
}

module.exports = { generateForUser, generateForAllUsers, setIo, ensure, ensureMany, pushNative };
