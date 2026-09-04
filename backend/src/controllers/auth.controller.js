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
const { ensure } = require('../services/notification.service');
const maintenanceService = require('../services/maintenance.service');

const PRIVILEGED_MAINTENANCE_ROLES = ['admin', 'superadmin'];

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
    hasCompletedOnboarding: user.hasCompletedOnboarding || false,
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

  // Durante el mantenimiento ACTIVO solo pueden ingresar ADMIN y SUPERADMIN.
  // El mensaje personalizado del administrador se envía al frontend para que
  // lo muestre en el contenedor de mantenimiento.
  const roleCode = user.role && user.role.code ? user.role.code : '';
  if (!PRIVILEGED_MAINTENANCE_ROLES.includes(roleCode) && (await maintenanceService.isActive())) {
    const state = await maintenanceService.getState();
    const msg = state.mensaje || 'El sistema se encuentra en mantenimiento. Intenta más tarde.';
    return res.status(503).json({
      success: false,
      message: msg,
      code: 'MAINTENANCE_MODE',
      mantenimiento: { mensaje: msg, hasta: state.hasta || '' },
    });
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

  // La foto no debe borrarse si llega vacía: se conserva la actual salvo que el
  // usuario envíe una URL nueva. Así las actualizaciones de otros campos nunca
  // eliminan la foto de perfil.
  if (rest.photo !== undefined && (rest.photo === null || String(rest.photo).trim() === '')) {
    delete updates.photo;
  }

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

const completeOnboarding = asyncHandler(async (req, res) => {
  req.user.hasCompletedOnboarding = true;
  await req.user.save({ validateBeforeSave: false });
  res.json({ success: true, message: 'Onboarding completado' });
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'La contraseña actual y la nueva contraseña son obligatorias.' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ success: false, message: 'La nueva contraseña debe tener al menos 8 caracteres.' });
  }
  if (!/[A-Z]/.test(newPassword)) {
    return res.status(400).json({ success: false, message: 'La nueva contraseña debe incluir al menos una mayúscula.' });
  }
  if (!/[a-z]/.test(newPassword)) {
    return res.status(400).json({ success: false, message: 'La nueva contraseña debe incluir al menos una minúscula.' });
  }
  if (!/\d/.test(newPassword)) {
    return res.status(400).json({ success: false, message: 'La nueva contraseña debe incluir al menos un número.' });
  }

  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(currentPassword))) {
    return res.status(401).json({ success: false, message: 'La contraseña actual es incorrecta.' });
  }

  user.password = newPassword;
  await user.save();

  res.json({ success: true, message: 'Contraseña actualizada correctamente' });
});

// Solicitud pública de restablecimiento de contraseña. No autentica al usuario:
// avisa por notificación al administrador y al soporte técnico (superadmin)
// para que ayuden a restablecer la contraseña del asesor. Se responde de forma
// genérica para no revelar qué cuentas existen realmente.
const forgotPassword = asyncHandler(async (req, res) => {
  const identifier = String((req.body && req.body.identifier) || '').trim();
  if (!identifier) {
    return res.status(400).json({ success: false, message: 'Ingresa tu usuario o correo.' });
  }

  const lower = identifier.toLowerCase();
  const user = await User.findOne({
    $or: [{ email: lower }, { username: lower }],
  }).populate('role');

  // Destinatarios: administradores y soporte técnico (superadmin).
  const [adminRole, supportRole] = await Promise.all([
    Role.findOne({ code: 'admin' }),
    Role.findOne({ code: 'superadmin' }),
  ]);
  const roleIds = [adminRole && adminRole._id, supportRole && supportRole._id].filter(Boolean);
  const recipients = roleIds.length
    ? await User.find({ role: { $in: roleIds }, status: 'activo' }).populate('role')
    : [];

  const requesterText = user
    ? `${user.name || ''} (${user.email || identifier})`.trim()
    : identifier;
  const title = 'Solicitud de restablecimiento de contraseña';
  const message =
    `${requesterText} olvidó su contraseña y solicita que se la restablezcan.` +
    ' Por favor, genera una nueva contraseña para esta cuenta.';

  for (const recipient of recipients) {
    try {
      await ensure({
        type: 'olvido_contraseña',
        key: `forgot-${user ? user._id : 'anon'}-${Date.now()}`,
        title,
        message,
        userId: recipient._id,
        data: {
          usuario: user ? user.email : identifier,
          nombre: user ? user.name : '',
          solicitadoPor: user ? user._id : null,
        },
      });
    } catch (err) {
      console.error(`[ForgotPassword] Error notificando a ${recipient._id}:`, err.message);
    }
  }

  try {
    await logActivity({
      entityType: 'User',
      entityId: user ? user._id : null,
      user: user ? user._id : null,
      action: 'forgot_password',
      message: `Solicitud de restablecimiento de contraseña para ${requesterText}`,
    });
  } catch (err) { /* no bloquea la respuesta */ }

  res.json({
    success: true,
    message:
      'Si el usuario existe, ya se avisó al administrador y al soporte para restablecer tu contraseña.',
    data: { notified: recipients.length > 0 },
  });
});

module.exports = { login, logout, me, updateMe, register, checkRegisterKey, registerGoogle, completeOnboarding, changePassword, forgotPassword };
