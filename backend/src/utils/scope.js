'use strict';

// Roles que ven TODA la información de la empresa.
const BOSS_ROLES = ['admin', 'gerencia'];

function isBoss(req) {
  return Boolean(req && req.user && req.user.role && BOSS_ROLES.includes(req.user.role.code));
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

/** Middleware Express: solo admin/gerencia pueden pasar. */
function bossOnly(req, res, next) {
  if (!isBoss(req)) {
    return res.status(403).json({ success: false, message: 'Solo administración y gerencia pueden realizar esta acción.' });
  }
  return next();
}

module.exports = { BOSS_ROLES, isBoss, scopeCondition, bossOnly };
