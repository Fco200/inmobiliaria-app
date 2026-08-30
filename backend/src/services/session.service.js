'use strict';

const crypto = require('crypto');
const { Session } = require('../models');

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
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

module.exports = { hashToken, createSession, touchSession, revokeSessionByToken };
