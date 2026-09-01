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
} = require('../models');
const { persistAndBroadcast, getOrCreateGeneralChat } = require('./chat.controller');
const { jwtSecret, jwtExpiresIn } = require('../config/env');
const { logActivity } = require('../services/log.service');
const { createSession, revokeSessionByToken, hashToken } = require('../services/session.service');
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
const listarUsuarios = asyncHandler(async (req, res) => {
  const users = await User.find()
    .populate('role', 'code name')
    .select('name username email photo position role status joinedAt lastLoginAt');
  res.json({ success: true, data: users });
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

  // Si se desactiva un usuario, se cierran sus sesiones activas.
  if (status === 'inactivo') {
    await Session.deleteMany({ user: user._id });
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

  // Invalida todas sus sesiones para que reingrese con la nueva contraseña.
  await Session.deleteMany({ user: user._id });

  await logActivity({
    entityType: 'User',
    entityId: user._id,
    user: req.user._id,
    action: 'restablecer_password',
    message: `Soporte restableció la contraseña de ${user.email}`,
  });

  res.json({ success: true, message: 'Contraseña restablecida correctamente' });
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
      hasta: state.fechaProgramada || '',
      fechaProgramada: state.fechaProgramada,
      mostrarAvisoPrevio: state.mostrarAvisoPrevio,
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
      fechaProgramada: body.fechaProgramada !== undefined ? body.fechaProgramada : body.hasta,
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
    mostrarAvisoPrevio: state.mostrarAvisoPrevio,
  }, 'mantenimiento');

  const io = req.app.get('io');
  if (io) {
    if (state.activo) {
      io.emit('mantenimiento-iniciado', {
        mensaje: state.mensaje,
        fechaProgramada: state.fechaProgramada,
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
      hasta: state.fechaProgramada || '',
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
  await Session.deleteOne({ _id: session._id });

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
  const result = await Session.deleteMany({ user: user._id, tokenHash: { $ne: currentHash } });
  res.json({ success: true, message: 'Sesiones cerradas', data: { cerradas: result.deletedCount || 0 } });
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
  const chats = await Chat.find()
    .populate('participants', 'name username role photo')
    .populate({ path: 'messages.sender', select: 'name username role photo' })
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .limit(50);
  res.json({ success: true, data: chats });
});

const generalSoporte = asyncHandler(async (req, res) => {
  const chat = await getOrCreateGeneralChat();
  const populated = await chat.populate('participants', 'name username role');
  res.json({ success: true, data: populated });
});

const verChatSoporte = asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.params.id)
    .populate('participants', 'name username role photo')
    .populate('messages.sender', 'name username role photo');
  if (!chat) return res.status(404).json({ success: false, message: 'Chat no encontrado' });
  const data = chat.toObject();
  data.messages = (data.messages || []).slice(-300);
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

  const chat = await Chat.findById(req.params.id);
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
  const chat = await Chat.findById(req.params.id);
  if (!chat) return res.status(404).json({ success: false, message: 'Chat no encontrado' });
  chat.messages.forEach((msg) => {
    if (!msg.readBy.some((p) => p && p.toString() === String(req.user._id))) {
      msg.readBy.push(req.user._id);
    }
  });
  await chat.save();
  res.json({ success: true, message: 'Mensajes marcados como leídos' });
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
};
