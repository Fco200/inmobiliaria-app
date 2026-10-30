'use strict';

const crypto = require('crypto');
const { Session } = require('../models');

let ioRef = null;

function setIo(io) {
  ioRef = io;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// Sala de socket exclusiva de una sesión: solo los sockets conectados con ESE
// token (ese dispositivo) la escuchan. Así al revocar una sesión concreta solo
// se cierra ese dispositivo, no los demás.
function sessionRoom(tokenHash) {
  return `session:${tokenHash}`;
}

function revokeReasonMessage(reason) {
  const map = {
    SELF_REVOKED: 'Cerraste esta sesión desde otro dispositivo.',
    SELF_LOGOUT_OTHERS: 'Cerraste tu sesión en los demás dispositivos.',
    ADMIN_REVOKED: 'Tu sesión fue cerrada por un administrador.',
    USER_DEACTIVATED: 'Tu usuario fue desactivado por un administrador.',
    PASSWORD_CHANGED: 'Tu contraseña fue modificada. Inicia sesión de nuevo.',
    PASSWORD_RESET: 'Tu contraseña fue restablecida por soporte. Inicia sesión de nuevo.',
    MAINTENANCE: 'El sistema entró en mantenimiento. Tu sesión fue cerrada.',
  };
  return map[reason] || 'Tu sesión fue cerrada. Inicia sesión de nuevo.';
}

// Avisa en tiempo real a un dispositivo cuya sesión fue revocada:
//  - room `session:<hash>` → solo ese dispositivo recibe 'session-revoked'.
//  - room `user:<id>`     → todas sus pestañas refrescan listas ('sessions-changed').
// Además desconecta el socket del dispositivo afectado por seguridad.
async function emitRevoked(session, reason) {
  try {
    const io = ioRef;
    if (!io || !session || !session.tokenHash) return;
    const payload = { reason: reason || 'SESSION_REVOKED', message: revokeReasonMessage(reason) };
    const room = sessionRoom(session.tokenHash);
    io.to(room).emit('session-revoked', payload);
    const userId = session.user && typeof session.user === 'object' ? session.user._id : session.user;
    if (userId) io.to(`user:${String(userId)}`).emit('sessions-changed', {});
    try {
      const sockets = await io.in(room).fetchSockets();
      (sockets || []).forEach((s) => { try { s.disconnect(true); } catch (e) { /* noop */ } });
    } catch (e) { /* noop */ }
  } catch (e) {
    // silencioso: revocar una sesión nunca debe romper la petición
  }
}

async function createSession(userId, token, req = {}, options = {}) {
  const remember = options.remember || false;
  const expiresInMs =
    options.expiresInMs || (remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000);
  try {
    await Session.create({
      user: userId,
      tokenHash: hashToken(token),
      remember,
      device: req.headers && req.headers['user-agent']
        ? String(req.headers['user-agent']).slice(0, 300)
        : '',
      ip: req.ip || '',
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + expiresInMs),
    });
  } catch (error) {
    if (error.code === 11000) return; // token duplicado (misma sesión recién creada)
    console.error('[Session] Error al crear sesión:', error.message);
  }
}

async function touchSession(token) {
  try {
    await Session.updateOne(
      { tokenHash: hashToken(token) },
      { $set: { lastSeenAt: new Date() } }
    );
  } catch (error) {
    // silencioso: la actividad no debe romper la petición
  }
}

async function revokeSessionByToken(token) {
  try {
    await Session.deleteOne({ tokenHash: hashToken(token) });
  } catch (error) {
    // silencioso
  }
}

// Revoca UNA sesión ya cargada y avisa al dispositivo afectado en tiempo real.
async function revokeSession(session, reason) {
  try {
    if (!session) return { ok: false };
    await session.deleteOne();
    await emitRevoked(session, reason);
    return { ok: true, session };
  } catch (error) {
    return { ok: false };
  }
}

// Revoca una sesión por su _id (devuelve null si no existe).
async function revokeSessionById(sessionId, reason) {
  let session;
  try {
    session = await Session.findById(sessionId);
  } catch (error) {
    return { ok: false, notFound: true };
  }
  if (!session) return { ok: false, notFound: true };
  return revokeSession(session, reason);
}

// Revoca TODAS las sesiones de un usuario y avisa a cada dispositivo.
async function revokeUserSessions(userId, reason) {
  try {
    const sessions = await Session.find({ user: userId });
    const count = sessions.length;
    if (count) await Session.deleteMany({ user: userId });
    await Promise.all(sessions.map((s) => emitRevoked(s, reason)));
    return { ok: true, closed: count };
  } catch (error) {
    return { ok: false, closed: 0 };
  }
}

// Revoca todas las sesiones del usuario EXCEPTO la indicada (p. ej. la actual).
async function revokeUserSessionsExcept(userId, exceptHash, reason) {
  try {
    const sessions = await Session.find({ user: userId, tokenHash: { $ne: exceptHash } });
    const count = sessions.length;
    if (count) await Session.deleteMany({ user: userId, tokenHash: { $ne: exceptHash } });
    await Promise.all(sessions.map((s) => emitRevoked(s, reason)));
    return { ok: true, closed: count };
  } catch (error) {
    return { ok: false, closed: 0 };
  }
}

module.exports = {
  hashToken,
  setIo,
  sessionRoom,
  revokeReasonMessage,
  createSession,
  touchSession,
  revokeSessionByToken,
  revokeSession,
  revokeSessionById,
  revokeUserSessions,
  revokeUserSessionsExcept,
};
