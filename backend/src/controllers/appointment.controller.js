'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const buildCrud = require('../utils/crud');
const { isBoss, isCustomRole, hasPermission } = require('../utils/scope');
const { Appointment, Task, User, Property } = require('../models');
const { googleCreateEvent } = require('./calendar.controller');
const { ensure } = require('../services/notification.service');
const { formatFechaHora } = require('../utils/datetime');

// Sincroniza un evento recién creado al Google Calendar del usuario, SOLO si
// tiene la integración activa. Nunca interrumpe la creación (fire-and-forget).
async function syncToGoogle(doc, req, type) {
  if (!doc || !req || !req.user) return;
  const user = await User.findById(req.user._id).select('+googleCalendar.accessToken +googleCalendar.refreshToken');
  const gc = (user && user.googleCalendar) || {};
  if (!gc.refreshToken || !gc.syncEnabled) return;
  const start = doc.date instanceof Date ? doc.date : new Date(doc.date);
  if (isNaN(start.getTime())) return;
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  let summary = '';
  let description = '';
  let location = '';
  if (type === 'task') {
    summary = `Tarea: ${doc.title}`;
    description = doc.description || '';
  } else {
    summary = `Cita${doc.type ? ` (${doc.type.replace(/_/g, ' ')})` : ''}`;
    description = doc.notes || '';
    location = doc.place || '';
  }
  await googleCreateEvent(user, { summary, description, start, end, location });
}

const appointmentCrud = buildCrud(Appointment, {
  populate: ['client', 'user', 'business', 'property'],
  searchFields: ['place', 'notes'],
  ownerField: 'user',
  widePermission: 'appointments_manage',
  // Permite filtrar el listado por cliente, propiedad o negocio desde la barra
  // de filtros (los selects con búsqueda remota envían ?client=…).
  extraFilters: { client: 'client', property: 'property', business: 'business', type: 'type' },
  // La cita SIEMPRE pertenece al asesor de la sesión, aunque el formulario
  // (o una llamada externa) intente enviar otro `user`: el asesor se asigna
  // automáticamente y no se puede delegar la cita a otro desde el alta.
  beforeCreate: (body, req) => {
    if (req.user && req.user._id) body.user = req.user._id;
    return body;
  },
  afterCreate: async (doc, req) => {
    await syncToGoogle(doc, req, 'appointment').catch(() => {});
    const ownerId = doc.user && (doc.user._id || doc.user);
    if (ownerId) {
      await ensure({
        type: 'cita_proxima',
        key: `appointment-${doc._id}`,
        title: 'Cita agendada',
        message: `Tienes una cita${doc.type ? ` (${doc.type.replace(/_/g, ' ')})` : ''} el ${formatFechaHora(doc.date)}.`,
        userId: ownerId,
        data: { entityId: doc._id, date: doc.date },
      }).catch(() => {});
    }

    // Aviso al captador: el responsable de la propiedad seleccionada debe
    // enterarse de que se agendó una visita, aunque la cita la haya creado
    // otro asesor (por ejemplo desde el inventario general).
    const propertyId = doc.property && (doc.property._id || doc.property);
    if (!propertyId) return;
    const property = await Property.findById(propertyId)
      .select('responsibleUser title type zone city')
      .populate('responsibleUser', 'name')
      .lean()
      .catch(() => null);
    const captadorId = property && property.responsibleUser && (property.responsibleUser._id || property.responsibleUser);
    if (!captadorId || String(captadorId) === String(ownerId)) return;
    await ensure({
      type: 'cita_propiedad_captador',
      key: `appointment-captador-${doc._id}`,
      title: 'Cita en tu propiedad',
      message: `Se agendó una cita en tu propiedad para el ${formatFechaHora(doc.date)}.`,
      userId: captadorId,
      data: { entityId: doc._id, propertyId, date: doc.date },
    }).catch(() => {});
  },
});

const taskCrud = buildCrud(Task, {
  populate: ['assignedTo', 'client', 'business', 'property'],
  searchFields: ['title', 'description'],
  ownerField: 'assignedTo',
  widePermission: 'tasks_manage',
  // Filtro por cliente/propiedad/negocio desde la barra de filtros.
  extraFilters: { client: 'client', property: 'property', business: 'business' },
  afterCreate: async (doc, req) => {
    await syncToGoogle(doc, req, 'task').catch(() => {});
    const assigneeId = doc.assignedTo && (doc.assignedTo._id || doc.assignedTo);
    if (!assigneeId) return;
    await ensure({
      type: 'nueva_tarea',
      key: `newtask-${doc._id}`,
      title: 'Nueva tarea',
      message: `Te asignaron la tarea "${doc.title}".`,
      userId: assigneeId,
      data: { entityId: doc._id, date: doc.date },
    }).catch(() => {});
  },
});

const changeTaskStatus = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ success: false, message: 'Tarea no encontrada' });

  if (!isBoss(req) && !(isCustomRole(req) && hasPermission(req, 'tasks_manage'))
    && String(task.assignedTo) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a esta tarea.' });
  }

  task.status = req.body.status;
  if (req.body.status === 'completada') task.completedAt = new Date();
  await task.save();

  res.json({ success: true, message: 'Estado de la tarea actualizado', data: task });
});

module.exports = {
  appointments: appointmentCrud,
  tasks: taskCrud,
  changeTaskStatus,
};
