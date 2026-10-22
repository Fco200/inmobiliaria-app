'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const mongoose = require('mongoose');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const asyncHandler = require('../middlewares/asyncHandler');
const {
  User,
  Role,
  Permission,
  Config,
  Setting,
  ActivityLog,
  Client,
  Property,
  Inventory,
  Business,
  Appointment,
  Task,
  Goal,
  Expense,
  Document,
  Announcement,
  Notification,
  Session,
  Chat,
  PushSubscription,
} = require('../models');
const { persistAndBroadcast, getOrCreateGeneralChat, markChatAsRead } = require('./chat.controller');
const { jwtSecret, jwtExpiresIn } = require('../config/env');
const { logActivity } = require('../services/log.service');
const { createSession, revokeSessionByToken, hashToken } = require('../services/session.service');
const sessionService = require('../services/session.service');
const logger = require('../services/logger.service');
const maintenanceService = require('../services/maintenance.service');

const PLANTILLAS_DIR = path.join(__dirname, '../../..', 'plantillas');

const signSoporteToken = (userId, expiresIn = jwtExpiresIn) =>
  jwt.sign({ id: userId }, jwtSecret, { expiresIn });

// ── Autenticación de soporte técnico ────────────────────────────────────────
const soporteLogin = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res
      .status(400)
      .json({ success: false, message: 'Usuario y contraseña son obligatorios.' });
  }

  // El soporte técnico SIEMPRE es una credencial dedicada (SUPERADMIN). Se
  // valida directamente contra la colección de usuarios para que el panel de
  // soporte use la misma fuente de verdad que el resto del sistema.
  const user = await User.findOne({
    $or: [{ email: String(identifier).toLowerCase() }, { username: identifier }],
  })
    .select('+password +failedLoginAttempts +lockUntil')
    .populate('role');

  const isSoporte = user && user.role && user.role.code === 'superadmin';
  if (!user || !isSoporte) {
    return res.status(401).json({ success: false, message: 'Credenciales de soporte incorrectas' });
  }

  if (!(await user.comparePassword(password))) {
    await logActivity({
      entityType: 'User',
      entityId: user._id,
      user: user._id,
      action: 'soporte_login_fallido',
      message: `Intento de acceso a soporte fallido (${user.email})`,
    });
    return res.status(401).json({ success: false, message: 'Credenciales de soporte incorrectas' });
  }

  if (user.status !== 'activo') {
    return res.status(403).json({ success: false, message: 'El acceso de soporte está inactivo' });
  }

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  await logActivity({
    entityType: 'User',
    entityId: user._id,
    user: user._id,
    action: 'soporte_login',
    message: `Acceso al panel de soporte técnico (${user.email})`,
  });

  // Se firma un JWT de soporte y se crea una sesión revocable en la BD para
  // que el middleware `protect` valide correctamente las peticiones siguientes.
  const token = signSoporteToken(user._id);
  await createSession(user._id, token, req, { expiresInMs: 24 * 60 * 60 * 1000 });

  res.json({
    success: true,
    message: 'Sesión de soporte iniciada',
    token,
    data: {
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        photo: user.photo || '',
        role: { code: user.role.code, name: user.role.name },
      },
    },
  });
});

const soporteMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate('role');
  res.json({
    success: true,
    data: {
      id: user._id,
      name: user.name,
      username: user.username,
      email: user.email,
      photo: user.photo || '',
      role: { code: user.role.code, name: user.role.name },
    },
  });
});

// ── Control de usuarios ─────────────────────────────────────────────────────
const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const listarUsuarios = asyncHandler(async (req, res) => {
  const { q, status, role } = req.query;
  const filter = {};
  if (status === 'activo' || status === 'inactivo') filter.status = status;
  if (role) {
    const roleDoc = await Role.findOne({ code: String(role) }).select('_id');
    if (roleDoc) filter.role = roleDoc._id;
  }
  if (q && String(q).trim()) {
    const rx = new RegExp(escapeRegex(String(q).trim()), 'i');
    filter.$or = [{ name: rx }, { username: rx }, { email: rx }, { position: rx }];
  }

  const users = await User.find(filter)
    .populate('role', 'code name')
    .select('name username email phone photo position role status joinedAt lastLoginAt')
    .sort({ name: 1 })
    .lean();

  // Enriquecer cada fila con sesiones activas y dispositivos push, para que el
  // panel muestre de un vistazo quién está conectado y quién recibe avisos.
  const ids = users.map((u) => u._id);
  let sessionMap = new Map();
  let pushMap = new Map();
  if (ids.length) {
    const [sessions, pushes] = await Promise.all([
      Session.aggregate([
        { $match: { user: { $in: ids } } },
        { $group: { _id: '$user', count: { $sum: 1 }, lastSeenAt: { $max: '$lastSeenAt' } } },
      ]).catch(() => []),
      PushSubscription.aggregate([
        { $match: { user: { $in: ids } } },
        { $group: { _id: '$user', count: { $sum: 1 }, lastUsedAt: { $max: '$lastUsedAt' } } },
      ]).catch(() => []),
    ]);
    sessionMap = new Map(sessions.map((s) => [String(s._id), s]));
    pushMap = new Map(pushes.map((p) => [String(p._id), p]));
  }

  const data = users.map((u) => {
    const s = sessionMap.get(String(u._id));
    const p = pushMap.get(String(u._id));
    return {
      ...u,
      sessions: s ? s.count : 0,
      lastSeenAt: s ? s.lastSeenAt : null,
      pushDevices: p ? p.count : 0,
      pushLastUsedAt: p ? p.lastUsedAt : null,
    };
  });

  res.json({ success: true, data });
});

const actualizarUsuario = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, email, username, role, status, position, phone } = req.body;

  const user = await User.findById(id).select('+password');
  if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });

  // Protección: no se puede desactivar ni cambiar el rol del propio soporte.
  if (user.role && String(user.role) === String(req.user.role._id || req.user.role)) {
    // Permitimos cambios de perfil (nombre, teléfono) pero no de rol/status/email
    // que comprometan la cuenta de soporte.
    const protectedFields = ['role', 'status', 'email', 'username'];
    if (protectedFields.some((f) => req.body[f] !== undefined)) {
      return res.status(403).json({
        success: false,
        message: 'No se puede modificar el rol, estado o acceso del usuario de soporte.',
      });
    }
  }

  if (role) {
    const roleDoc = await Role.findById(role);
    if (!roleDoc) return res.status(400).json({ success: false, message: 'Rol inválido' });
    user.role = roleDoc._id;
  }
  if (name !== undefined) user.name = name;
  if (position !== undefined) user.position = position;
  if (phone !== undefined) user.phone = phone;
  if (email !== undefined) {
    const exists = await User.findOne({ email: String(email).toLowerCase(), _id: { $ne: user._id } });
    if (exists) return res.status(409).json({ success: false, message: 'Ya existe un usuario con ese correo' });
    user.email = String(email).toLowerCase();
  }
  if (username !== undefined) user.username = username;
  if (status !== undefined && ['activo', 'inactivo'].includes(status)) user.status = status;

  await user.save({ validateBeforeSave: false });

  // Si se desactiva un usuario, se cierran sus sesiones activas y se avisa a
  // los dispositivos conectados en tiempo real.
  if (status === 'inactivo') {
    await sessionService.revokeUserSessions(user._id, 'USER_DEACTIVATED');
  }

  await logActivity({
    entityType: 'User',
    entityId: user._id,
    user: req.user._id,
    action: 'actualizar_usuario',
    message: `Soporte actualizó al usuario ${user.email}`,
  });

  res.json({ success: true, message: 'Usuario actualizado', data: user._id });
});

// Restablecer contraseña de un usuario sin tocar la base de datos.
const restablecerPassword = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || String(newPassword).length < 8) {
    return res.status(400).json({
      success: false,
      message: 'La contraseña debe tener al menos 8 caracteres.',
    });
  }
  if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
    return res.status(400).json({
      success: false,
      message: 'La contraseña debe incluir mayúsculas, minúsculas y números.',
    });
  }

  const user = await User.findById(id);
  if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });

  if (user.role && String(user.role) === String(req.user.role._id || req.user.role)) {
    return res.status(403).json({ success: false, message: 'No se puede restablecer la contraseña del usuario de soporte.' });
  }

  user.password = newPassword;
  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  await user.save();

  // Invalida todas sus sesiones para que reingrese con la nueva contraseña,
  // cerrando los dispositivos activos en tiempo real.
  await sessionService.revokeUserSessions(user._id, 'PASSWORD_RESET');

  await logActivity({
    entityType: 'User',
    entityId: user._id,
    user: req.user._id,
    action: 'restablecer_password',
    message: `Soporte restableció la contraseña de ${user.email}`,
  });

  res.json({ success: true, message: 'Contraseña restablecida correctamente' });
});

// Elimina definitivamente una cuenta y limpia sus accesos. Se protege la cuenta
// de soporte, la propia sesión y el último administrador activo para no dejar
// el sistema sin administración.
const eliminarUsuario = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (String(id) === String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'No puedes eliminar tu propia cuenta de soporte.' });
  }

  const user = await User.findById(id).populate('role', 'code name');
  if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });

  const roleCode = user.role ? user.role.code : '';
  if (roleCode === 'superadmin') {
    return res.status(403).json({ success: false, message: 'No se puede eliminar una cuenta de soporte (SUPERADMIN).' });
  }

  if (roleCode === 'admin' && user.status === 'activo') {
    const adminRole = await Role.findOne({ code: 'admin' }).select('_id');
    if (adminRole) {
      const otrosActivos = await User.countDocuments({
        role: adminRole._id,
        status: 'activo',
        _id: { $ne: user._id },
      });
      if (otrosActivos < 1) {
        return res.status(403).json({
          success: false,
          message: 'No puedes eliminar al último administrador activo. Activa o asigna otro administrador primero.',
        });
      }
    }
  }

  const userId = user._id;
  const email = user.email;

  // Corta el acceso de inmediato: sesiones, avisos y dispositivos push.
  await sessionService.revokeUserSessions(userId, 'USER_DELETED').catch(() => {});
  const [sesiones, dispositivos, avisos] = await Promise.all([
    Session.deleteMany({ user: userId }).catch(() => ({ deletedCount: 0 })),
    PushSubscription.deleteMany({ user: userId }).catch(() => ({ deletedCount: 0 })),
    Notification.deleteMany({ user: userId }).catch(() => ({ deletedCount: 0 })),
  ]);

  // Quita al usuario de los chats para no dejar participantes inexistentes.
  await Chat.updateMany({ participants: userId }, { $pull: { participants: userId } }).catch(() => {});

  await user.deleteOne();

  await logActivity({
    entityType: 'User',
    entityId: userId,
    user: req.user._id,
    action: 'eliminar_usuario',
    message: `Soporte eliminó al usuario ${email}`,
    data: {
      email,
      sessions: sesiones.deletedCount || 0,
      pushDevices: dispositivos.deletedCount || 0,
      notifications: avisos.deletedCount || 0,
    },
  });

  logger.warn(`Usuario eliminado desde soporte: ${email}`, { por: req.user.email, userId: String(userId) }, 'soporte');

  res.json({
    success: true,
    message: `Usuario ${email} eliminado`,
    data: {
      id: userId,
      email,
      message: `Usuario ${email} eliminado`,
      sessions: sesiones.deletedCount || 0,
      pushDevices: dispositivos.deletedCount || 0,
      notifications: avisos.deletedCount || 0,
    },
  });
});

const listarRoles = asyncHandler(async (req, res) => {
  const roles = await Role.find().select('code name description isSystem');
  res.json({ success: true, data: roles });
});

// ── Variables y ajustes globales (Config) ───────────────────────────────────
const listarConfig = asyncHandler(async (req, res) => {
  const configs = await Config.find();
  res.json({ success: true, data: configs });
});

const guardarConfig = asyncHandler(async (req, res) => {
  const { key, value, description } = req.body;
  if (!key) return res.status(400).json({ success: false, message: 'La clave es obligatoria' });

  const config = await Config.findOneAndUpdate(
    { key },
    { value, description: description !== undefined ? description : undefined, updatedBy: req.user._id },
    { new: true, upsert: true }
  );

  await logActivity({
    entityType: 'Config',
    entityId: config._id,
    user: req.user._id,
    action: 'actualizar_config',
    message: `Soporte actualizó configuración ${key}`,
  });

  res.json({ success: true, message: 'Configuración guardada', data: config });
});

// ── Datos del soporte técnico (se muestran en la página de Ayuda) ───────────
// Estas claves viven en la colección Setting con prefijo `support.*`. Su edición
// es exclusiva del panel de soporte (SUPERADMIN); el administrador del CRM ya no
// puede modificar estos datos.
const SUPPORT_KEYS = [
  { key: 'support.name', prop: 'name' },
  { key: 'support.title', prop: 'title' },
  { key: 'support.whatsapp', prop: 'whatsapp' },
  { key: 'support.email', prop: 'email' },
  { key: 'support.facebook', prop: 'facebook' },
  { key: 'support.instagram', prop: 'instagram' },
  { key: 'support.photo', prop: 'photo' },
  { key: 'support.intro', prop: 'intro' },
];

const listarSoporteConfig = asyncHandler(async (req, res) => {
  const out = {};
  for (const { key, prop } of SUPPORT_KEYS) {
    const setting = await Setting.findOne({ key });
    out[prop] = setting ? setting.value : '';
  }
  res.json({ success: true, data: out });
});

const guardarSoporteConfig = asyncHandler(async (req, res) => {
  const body = req.body || {};

  for (const { key, prop } of SUPPORT_KEYS) {
    if (body[prop] === undefined) continue;
    let value = body[prop];
    if (value === null) value = '';
    await Setting.findOneAndUpdate(
      { key },
      { value: String(value).trim(), group: 'soporte', description: `Dato de soporte técnico (${prop})`, updatedBy: req.user._id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  await logActivity({
    entityType: 'Setting',
    entityId: req.user._id,
    user: req.user._id,
    action: 'actualizar_soporte_config',
    message: 'Soporte actualizó los datos de soporte técnico',
  });

  res.json({ success: true, message: 'Datos de soporte actualizados' });
});

// ── Modo mantenimiento ──────────────────────────────────────────────────────
// El estado vive en las variables globales Config gestionadas por el servicio
// mantenimiento.service.js (claves `mantenimiento.*`). Un middleware
// (middlewares/maintenance.js) intercepta las peticiones cuando está activo y
// bloquea a todos salvo SUPERADMIN/SOPORTE con código 503.

// GET /soporte/mantenimiento — estado actual (activo + mensaje + fecha + aviso).
const estadoMantenimiento = asyncHandler(async (req, res) => {
  const state = await maintenanceService.getState();
  res.json({
    success: true,
    data: {
      activo: state.activo,
      mantenimientoActivo: state.mantenimientoActivo,
      mensaje: state.mensaje,
      hasta: state.hasta || '',
      fechaProgramada: state.fechaProgramada,
      mostrarAvisoPrevio: state.mostrarAvisoPrevio,
      enCuentaRegresiva: state.enCuentaRegresiva,
      finCuentaRegresiva: state.finCuentaRegresiva,
    },
  });
});

// PUT /soporte/mantenimiento — prende/apaga el modo mantenimiento o programa
// uno futuro. Acepta `activo`, `mensaje`, `fechaProgramada` y `mostrarAvisoPrevio`.
const cambiarMantenimiento = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const state = await maintenanceService.saveState(
    {
      activo: body.activo !== undefined ? body.activo : undefined,
      mensaje: body.mensaje !== undefined ? body.mensaje : undefined,
      fechaProgramada: body.fechaProgramada !== undefined ? body.fechaProgramada : undefined,
      hasta: body.hasta !== undefined ? body.hasta : undefined,
      mostrarAvisoPrevio: body.mostrarAvisoPrevio !== undefined ? body.mostrarAvisoPrevio : undefined,
    },
    req.user._id
  );

  await logActivity({
    entityType: 'Config',
    entityId: req.user._id,
    user: req.user._id,
    action: state.activo ? 'mantenimiento_activado' : 'mantenimiento_desactivado',
    message: state.activo
      ? `Modo mantenimiento ACTIVADO (${state.mensaje || 'sin mensaje'})`
      : 'Modo mantenimiento desactivado',
  });

  logger.warn(`Modo mantenimiento ${state.activo ? 'ACTIVADO' : 'desactivado'} por ${req.user.email}`, {
    por: req.user.email,
    activo: state.activo,
    mensaje: state.mensaje,
    fechaProgramada: state.fechaProgramada,
    hasta: state.hasta,
    mostrarAvisoPrevio: state.mostrarAvisoPrevio,
  }, 'mantenimiento');

  const io = req.app.get('io');
  if (io) {
    if (state.activo) {
      io.emit('mantenimiento-iniciado', {
        mensaje: state.mensaje,
        fechaProgramada: state.fechaProgramada,
        hasta: state.hasta,
      });
      logger.info('Evento Socket.io emitido: mantenimiento-iniciado', {}, 'mantenimiento');
    } else {
      io.emit('mantenimiento-desactivado', {
        mensaje: state.mensaje,
      });
      logger.info('Evento Socket.io emitido: mantenimiento-desactivado', {}, 'mantenimiento');
    }
  }

  res.json({
    success: true,
    message: state.activo ? 'Modo mantenimiento activado' : 'Modo mantenimiento desactivado',
    data: {
      activo: state.activo,
      mantenimientoActivo: state.activo,
      mensaje: state.mensaje,
      hasta: state.hasta || '',
      fechaProgramada: state.fechaProgramada,
      mostrarAvisoPrevio: state.mostrarAvisoPrevio,
    },
  });
});

// ── Resumen / estado del sistema ────────────────────────────────────────────
const resumenSistema = asyncHandler(async (req, res) => {
  const dbState = mongoose.connection.readyState;
  const states = ['desconectado', 'conectado', 'conectando', 'desconectando'];

  const models = {
    usuarios: User,
    roles: Role,
    permisos: Permission,
    clientes: Client,
    propiedades: Property,
    inventario: Inventory,
    negocios: Business,
    citas: Appointment,
    tareas: Task,
    metas: Goal,
    gastos: Expense,
    documentos: Document,
    avisos: Announcement,
    sesiones: Session,
    chats: Chat,
    actividad: ActivityLog,
  };

  const counts = {};
  await Promise.all(
    Object.entries(models).map(async ([name, Model]) => {
      try { counts[name] = await Model.countDocuments(); } catch (e) { counts[name] = 0; }
    })
  );

  const roleStats = await User.aggregate([
    { $match: {} },
    {
      $group: {
        _id: { $ifNull: ['$role', null] },
        total: { $sum: 1 },
        activos: { $sum: { $cond: [{ $eq: ['$status', 'activo'] }, 1, 0] } },
      },
    },
  ]);

  const roleCodes = {};
  const roleDocs = await Role.find().select('code name');
  const roleMap = {};
  roleDocs.forEach((r) => { roleMap[String(r._id)] = { code: r.code, name: r.name }; });

  const usersByRole = {};
  roleStats.forEach((row) => {
    const key = row._id ? String(row._id) : 'sin-rol';
    const meta = roleMap[key] || { code: 'sin-rol', name: 'Sin rol' };
    usersByRole[meta.code] = { name: meta.name, total: row.total, activos: row.activos };
  });

  res.json({
    success: true,
    data: {
      fechas: {
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
      servidor: {
        hostname: os.hostname(),
        plataforma: `${os.type()} ${os.release()}`,
        arquitectura: os.arch(),
        memoriaTotal: os.totalmem(),
        memoriaLibre: os.freemem(),
        cpus: os.cpus().length,
      },
      baseDatos: {
        estado: states[dbState] || 'desconocido',
        nombre: mongoose.connection.name || 'n/d',
      },
      conteos: counts,
      usuariosPorRol: usersByRole,
      sesionesActivas: counts.sesiones,
    },
  });
});

// ── Gestión de sesiones (todo el equipo) ────────────────────────────────────
const listarSesionesSoporte = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
  const sessions = await Session.find()
    .sort({ lastSeenAt: -1 })
    .limit(limit)
    .populate({ path: 'user', select: 'name username email photo role', populate: { path: 'role', select: 'code name' } });

  const currentHash = hashToken(req.token);
  const data = sessions.map((s) => {
    const json = s.toJSON();
    const role = json.user && json.user.role ? json.user.role : null;
    return {
      ...json,
      role: role ? { code: role.code || '', name: role.name || role.code || '' } : null,
      isCurrent: s.tokenHash === currentHash,
    };
  });

  res.json({ success: true, data });
});

const revocarSesionSoporte = asyncHandler(async (req, res) => {
  const session = await Session.findById(req.params.id);
  if (!session) return res.status(404).json({ success: false, message: 'Sesión no encontrada' });

  const currentHash = hashToken(req.token);
  const isCurrent = session.tokenHash === currentHash;
  await sessionService.revokeSession(session, isCurrent ? 'SELF_REVOKED' : 'ADMIN_REVOKED');

  res.json({
    success: true,
    message: isCurrent ? 'Se cerró esta sesión' : 'Sesión cerrada',
    data: { selfRevoked: isCurrent },
  });
});

const revocarSesionesUsuarioSoporte = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });

  const currentHash = hashToken(req.token);
  const result = await sessionService.revokeUserSessionsExcept(user._id, currentHash, 'ADMIN_REVOKED');
  res.json({ success: true, message: 'Sesiones cerradas', data: { cerradas: result.closed } });
});

// ── Gestión de avisos / anuncios del equipo ─────────────────────────────────
const listarAnuncios = asyncHandler(async (req, res) => {
  const anuncios = await Announcement.find()
    .populate('author', 'name username email')
    .sort({ createdAt: -1 })
    .limit(100);
  res.json({ success: true, data: anuncios });
});

// Solicitudes de "olvidé mi contraseña" recibidas por el soporte (superadmin).
const listarSolicitudesPassword = asyncHandler(async (req, res) => {
  const solicitudes = await Notification.find({ user: req.user._id, type: 'olvido_contraseña' })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  res.json({ success: true, data: solicitudes });
});

const crearAnuncio = asyncHandler(async (req, res) => {
  const title = String((req.body && req.body.title) || '').trim().slice(0, 200);
  const message = String((req.body && req.body.message) || '').trim().slice(0, 2000);
  const priority = (req.body && req.body.priority) || 'normal';
  let expiresAt = (req.body && req.body.expiresAt) || null;
  if (expiresAt) {
    expiresAt = new Date(expiresAt);
    if (Number.isNaN(expiresAt.getTime())) expiresAt = null;
  }

  if (!title) return res.status(400).json({ success: false, message: 'El título es obligatorio' });
  if (!message) return res.status(400).json({ success: false, message: 'El mensaje es obligatorio' });
  if (!['normal', 'importante', 'urgente'].includes(priority)) {
    return res.status(400).json({ success: false, message: 'Prioridad inválida' });
  }

  const anuncio = await Announcement.create({
    title,
    message,
    priority,
    author: req.user._id,
    readBy: [req.user._id],
    expiresAt,
  });
  const populated = await anuncio.populate('author', 'name username email');

  const io = req.app.get('io');
  if (io) io.emit('new-announcement', populated);

  await logActivity({
    entityType: 'Announcement',
    entityId: anuncio._id,
    user: req.user._id,
    action: 'crear_aviso',
    message: `Soporte publicó aviso: ${title}`,
  });

  res.status(201).json({ success: true, data: populated });
});

const eliminarAnuncio = asyncHandler(async (req, res) => {
  const anuncio = await Announcement.findByIdAndDelete(req.params.id);
  if (!anuncio) return res.status(404).json({ success: false, message: 'Aviso no encontrado' });

  const io = req.app.get('io');
  if (io) io.emit('delete-announcement', { id: req.params.id });

  await logActivity({
    entityType: 'Announcement',
    entityId: req.params.id,
    user: req.user._id,
    action: 'eliminar_aviso',
    message: `Soporte eliminó aviso: ${anuncio.title}`,
  });

  res.json({ success: true, message: 'Aviso eliminado' });
});

// ── Roles y permisos ────────────────────────────────────────────────────────
const listarRolesPermisos = asyncHandler(async (req, res) => {
  const [roles, permisos] = await Promise.all([
    Role.find().populate('permissions', 'code name module').sort({ code: 1 }),
    Permission.find().sort({ module: 1, code: 1 }),
  ]);

  res.json({ success: true, data: { roles, permisos } });
});

// ── Visor de logs y errores ─────────────────────────────────────────────────
const listarLogs = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

  const url = require('url');
  const pathname = url.parse(req.originalUrl).pathname;

  if (pathname.endsWith('/errors')) {
    const logs = await ActivityLog.find({ action: /error/i })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('user', 'name email');
    return res.json({ success: true, data: logs });
  }

  const logs = await ActivityLog.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('user', 'name email');
  res.json({ success: true, data: logs });
});

// ── Visor de logs en tiempo real (sistema/servidor) ────────────────────────
// Lee el buffer circular en memoria del proceso (errores de consultas, caídas
// de Socket.io, fallas en PDFs, etc.). Acepta filtro por nivel (ERROR, WARN,
// INFO) y devuelve los últimos 100 por defecto.
const listarLogsSistema = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const level = String(req.query.level || '').toUpperCase();
  const logs = logger.getLogs({ limit, level });
  res.json({ success: true, data: logs });
});

// DELETE — limpia el buffer de logs en tiempo real.
const limpiarLogsSistema = asyncHandler(async (req, res) => {
  const borrados = logger.clear();
  await logActivity({
    entityType: 'System',
    entityId: req.user._id,
    user: req.user._id,
    action: 'limpiar_logs',
    message: `Soporte limpió el visor de logs en tiempo real (${borrados} registros)`,
  });
  logger.info('Visor de logs en tiempo real limpiado', { borrados }, 'logs');
  res.json({ success: true, message: 'Logs limpiados', data: { borrados } });
});


// ── Respaldos / Backups ─────────────────────────────────────────────────────
const generarRespaldo = asyncHandler(async (req, res) => {
  const collections = {};
  const entidades = {
    usuarios: User,
    roles: Role,
    permisos: Permission,
    clientes: Client,
    propiedades: Property,
    inventario: Inventory,
    negocios: Business,
    citas: Appointment,
    tareas: Task,
    metas: Goal,
    gastos: Expense,
    documentos: Document,
    avisos: Announcement,
    chats: Chat,
    actividad: ActivityLog,
    configuracion: Config,
    ajustes: Setting,
  };

  await Promise.all(
    Object.entries(entidades).map(async ([name, Model]) => {
      try { collections[name] = await Model.find().lean(); } catch (e) { collections[name] = []; }
    })
  );

  const backup = {
    generadoEl: new Date().toISOString(),
    sistema: 'INMOBILIARIA CRM',
    conteos: Object.fromEntries(
      Object.entries(collections).map(([k, v]) => [k, v.length])
    ),
    datos: collections,
  };

  const fileName = `respaldo_${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(Buffer.from(JSON.stringify(backup, null, 2)));

  await logActivity({
    entityType: 'System',
    entityId: req.user._id,
    user: req.user._id,
    action: 'respaldo',
    message: 'Descarga de respaldo JSON generada',
  });
});

// ── Gestor de plantillas PDF ────────────────────────────────────────────────
if (!fs.existsSync(PLANTILLAS_DIR)) {
  fs.mkdirSync(PLANTILLAS_DIR, { recursive: true });
}

const plantillaStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PLANTILLAS_DIR),
  filename: (req, file, cb) => {
    const base = path.basename(file.originalname || 'plantilla.pdf', path.extname(file.originalname || ''));
    const safe = String(base).replace(/[^\w\u00C0-\u024F .\-()]/g, '_').trim();
    cb(null, `${safe || 'plantilla'}${Date.now()}.pdf`);
  },
});

const plantillaUpload = multer({
  storage: plantillaStorage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(1).toLowerCase();
    cb(null, ext === 'pdf');
  },
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
});

const listarPlantillas = asyncHandler(async (req, res) => {
  if (!fs.existsSync(PLANTILLAS_DIR)) return res.json({ success: true, data: [] });
  const files = fs
    .readdirSync(PLANTILLAS_DIR)
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .map((f) => {
      const stat = fs.statSync(path.join(PLANTILLAS_DIR, f));
      return { archivo: f, tamaño: stat.size, modificado: stat.mtime };
    });
  res.json({ success: true, data: files });
});

const subirPlantilla = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Debes seleccionar un archivo PDF' });
  }
  await logActivity({
    entityType: 'Plantilla',
    entityId: req.user._id,
    user: req.user._id,
    action: 'subir_plantilla',
    message: `Soporte subió la plantilla ${req.file.filename}`,
  });
  res.json({ success: true, message: 'Plantilla subida', data: { archivo: req.file.filename } });
});

const eliminarPlantilla = asyncHandler(async (req, res) => {
  const { archivo } = req.params;
  const safe = path.basename(archivo);
  const filePath = path.join(PLANTILLAS_DIR, safe);

  if (!safe.toLowerCase().endsWith('.pdf')) {
    return res.status(400).json({ success: false, message: 'Solo se permiten archivos PDF' });
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'Plantilla no encontrada' });
  }

  fs.unlinkSync(filePath);
  await logActivity({
    entityType: 'Plantilla',
    entityId: req.user._id,
    user: req.user._id,
    action: 'eliminar_plantilla',
    message: `Soporte eliminó la plantilla ${safe}`,
  });
  res.json({ success: true, message: 'Plantilla eliminada' });
});

const descargarPlantillaSoporte = asyncHandler(async (req, res) => {
  const { archivo } = req.params;
  const safe = path.basename(archivo);
  const filePath = path.join(PLANTILLAS_DIR, safe);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'Plantilla no encontrada' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safe)}"`);
  res.sendFile(filePath);
});

// Renombra una plantilla PDF existente en ./plantillas desde la interfaz.
// PATCH /soporte/plantillas/:archivo  body: { nuevoNombre }
const renombrarPlantilla = asyncHandler(async (req, res) => {
  const original = path.basename(String(req.params.archivo || ''));
  if (!original.toLowerCase().endsWith('.pdf')) {
    return res.status(400).json({ success: false, message: 'Solo se permiten archivos PDF' });
  }

  let nuevoNombre = String((req.body && req.body.nuevoNombre) || '').trim();
  if (!nuevoNombre || !/\.pdf$/i.test(nuevoNombre)) {
    return res.status(400).json({ success: false, message: 'El nuevo nombre debe terminar en .pdf' });
  }

  // Reemplaza caracteres inseguros para evitar modificaciones de ruta.
  const base = nuevoNombre.replace(/\.pdf$/i, '').replace(/[^\w\u00C0-\u024F .\-()]/g, '_').trim();
  nuevoNombre = `${base || 'plantilla'}.pdf`;

  if (nuevoNombre.toLowerCase() === original.toLowerCase()) {
    return res.status(400).json({ success: false, message: 'El nuevo nombre es igual al actual' });
  }

  const filePath = path.join(PLANTILLAS_DIR, original);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'Plantilla no encontrada' });
  }

  const newPath = path.join(PLANTILLAS_DIR, nuevoNombre);
  if (fs.existsSync(newPath)) {
    return res.status(409).json({ success: false, message: 'Ya existe una plantilla con ese nombre' });
  }

  fs.renameSync(filePath, newPath);

  await logActivity({
    entityType: 'Plantilla',
    entityId: req.user._id,
    user: req.user._id,
    action: 'renombrar_plantilla',
    message: `Soporte renombró la plantilla ${original} → ${nuevoNombre}`,
  });

  res.json({ success: true, message: 'Plantilla renombrada', data: { anterior: original, archivo: nuevoNombre } });
});


// ── Chat interno (soporte ve y responde los mensajes del equipo) ────────────
// El soporte es SUPERADMIN y puede ver TODOS los chats (grupales y 1 a 1) para
// atender los mensajes que los asesores le envían, sin estar necesariamente en
// la lista de participantes original del canal.
const CANAL_GENERAL_SOPORTE = 'general';

const listarChatsSoporte = asyncHandler(async (req, res) => {
  const meId = req.user._id;
  const chats = await Chat.find()
    .select('-messages')
    .populate('participants', 'name username role photo')
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .limit(50)
    .lean();

  // El contador de no leídos y el nombre del último emisor se calculan en
  // MongoDB: antes se traía el historial COMPLETO de cada conversación solo
  // para contarlo, lo que saturaba el servidor con 50+ usuarios.
  const chatIds = chats.map((c) => c._id);
  let stats = new Map();
  if (chatIds.length) {
    const rows = await Chat.aggregate([
      { $match: { _id: { $in: chatIds } } },
      {
        $project: {
          unread: {
            $size: {
              $filter: {
                input: { $ifNull: ['$messages', []] },
                as: 'm',
                cond: { $not: { $in: [meId, { $ifNull: ['$$m.readBy', []] }] } },
              },
            },
          },
          lastSender: {
            $let: {
              vars: { last: { $arrayElemAt: [{ $ifNull: ['$messages', []] }, -1] } },
              in: { $ifNull: ['$$last.emisorNombre', ''] },
            },
          },
        },
      },
    ]);
    stats = new Map(rows.map((r) => [String(r._id), r]));
  }

  // Se devuelve un resumen ligero (sin el historial completo) incluyendo el
  // número de mensajes NO leídos por Soporte, para pintar el indicador.
  const data = chats.map((chat) => {
    const stat = stats.get(String(chat._id)) || {};
    return {
      _id: chat._id,
      name: chat.name,
      type: chat.type,
      participants: chat.participants,
      lastMessage: chat.lastMessage,
      lastMessageAt: chat.lastMessageAt,
      updatedAt: chat.updatedAt,
      unread: stat.unread || 0,
      lastSender: stat.lastSender || '',
    };
  });

  res.json({ success: true, data });
});

const generalSoporte = asyncHandler(async (req, res) => {
  const chat = await getOrCreateGeneralChat();
  const populated = await chat.populate('participants', 'name username role');
  res.json({ success: true, data: populated });
});

const verChatSoporte = asyncHandler(async (req, res) => {
  // Metadatos SIN historial + los últimos 300 mensajes cortados en el
  // servidor: antes se descargaba el documento entero con todo el historial.
  const chat = await Chat.findById(req.params.id)
    .select('-messages')
    .populate('participants', 'name username role photo')
    .lean();
  if (!chat) return res.status(404).json({ success: false, message: 'Chat no encontrado' });

  let messages = [];
  try {
    const rows = await Chat.aggregate([
      { $match: { _id: chat._id } },
      { $project: { messages: { $slice: ['$messages', -300] } } },
    ]);
    messages = (rows && rows[0] && rows[0].messages) || [];
  } catch (error) {
    console.error('[Soporte] No se pudo recortar el historial del chat:', error.message);
    messages = [];
  }

  const senderIds = [...new Set(messages
    .map((m) => (m && m.sender ? String(m.sender) : ''))
    .filter(Boolean))];
  let senderMap = new Map();
  if (senderIds.length) {
    const senders = await User.find({ _id: { $in: senderIds } })
      .select('name username role photo')
      .populate('role', 'code')
      .lean();
    senderMap = new Map(senders.map((u) => [String(u._id), u]));
  }

  const data = {
    ...chat,
    messages: messages.map((m) => ({
      ...m,
      sender: senderMap.get(String(m.sender)) || m.sender || null,
    })),
  };
  res.json({ success: true, data });
});

const enviarMensajeSoporte = asyncHandler(async (req, res) => {
  const text = String((req.body && req.body.message) || '').trim();
  if (!text) {
    return res.status(400).json({ success: false, message: 'El mensaje no puede estar vacío' });
  }
  if (text.length > 2000) {
    return res.status(400).json({ success: false, message: 'El mensaje no puede superar los 2000 caracteres' });
  }

  // Solo los metadatos: el historial no hace falta (el mensaje se inserta
  // con un $push atómico dentro de persistAndBroadcast).
  const chat = await Chat.findById(req.params.id).select('-messages');
  if (!chat) return res.status(404).json({ success: false, message: 'Chat no encontrado' });

  // El soporte se agrega como participante si aún no lo estaba para poder
  // responder en cualquier canal.
  if (!chat.participants.some((p) => p && p.toString() === String(req.user._id))) {
    chat.participants.push(req.user._id);
    await chat.save();
  }

  const support = await User.findById(req.user._id).select('name username');
  const displayName = (support && support.name) || (support && support.username) || 'Soporte Técnico';
  const io = req.app.get('io');
  const newMsg = await persistAndBroadcast(io, chat._id.toString(), req.user._id.toString(), displayName, text);

  // Aviso (notificación interna + push nativo) al equipo cuando Soporte escribe
  // en el canal grupal de Soporte. En los chats 1 a 1 el aviso ya lo dispara
  // persistAndBroadcast, así que aquí solo se hace para el canal grupal.
  try {
    if (chat.type === 'grupal') {
      const recipients = chat.participants.filter((p) => p && p.toString() !== String(req.user._id));
      await Promise.all(
        recipients.map((p) =>
          Notification.create({
            user: p,
            type: 'nuevo_mensaje_chat',
            title: 'Mensaje de Soporte Técnico',
            message: text.slice(0, 140),
            data: { chatId: String(chat._id) },
          }).catch(() => null)
        )
      );
    }
  } catch (e) { /* el aviso nunca debe impedir el mensaje */ }

  await logActivity({
    entityType: 'Chat',
    entityId: chat._id,
    user: req.user._id,
    action: 'soporte_chat',
    message: `Soporte respondió en el chat ${chat.name || chat.type}`,
  });

  res.status(201).json({ success: true, data: newMsg });
});

const marcarLeidoSoporte = asyncHandler(async (req, res) => {
  const ok = await markChatAsRead(req.params.id, req.user._id);
  if (!ok) return res.status(404).json({ success: false, message: 'Chat no encontrado' });
  res.json({ success: true, message: 'Mensajes marcados como leídos' });
});

// El Soporte inicia una conversación 1 a 1 con cualquier usuario del equipo.
// Reutiliza el chat individual si ya existía entre ambos.
const crearChatSoporte = asyncHandler(async (req, res) => {
  const participantId = (req.body && req.body.participantId) || '';
  if (!participantId) {
    return res.status(400).json({ success: false, message: 'Selecciona un usuario para conversar.' });
  }
  const target = await User.findById(participantId).populate('role', 'code name');
  if (!target) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });

  const meId = req.user._id;
  let chat = await Chat.findOne({
    type: 'individual',
    participants: { $all: [meId, participantId], $size: 2 },
  });
  if (!chat) {
    chat = await Chat.create({ type: 'individual', participants: [meId, participantId] });
  }
  const populated = await chat.populate('participants', 'name username role photo');

  await logActivity({
    entityType: 'Chat',
    entityId: chat._id,
    user: meId,
    action: 'soporte_chat_creado',
    message: `Soporte inició una conversación con ${target.name || target.username || 'un usuario'}`,
  });

  res.status(201).json({ success: true, data: populated });
});

// ── Herramientas avanzadas del panel de soporte ─────────────────────────────
// 1) Monitoreo en vivo: usuarios conectados ahora mismo por Socket.io.
const monitoreo = asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const conectados = new Map();
  try {
    if (io && io.sockets && io.sockets.sockets) {
      io.sockets.sockets.forEach((socket) => {
        const u = socket.user;
        if (!u || !u._id) return;
        const id = String(u._id);
        if (!conectados.has(id)) {
          conectados.set(id, {
            id,
            name: u.name || u.username || 'Usuario',
            username: u.username || '',
            roleId: u.role ? String(u.role) : '',
            sockets: 0,
          });
        }
        conectados.get(id).sockets += 1;
      });
    }
  } catch (e) { /* ignore */ }

  const roles = await Role.find().select('code name');
  const roleMap = new Map(roles.map((r) => [String(r._id), r.name || r.code]));
  const usuarios = Array.from(conectados.values()).map((u) => ({
    id: u.id,
    name: u.name,
    username: u.username,
    role: roleMap.get(u.roleId) || '',
    sockets: u.sockets,
  })).sort((a, b) => a.name.localeCompare(b.name));

  const sesionesActivas = await Session.countDocuments({}).catch(() => 0);
  res.json({
    success: true,
    data: {
      usuarios,
      totalUsuarios: usuarios.length,
      totalConexiones: usuarios.reduce((n, u) => n + u.sockets, 0),
      sesionesActivas,
      generadoEn: new Date().toISOString(),
    },
  });
});

// 2) Diagnóstico del sistema (servidor, memoria, Node, BD, versión de la app).
const diagnostico = asyncHandler(async (req, res) => {
  const mem = process.memoryUsage();
  const dbState = mongoose.connection.readyState;
  const estados = { 0: 'desconectado', 1: 'conectado', 2: 'conectando', 3: 'desconectando' };
  let versionApp = null;
  try {
    // eslint-disable-next-line global-require
    versionApp = await require('../services/version.service').getVersion();
  } catch (e) { /* ignore */ }

  res.json({
    success: true,
    data: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      uptime: process.uptime(),
      hostname: os.hostname(),
      cpus: (os.cpus() || []).length,
      loadAvg: typeof os.loadavg === 'function' ? os.loadavg() : [],
      memoria: { rss: mem.rss, heapTotal: mem.heapTotal, heapUsed: mem.heapUsed, external: mem.external },
      memoriaSistema: { total: os.totalmem(), libre: os.freemem() },
      baseDatos: {
        estado: estados[dbState] || 'desconocido',
        nombre: mongoose.connection.name || '',
      },
      versionApp,
    },
  });
});

// 3) Notificación masiva a todo el equipo o a un rol concreto.
const notificarMasivo = asyncHandler(async (req, res) => {
  const titulo = String((req.body && req.body.title) || '').trim();
  const cuerpo = String((req.body && req.body.message) || '').trim();
  const audience = String((req.body && req.body.audience) || 'todos');
  if (!titulo || !cuerpo) {
    return res.status(400).json({ success: false, message: 'Título y mensaje son obligatorios.' });
  }

  let query = { status: 'activo' };
  if (audience && audience !== 'todos') {
    const role = await Role.findOne({ code: audience }).select('_id');
    if (!role) return res.status(400).json({ success: false, message: 'Rol no válido.' });
    query = { status: 'activo', role: role._id };
  }
  const users = await User.find(query).select('_id');

  let enviadas = 0;
  for (const u of users) {
    try {
      // El hook post('save') de Notification dispara el push nativo.
      await Notification.create({ user: u._id, type: 'sistema', title: titulo, message: cuerpo, data: { masivo: true } });
      enviadas += 1;
    } catch (e) { /* ignore */ }
  }

  await logActivity({
    entityType: 'User',
    entityId: req.user._id,
    user: req.user._id,
    action: 'notificacion_masiva',
    message: `Notificación masiva a ${enviadas} usuarios (${audience})`,
  });

  res.json({ success: true, data: { enviadas, total: users.length } });
});

// 4) Auditoría por usuario: historial de actividad de una cuenta.
// Acepta filtros por texto, acción, tipo de entidad y rango de fechas, además
// de paginación. Devuelve un resumen para pintar contadores en el panel.
function buildActivityFilter(query, fixedUserId) {
  const filter = {};
  if (fixedUserId) {
    filter.user = new mongoose.Types.ObjectId(fixedUserId);
  } else if (query.userId && mongoose.isValidObjectId(query.userId)) {
    filter.user = new mongoose.Types.ObjectId(query.userId);
  }

  if (query.scope && query.scope !== 'todos') filter.entityType = String(query.scope);
  if (query.action) filter.action = new RegExp(escapeRegex(query.action), 'i');
  if (query.q && String(query.q).trim()) {
    const rx = new RegExp(escapeRegex(String(query.q).trim()), 'i');
    filter.$or = [{ message: rx }, { action: rx }, { entityType: rx }];
  }

  const from = query.from ? new Date(query.from) : null;
  let to = query.to ? new Date(query.to) : null;
  // Un valor YYYY-MM-DD debe incluir todo el día seleccionado.
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(String(query.to))) {
    to = new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1);
  }
  if (from && !Number.isNaN(from.getTime())) filter.createdAt = { $gte: from };
  if (to && !Number.isNaN(to.getTime())) {
    filter.createdAt = Object.assign(filter.createdAt || {}, { $lte: to });
  }
  return filter;
}

async function activitySummary(filter) {
  const [byAction, byScope, range, total] = await Promise.all([
    ActivityLog.aggregate([
      { $match: filter },
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 10 },
    ]).catch(() => []),
    ActivityLog.aggregate([
      { $match: filter },
      { $group: { _id: '$entityType', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]).catch(() => []),
    ActivityLog.aggregate([
      { $match: filter },
      { $group: { _id: null, first: { $min: '$createdAt' }, last: { $max: '$createdAt' } } },
    ]).catch(() => []),
    ActivityLog.countDocuments(filter).catch(() => 0),
  ]);
  return {
    total,
    byAction: byAction.map((row) => ({ action: row._id || 'sin_accion', count: row.count })),
    byScope: byScope.map((row) => ({ scope: row._id || 'sin_tipo', count: row.count })),
    firstAt: range[0] ? range[0].first : null,
    lastAt: range[0] ? range[0].last : null,
  };
}

const auditoriaUsuario = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ success: false, message: 'Usuario inválido.' });
  }
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 60));
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const user = await User.findById(id)
    .populate('role', 'code name')
    .select('name username email role status lastLoginAt position photo')
    .lean();
  if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });

  const filter = buildActivityFilter(req.query, id);
  const [total, logs, summary] = await Promise.all([
    ActivityLog.countDocuments(filter),
    ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    activitySummary(filter),
  ]);

  res.json({
    success: true,
    data: {
      user,
      logs,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      limit,
      summary,
    },
  });
});

// Actividad de TODO el equipo: mismo formato que la auditoría individual pero
// con filtro opcional por usuario. Es la fuente de la pestaña "Actividad".
const actividadEquipo = asyncHandler(async (req, res) => {
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const filter = buildActivityFilter(req.query, null);

  const [total, logs, summary, byUser] = await Promise.all([
    ActivityLog.countDocuments(filter),
    ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name username email photo role')
      .lean(),
    activitySummary(filter),
    ActivityLog.aggregate([
      { $match: filter },
      { $group: { _id: '$user', count: { $sum: 1 }, lastAt: { $max: '$createdAt' } } },
      { $sort: { count: -1 } },
      { $limit: 12 },
    ]).catch(() => []),
  ]);

  const userIds = byUser.map((row) => row._id).filter(Boolean);
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } }).select('name username email').lean()
    : [];
  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const resumenUsuarios = byUser.map((row) => {
    const u = userMap.get(String(row._id)) || {};
    return {
      userId: row._id,
      name: u.name || 'Usuario eliminado',
      username: u.username || '',
      email: u.email || '',
      count: row.count,
      lastAt: row.lastAt,
    };
  });

  res.json({
    success: true,
    data: {
      logs,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      limit,
      summary,
      byUser: resumenUsuarios,
    },
  });
});

// 4b) Mantenimiento de notificaciones: elimina suscripciones push repetidas
// (mismo dispositivo suscrito con varias cuentas) que provocaban avisos
// duplicados en el celular.
const limpiarPushSoporte = asyncHandler(async (req, res) => {
  const push = require('../services/push.service');
  const result = await push.cleanupDuplicates();
  await logActivity({
    entityType: 'System',
    entityId: req.user._id,
    user: req.user._id,
    action: 'limpiar_push_duplicados',
    message: `Soporte reparó las suscripciones push (${result.removed || 0} duplicadas eliminadas)`,
    data: result,
  });
  const message = result.removed
    ? `Se eliminaron ${result.removed} suscripciones duplicadas.`
    : 'No había suscripciones push duplicadas.';
  res.json({
    success: true,
    message,
    data: { ...result, message },
  });
});

// 5) Acciones de mantenimiento masivo sobre todos los dispositivos conectados.
const accionMasiva = asyncHandler(async (req, res) => {
  const accion = String((req.body && req.body.accion) || '');
  const io = req.app.get('io');

  if (accion === 'limpiar-cache') {
    if (io) io.emit('force-update', { at: Date.now() });
    await logActivity({ entityType: 'User', entityId: req.user._id, user: req.user._id, action: 'mass_update', message: 'Se ordenó limpiar caché y actualizar en todos los dispositivos' });
    return res.json({ success: true, message: 'Se ordenó limpiar la caché y actualizar en todos los dispositivos.' });
  }

  if (accion === 'recargar') {
    if (io) io.emit('force-reload', { at: Date.now() });
    await logActivity({ entityType: 'User', entityId: req.user._id, user: req.user._id, action: 'mass_reload', message: 'Se ordenó recargar la app en todos los dispositivos' });
    return res.json({ success: true, message: 'Se ordenó recargar la aplicación en todos los dispositivos.' });
  }

  if (accion === 'cerrar-sesiones') {
    const token = req.token;
    const filter = token ? { tokenHash: { $ne: hashToken(token) } } : {};
    const result = await Session.deleteMany(filter);
    if (io) {
      io.emit('force-logout', { at: Date.now() });
      io.emit('sessions-changed', {});
    }
    await logActivity({ entityType: 'User', entityId: req.user._id, user: req.user._id, action: 'mass_logout', message: `Se cerraron ${result.deletedCount || 0} sesiones de todo el equipo` });
    return res.json({ success: true, message: `Se cerraron ${result.deletedCount || 0} sesiones. Solo se conserva la tuya.` });
  }

  return res.status(400).json({ success: false, message: 'Acción no válida.' });
});

// 6) Gestión de contenido: suscriptores del boletín (newsletter).
const listarSuscriptores = asyncHandler(async (req, res) => {
  const subs = await Newsletter.find().sort({ createdAt: -1 }).limit(500).lean();
  res.json({ success: true, data: subs });
});

const eliminarSuscriptor = asyncHandler(async (req, res) => {
  const n = await Newsletter.findByIdAndDelete(req.params.id);
  if (!n) return res.status(404).json({ success: false, message: 'Suscriptor no encontrado.' });
  res.json({ success: true, message: 'Suscriptor eliminado' });
});

// Cerrar la sesión de soporte y volver al login normal.
const soporteLogout = asyncHandler(async (req, res) => {
  if (req.token) await revokeSessionByToken(req.token);
  await logActivity({
    entityType: 'User',
    entityId: req.user._id,
    user: req.user._id,
    action: 'soporte_logout',
    message: 'Cierre de sesión del panel de soporte',
  });
  res.json({ success: true, message: 'Sesión de soporte cerrada' });
});

module.exports = {
  soporteLogin,
  soporteMe,
  soporteLogout,
  listarUsuarios,
  actualizarUsuario,
  restablecerPassword,
  eliminarUsuario,
  listarRoles,
  listarConfig,
  guardarConfig,
  listarSoporteConfig,
  guardarSoporteConfig,
  resumenSistema,
  listarSesionesSoporte,
  revocarSesionSoporte,
  revocarSesionesUsuarioSoporte,
  listarAnuncios,
  crearAnuncio,
  eliminarAnuncio,
  listarSolicitudesPassword,
  listarRolesPermisos,
  listarLogs,
  listarLogsSistema,
  limpiarLogsSistema,
  estadoMantenimiento,
  cambiarMantenimiento,
  generarRespaldo,
  listarPlantillas,
  subirPlantilla,
  renombrarPlantilla,
  eliminarPlantilla,
  descargarPlantillaSoporte,
  plantillaUpload,
  PLANTILLAS_DIR,
  listarChatsSoporte,
  generalSoporte,
  verChatSoporte,
  enviarMensajeSoporte,
  marcarLeidoSoporte,
  crearChatSoporte,
  monitoreo,
  diagnostico,
  notificarMasivo,
  auditoriaUsuario,
  actividadEquipo,
  limpiarPushSoporte,
  accionMasiva,
  listarSuscriptores,
  eliminarSuscriptor,
};
