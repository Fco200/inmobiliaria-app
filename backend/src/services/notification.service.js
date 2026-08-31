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
} = require('../models');

let ioRef = null;

// Permite inyectar la instancia de Socket.IO desde el arranque (server.js) para
// poder emitir los avisos nuevos en tiempo real a cada usuario.
function setIo(io) {
  ioRef = io;
}

async function ensure({ type, key, title, message, userId, data }) {
  const existing = await Notification.findOne({ user: userId, type, 'data.key': key });
  if (existing) return existing;
  const doc = await Notification.create({ user: userId, type, title, message, data: { key, ...data } });
  try {
    if (ioRef) ioRef.to(`user:${String(userId)}`).emit('new-notification', {
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
  return doc;
}

const DATE_OPTS = { hour: '2-digit', minute: '2-digit' };

async function generateForUser(userId) {
  const now = new Date();
  const created = [];

  // Recordatorio 1: 24 horas antes
  const upcoming24h = await Appointment.find({
    user: userId,
    status: { $in: ['pendiente', 'confirmada'] },
    date: { $gte: new Date(now.getTime() + 23 * 60 * 60 * 1000), $lte: new Date(now.getTime() + 25 * 60 * 60 * 1000) },
  }).populate('client');
  for (const app of upcoming24h) {
    await ensure({
      type: 'cita_recordatorio_24h',
      key: `appointment-24h-${app._id}`,
      title: 'Recordatorio: Cita en 24 horas',
      message: `Mañana tendrás una cita con ${app.client ? app.client.name : 'sin cliente'} a las ${app.date.toLocaleTimeString('es-MX', DATE_OPTS)}`,
      userId,
      data: { entityId: app._id, date: app.date },
    });
    created.push('cita_recordatorio_24h');
  }

  // Recordatorio 2: 1 hora antes
  const upcoming1h = await Appointment.find({
    user: userId,
    status: { $in: ['pendiente', 'confirmada'] },
    date: { $gte: new Date(now.getTime() + 55 * 60 * 1000), $lte: new Date(now.getTime() + 65 * 60 * 1000) },
  }).populate('client');
  for (const app of upcoming1h) {
    await ensure({
      type: 'cita_recordatorio_1h',
      key: `appointment-1h-${app._id}`,
      title: '¡Cita en 1 hora!',
      message: `Tu cita con ${app.client ? app.client.name : 'sin cliente'} es a las ${app.date.toLocaleTimeString('es-MX', DATE_OPTS)}`,
      userId,
      data: { entityId: app._id, date: app.date },
    });
    created.push('cita_recordatorio_1h');
  }

  // Cita próxima (24 horas)
  const upcoming = await Appointment.find({
    user: userId,
    status: { $in: ['pendiente', 'confirmada'] },
    date: { $gte: now, $lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
  }).populate('client');
  for (const app of upcoming) {
    await ensure({
      type: 'cita_proxima',
      key: `appointment-${app._id}`,
      title: 'Cita próxima',
      message: `Cita: ${app.client ? app.client.name : 'sin cliente'} el ${app.date.toLocaleDateString('es-MX')} a las ${app.date.toLocaleTimeString('es-MX', DATE_OPTS)}`,
      userId,
      data: { entityId: app._id, date: app.date },
    });
    created.push('cita_proxima');
  }

  const overdue = await Task.find({
    assignedTo: userId,
    status: { $in: ['pendiente', 'en_proceso'] },
    date: { $lt: now },
  });
  for (const t of overdue) {
    await ensure({
      type: 'tarea_vencida',
      key: `task-${t._id}`,
      title: 'Tarea vencida',
      message: `La tarea "${t.title}" venció el ${t.date.toLocaleDateString('es-MX')}.`,
      userId,
      data: { entityId: t._id, date: t.date },
    });
    created.push('tarea_vencida');
  }

  const nearGoals = await Goal.find({
    user: userId,
    status: 'activa',
    endDate: { $lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), $gte: now },
  });
  for (const g of nearGoals) {
    await ensure({
      type: 'meta_proxima_vencer',
      key: `goal-${g._id}`,
      title: 'Meta próxima a vencer',
      message: `La meta "${g.name}" vence el ${g.endDate.toLocaleDateString('es-MX')}.`,
      userId,
      data: { entityId: g._id, date: g.endDate },
    });
    created.push('meta_proxima_vencer');
  }

  const pendingDocs = await Document.find({ status: 'pendiente', uploadedBy: userId });
  for (const d of pendingDocs) {
    await ensure({
      type: 'documento_pendiente',
      key: `document-${d._id}`,
      title: 'Documento pendiente',
      message: `El documento "${d.name}" sigue pendiente de validar.`,
      userId,
      data: { entityId: d._id },
    });
    created.push('documento_pendiente');
  }

  const slowStages = await Business.find({
    mainAdvisor: userId,
    status: 'activo',
    currentStage: { $in: ['avaluo', 'firma', 'pago'] },
    updatedAt: { $lt: new Date(now.getTime() - 48 * 60 * 60 * 1000) },
  });
  for (const b of slowStages) {
    const typeMap = { avaluo: 'avaluo_pendiente', firma: 'firma_pendiente', pago: 'pago_pendiente' };
    await ensure({
      type: typeMap[b.currentStage],
      key: `business-${b._id}`,
      title: `${b.currentStage.charAt(0).toUpperCase() + b.currentStage.slice(1)} pendiente`,
      message: `El negocio "${b.name}" lleva más de 48 horas en la etapa de ${b.currentStage}.`,
      userId,
      data: { entityId: b._id },
    });
    created.push(typeMap[b.currentStage]);
  }

  const staleBusinesses = await Business.find({
    mainAdvisor: userId,
    status: 'activo',
    updatedAt: { $lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
  });
  for (const b of staleBusinesses) {
    await ensure({
      type: 'negocio_sin_actualizacion',
      key: `stale-${b._id}`,
      title: 'Negocio sin actualizar',
      message: `El negocio "${b.name}" no se actualiza desde hace más de 7 días.`,
      userId,
      data: { entityId: b._id },
    });
    created.push('negocio_sin_actualizacion');
  }

  const newlyCancelled = await Business.find({
    mainAdvisor: userId,
    status: 'cancelado',
    updatedAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
  });
  for (const b of newlyCancelled) {
    await ensure({
      type: 'negocio_cancelado',
      key: `cancelled-${b._id}`,
      title: 'Negocio cancelado',
      message: `El negocio "${b.name}" fue cancelado.`,
      userId,
      data: { entityId: b._id },
    });
    created.push('negocio_cancelado');
  }

  const newProspects = await Client.find({
    responsibleUser: userId,
    status: 'activo',
    createdAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
  });
  for (const c of newProspects) {
    await ensure({
      type: 'nuevo_prospecto',
      key: `prospect-${c._id}`,
      title: 'Nuevo prospecto',
      message: `Se registró el prospecto ${c.name}.`,
      userId,
      data: { entityId: c._id },
    });
    created.push('nuevo_prospecto');
  }

  const apartadas = await Property.find({ status: 'apartada', responsibleUser: userId });
  for (const p of apartadas) {
    await ensure({
      type: 'propiedad_apartada',
      key: `apartada-${p._id}`,
      title: 'Propiedad apartada',
      message: `La propiedad en ${p.zone || ''} ${p.city || ''} está marcada como apartada.`,
      userId,
      data: { entityId: p._id },
    });
    created.push('propiedad_apartada');
  }

  return created;
}

// Genera avisos automáticos para todos los usuarios del sistema (job programado).
async function generateForAllUsers() {
  const users = await User.find({ status: { $ne: 'inactivo' } }).select('_id');
  const totals = { users: users.length, notifications: 0 };
  for (const u of users) {
    try {
      const created = await generateForUser(u._id);
      totals.notifications += created.length;
    } catch (error) {
      console.error(`[NotificationJob] Error para el usuario ${u._id}:`, error.message);
    }
  }
  return totals;
}

module.exports = { generateForUser, generateForAllUsers, setIo, ensure };
