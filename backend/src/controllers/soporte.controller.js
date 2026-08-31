'use strict';

const path = require('path');
const fs = require('fs');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const asyncHandler = require('../middlewares/asyncHandler');
const {
  User,
  Role,
  Config,
  ActivityLog,
  Client,
  Property,
  Business,
  Session,
} = require('../models');
const { jwtSecret, jwtExpiresIn } = require('../config/env');
const { logActivity } = require('../services/log.service');
const { createSession, revokeSessionByToken } = require('../services/session.service');

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

// ── Respaldos / Backups ─────────────────────────────────────────────────────
const generarRespaldo = asyncHandler(async (req, res) => {
  const collections = {
    clientes: await Client.find().lean(),
    propiedades: await Property.find().lean(),
    negocios: await Business.find().lean(),
  };

  const backup = {
    generadoEl: new Date().toISOString(),
    sistema: 'INMOBILIARIA CRM',
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
  listarLogs,
  generarRespaldo,
  listarPlantillas,
  subirPlantilla,
  eliminarPlantilla,
  descargarPlantillaSoporte,
  plantillaUpload,
  PLANTILLAS_DIR,
};
