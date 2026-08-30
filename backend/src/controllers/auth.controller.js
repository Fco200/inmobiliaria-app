'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const asyncHandler = require('../middlewares/asyncHandler');
const { User, Role, Setting } = require('../models');
const {
  jwtSecret,
  jwtExpiresIn,
  jwtRememberExpiresIn,
  googleClientId,
  loginMaxAttempts,
  loginLockMinutes,
} = require('../config/env');
const { logActivity, logAudit } = require('../services/log.service');
const {
  createSession,
  revokeSessionByToken,
} = require('../services/session.service');

const signToken = (userId, expiresIn = jwtExpiresIn) =>
  jwt.sign({ id: userId }, jwtSecret, { expiresIn });

const ROLE_KEY_SETTING = 'ROLE_REGISTER_KEY';

function hashRoleKey(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

async function getConfiguredRoleKey() {
  const setting = await Setting.findOne({ key: ROLE_KEY_SETTING });
  return setting ? setting.value : null;
}

function roleNeedsKey(roleCode) {
  return ['admin', 'gerencia'].includes(roleCode);
}

function buildUserResponse(user) {
  return {
    id: user._id,
    name: user.name,
    username: user.username,
    email: user.email,
    photo: user.photo || '',
    position: user.position || '',
    phone: user.phone || '',
    facebook: user.facebook || '',
    instagram: user.instagram || '',
    bio: user.bio || '',
    role: user.role,
    status: user.status,
    joinedAt: user.joinedAt,
    lastLoginAt: user.lastLoginAt,
  };
}

const login = asyncHandler(async (req, res) => {
  const { identifier, password, remember } = req.body;

  const user = await User.findOne({
    $or: [{ email: identifier.toLowerCase() }, { username: identifier }],
  })
    .select('+password +failedLoginAttempts +lockUntil')
    .populate('role');

  if (!user) {
    return res.status(401).json({ success: false, message: 'Credenciales incorrectas' });
  }

  // Cuenta bloqueada temporalmente por intentos fallidos.
  if (user.lockUntil && user.lockUntil > new Date()) {
    const minutes = Math.max(1, Math.ceil((user.lockUntil - Date.now()) / 60000));
    return res.status(423).json({
      success: false,
      message: `Cuenta bloqueada temporalmente por intentos fallidos. Intenta en ${minutes} minuto(s).`,
    });
  }

  if (!(await user.comparePassword(password))) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= loginMaxAttempts) {
      user.lockUntil = new Date(Date.now() + loginLockMinutes * 60 * 1000);
      user.failedLoginAttempts = 0;
    }
    await user.save({ validateBeforeSave: false });
    return res.status(401).json({ success: false, message: 'Credenciales incorrectas' });
  }

  if (user.status !== 'activo') {
    return res.status(403).json({ success: false, message: 'El usuario está inactivo' });
  }

  // Login correcto: limpia contadores de bloqueo.
  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  await logActivity({
    entityType: 'User',
    entityId: user._id,
    user: user._id,
    action: 'login',
    message: remember ? 'Inicio de sesión con sesión recordada' : 'Inicio de sesión',
  });

  const token = signToken(user._id, remember ? jwtRememberExpiresIn : jwtExpiresIn);
  await createSession(
    user._id,
    token,
    req,
    { remember, expiresInMs: remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000 }
  );

  res.json({
    success: true,
    message: 'Sesión iniciada',
    data: { token, user: buildUserResponse(user) },
  });
});

const logout = asyncHandler(async (req, res) => {
  await revokeSessionByToken(req.token);
  await logActivity({
    entityType: 'User',
    entityId: req.user._id,
    user: req.user._id,
    action: 'logout',
    message: 'Cierre de sesión',
  });
  res.json({ success: true, message: 'Sesión cerrada' });
});

const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: req.user });
});

const updateMe = asyncHandler(async (req, res) => {
  const { password, ...rest } = req.body;

  const fields = [
    'name',
    'photo',
    'position',
    'bio',
    'phone',
    'facebook',
    'instagram',
    'email',
    'username',
  ];
  const updates = {};
  fields.forEach((field) => {
    if (rest[field] !== undefined) updates[field] = rest[field];
  });

  if (password) updates.password = password;

  if (updates.email) {
    const existing = await User.findOne({ email: updates.email });
    if (existing && existing._id.toString() !== req.user._id.toString()) {
      return res.status(409).json({ success: false, message: 'Ya existe un usuario con ese correo' });
    }
  }

  Object.assign(req.user, updates);
  await req.user.save();

  const user = await User.findById(req.user._id).populate('role');
  res.json({ success: true, message: 'Perfil actualizado', data: buildUserResponse(user) });
});

const register = asyncHandler(async (req, res) => {
  const usersCount = await User.countDocuments();
  if (usersCount > 0) {
    return res.status(403).json({
      success: false,
      message: 'El registro inicial ya se realizó. Contacta al administrador.',
    });
  }

  const { name, username, email, password } = req.body;
  const adminRole = await Role.findOne({ code: 'admin' });

  const user = await User.create({ name, username, email, password, role: adminRole._id });
  const token = signToken(user._id);
  await createSession(user._id, token, req);
  res.status(201).json({
    success: true,
    message: 'Administrador creado',
    data: { token, user: buildUserResponse(user) },
  });
});

const checkRegisterKey = asyncHandler(async (req, res) => {
  const { role, roleKey } = req.body;

  if (!roleNeedsKey(role)) {
    return res.json({ success: true, valid: true, message: 'Rol sin clave requerida' });
  }

  const configured = await getConfiguredRoleKey();
  if (!configured) {
    return res.status(400).json({
      success: false,
      valid: false,
      message: 'La clave de registro aún no está configurada por el administrador.',
    });
  }

  if (!roleKey) {
    return res.status(400).json({
      success: false,
      valid: false,
      message: 'Seleccionaste administrador o gerencia: la clave secreta es obligatoria.',
    });
  }

  if (hashRoleKey(roleKey) !== configured) {
    return res.status(400).json({
      success: false,
      valid: false,
      message: 'La clave secreta es incorrecta.',
    });
  }

  res.json({ success: true, valid: true, message: 'Clave válida' });
});

async function getGoogleClientId() {
  const setting = await Setting.findOne({ key: 'GOOGLE_CLIENT_ID' });
  if (setting && setting.value) return String(setting.value);
  return googleClientId;
}

async function verifyGoogleCredential(credential) {
  if (!credential) {
    throw new Error('No se recibió la credencial de Google.');
  }

  const clientId = await getGoogleClientId();
  if (!clientId) {
    throw new Error(
      'El registro con Google no está configurado. Pide al administrador que agregue el Google Client ID.'
    );
  }

  let data;
  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    );
    data = await response.json();
    if (!response.ok) throw new Error('Token de Google inválido');
  } catch (error) {
    if (error.message === 'Token de Google inválido') throw error;
    throw new Error('No se pudo verificar la identidad de Google. Revisa tu conexión.');
  }

  if (!data.email) throw new Error('La cuenta de Google no tiene un correo asociado.');
  if (String(data.email_verified) !== 'true') {
    throw new Error('El correo de Google no está verificado.');
  }

  const audiences = Array.isArray(data.aud) ? data.aud : [data.aud];
  if (!audiences.includes(clientId)) {
    throw new Error('La credencial de Google no pertenece a esta aplicación.');
  }

  return data;
}

const registerGoogle = asyncHandler(async (req, res) => {
  const { credential, role, roleKey } = req.body;

  if (roleNeedsKey(role)) {
    const configured = await getConfiguredRoleKey();
    if (!configured) {
      return res.status(400).json({
        success: false,
        message: 'La clave de registro aún no está configurada por el administrador.',
      });
    }
    if (!roleKey || hashRoleKey(roleKey) !== configured) {
      return res.status(400).json({
        success: false,
        message: 'La clave secreta es incorrecta o falta.',
      });
    }
  }

  const profile = await verifyGoogleCredential(credential);

  const roleDoc = await Role.findOne({ code: ['admin', 'gerencia', 'asesor'].includes(role) ? role : 'asesor' });
  if (!roleDoc) {
    return res.status(400).json({ success: false, message: 'El rol seleccionado no existe.' });
  }

  const email = String(profile.email).toLowerCase();
  let user = await User.findOne({ email });
  const isNew = !user;

  if (isNew) {
    const base = String(profile.name || email.split('@')[0]).trim().replace(/\s+/g, '_');
    const username = `${base.replace(/[^a-zA-Z0-9_]/g, '_') || 'usuario'}_${Math.floor(Math.random() * 10000)}`;
    // El modelo exige contraseña: se genera una aleatoria (cumple la política).
    // El usuario podrá definir la suya después desde "Mi perfil".
    const randomPassword = `${crypto.randomBytes(9).toString('base64')}Aa1`;
    user = await User.create({
      name: profile.name || email.split('@')[0],
      username,
      email,
      password: randomPassword,
      photo: profile.picture || '',
      role: roleDoc._id,
      status: 'activo',
    });
  } else if (user.status !== 'activo') {
    return res.status(403).json({ success: false, message: 'El usuario está inactivo.' });
  }

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  await logActivity({
    entityType: 'User',
    entityId: user._id,
    user: user._id,
    action: 'login_google',
    message: isNew ? `Registro con Google (${email})` : `Inicio de sesión con Google (${email})`,
  });

  const populated = await User.findById(user._id).populate('role');
  const token = signToken(user._id, jwtRememberExpiresIn);
  await createSession(user._id, token, req, { remember: true });
  res.json({
    success: true,
    message: isNew ? 'Registro con Google completado' : 'Sesión iniciada con Google',
    data: {
      token,
      user: buildUserResponse(populated),
    },
  });
});

module.exports = { login, logout, me, updateMe, register, checkRegisterKey, registerGoogle };
