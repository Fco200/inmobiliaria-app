'use strict';

const { ROLE_ORDER } = require('../constants/roles');

// Roles que ven TODA la información de la empresa.
// - admin / superadmin: control técnico total.
// - direccion: administración total solicitada por la inmobiliaria.
// - gerencia: supervisión comercial y de reportes.
const BOSS_ROLES = ['admin', 'direccion', 'gerencia', 'superadmin'];

// Códigos oficiales + soporte técnico. Cualquier otro código se considera un
// rol personalizado creado desde Configuración > Usuarios/Roles.
const OFFICIAL_ROLE_CODES = [...ROLE_ORDER, 'superadmin'];

// Permiso especial disponible para roles personalizados que necesiten el mismo
// alcance que dirección/administración.
const SYSTEM_ADMIN_PERMISSION = 'system_admin';

// Roles que, sin ser "jefes" para todo el sistema, sí necesitan ver y operar
// TODOS los negocios:
// - asistencia: da seguimiento y crea negocios para cualquier asesor.
// - escrituracion: cambia etapas, concluye, agrega notas/checklist y sube
//   documentos en cualquier negocio.
const BUSINESS_WIDE_ROLES = ['asistencia', 'escrituracion'];

// Roles que pueden administrar TODA la cartera de clientes (asignarlos a
// cualquier asesor, reasignarlos, etc.) sin ser jefes del sistema.
// - asistencia: recibe prospectos y los reparte entre los asesores.
const CLIENT_WIDE_ROLES = ['asistencia'];

function roleCode(req) {
  const role = req && req.user && req.user.role;
  return String((role && (role.code || role)) || '');
}

function hasRole(req, codes) {
  const code = roleCode(req);
  return Boolean(code) && codes.includes(code);
}

/**
 * Códigos de permiso del rol cargado en req.user.role.permissions.
 * `protect` populates permissions, pero también aceptamos IDs/strings para no
 * romper llamadas internas o tokens antiguos.
 */
function permissionCodes(req) {
  const role = req && req.user && req.user.role;
  if (!role || !Array.isArray(role.permissions)) return [];
  return role.permissions
    .map((permission) => (permission && permission.code ? permission.code : String(permission || '')))
    .filter(Boolean);
}

function hasPermission(req, codes) {
  const wanted = Array.isArray(codes) ? codes : [codes];
  const granted = permissionCodes(req);
  return wanted.some((code) => code && granted.includes(code));
}

function isCustomRole(req) {
  const code = roleCode(req);
  return Boolean(code) && !OFFICIAL_ROLE_CODES.includes(code);
}

function isBoss(req) {
  return hasRole(req, BOSS_ROLES) || hasPermission(req, SYSTEM_ADMIN_PERMISSION);
}

/** ¿Puede ver/operar todos los negocios, aunque no sea jefe? */
function isBusinessStaff(req) {
  return isBoss(req)
    || hasRole(req, BUSINESS_WIDE_ROLES)
    || (isCustomRole(req) && hasPermission(req, 'businesses_manage'));
}

/** ¿Puede ver/administrar toda la cartera de clientes? */
function isClientStaff(req) {
  return isBoss(req)
    || hasRole(req, CLIENT_WIDE_ROLES)
    || (isCustomRole(req) && hasPermission(req, 'clients_manage'));
}

/**
 * Condición Mongo que limita un registro a un usuario según el campo(s)
 * propietario del modelo.
 *  - ownerField simple:   { responsibleUser: userId }
 *  - ownerMatch(userId):  condición compuesta (p. ej. negocios con asesor principal o socio).
 */
function scopeCondition(ownerField, ownerMatch, userId) {
  if (typeof ownerMatch === 'function') return ownerMatch(userId);
  if (ownerField) return { [ownerField]: userId };
  return {};
}

/** Middleware Express: solo admin/dirección/gerencia pueden pasar. */
function bossOnly(req, res, next) {
  if (!isBoss(req)) {
    return res.status(403).json({ success: false, message: 'Solo dirección, administración y gerencia pueden realizar esta acción.' });
  }
  return next();
}

module.exports = {
  BOSS_ROLES,
  BUSINESS_WIDE_ROLES,
  CLIENT_WIDE_ROLES,
  OFFICIAL_ROLE_CODES,
  SYSTEM_ADMIN_PERMISSION,
  roleCode,
  hasRole,
  permissionCodes,
  hasPermission,
  isCustomRole,
  isBoss,
  isBusinessStaff,
  isClientStaff,
  scopeCondition,
  bossOnly,
};
