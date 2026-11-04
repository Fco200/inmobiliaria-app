'use strict';

const jwt = require('jsonwebtoken');
const asyncHandler = require('./asyncHandler');
const { User, Session } = require('../models');
const { jwtSecret } = require('../config/env');
const { hashToken, touchSession } = require('../services/session.service');

const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No autorizado. Inicia sesión.' });
  }

  const token = header.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, jwtSecret);
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token inválido o expirado. Inicia sesión de nuevo.' });
  }

  const user = await User.findById(decoded.id)
    .populate({ path: 'role', populate: { path: 'permissions' } })
    .select('+password');
  if (!user || user.status !== 'activo') {
    return res.status(401).json({ success: false, message: 'Usuario no encontrado o inactivo.' });
  }

  // Sesiones revocables: el token solo es válido si la sesión sigue activa en la BD.
  const session = await Session.findOne({ tokenHash: hashToken(token) });
  if (!session) {
    return res.status(401).json({
      success: false,
      message: 'Tu sesión fue cerrada o revocada. Inicia sesión de nuevo.',
    });
  }

  req.user = user;
  req.token = token;
  req.session = session;
  touchSession(token);
  next();
});

// Autoriza por código de rol O por código de permiso. Así los roles
// personalizados creados en Configuración funcionan igual que los oficiales.
// El permiso system_admin equivale a acceso total.
const authorize = (...allowed) => (req, res, next) => {
  const role = req.user && req.user.role;
  const code = role && role.code;
  const permissions = role && Array.isArray(role.permissions)
    ? role.permissions
      .map((permission) => (permission && permission.code ? permission.code : String(permission || '')))
      .filter(Boolean)
    : [];
  const allowedByRole = Boolean(code) && allowed.includes(code);
  const allowedByPermission = permissions.some((permission) => allowed.includes(permission));
  const systemAdmin = permissions.includes('system_admin');

  if (!allowedByRole && !allowedByPermission && !systemAdmin) {
    return res.status(403).json({
      success: false,
      message: 'No tienes permisos para realizar esta acción.',
    });
  }
  next();
};

module.exports = { protect, authorize };
