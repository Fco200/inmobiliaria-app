'use strict';

/**
 * Notificaciones push nativas (Web Push) para Android, iOS y escritorio.
 *
 * - Usa el paquete oficial `web-push` cuando está instalado
 *   (`npm install web-push`) y, si no, el motor integrado
 *   (services/webpush.engine.js) que implementa RFC 8291 + VAPID con el módulo
 *   `crypto` de Node. Ambos exponen la misma interfaz.
 * - Las llaves VAPID vienen de las variables de entorno VAPID_PUBLIC_KEY /
 *   VAPID_PRIVATE_KEY / VAPID_SUBJECT.
 *
 * Flujo: el navegador se suscribe (pushManager.subscribe) → el backend lo
 * guarda en PushSubscription → cada aviso interno dispara notifyUser().
 */

const env = require('../config/env');
const logger = require('./logger.service');
const { PushSubscription } = require('../models');

let engine;
let engineName;
try {
  // eslint-disable-next-line global-require
  engine = require('web-push');
  engineName = 'web-push';
} catch (error) {
  // eslint-disable-next-line global-require
  engine = require('./webpush.engine');
  engineName = 'motor integrado (RFC 8291)';
}

let configured = false;

function isConfigured() {
  return Boolean(env.vapidPublicKey && env.vapidPrivateKey);
}

function ensureConfigured() {
  if (!isConfigured()) return false;
  if (!configured) {
    engine.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
    configured = true;
    logger.info(`Notificaciones push activas (${engineName}).`, {}, 'push');
  }
  return true;
}

function getEngineName() {
  return engineName;
}

function getPublicKey() {
  return isConfigured() ? env.vapidPublicKey : '';
}

// Registra o actualiza la suscripción de un navegador para el usuario actual.
async function saveSubscription(userId, subscription) {
  const endpoint = String((subscription && subscription.endpoint) || '').trim();
  const p256dh = String((subscription && subscription.keys && subscription.keys.p256dh) || '').trim();
  const auth = String((subscription && subscription.keys && subscription.keys.auth) || '').trim();

  if (!endpoint || !p256dh || !auth) {
    throw new Error('Suscripción incompleta: se requiere endpoint, keys.p256dh y keys.auth.');
  }
  if (!endpoint.startsWith('https://') && !endpoint.startsWith('http://')) {
    throw new Error('El endpoint de la suscripción no es una URL válida.');
  }

  const doc = await PushSubscription.findOneAndUpdate(
    { user: userId, endpoint },
    {
      $set: {
        keys: { p256dh, auth },
        userAgent: String((subscription && subscription.userAgent) || '').slice(0, 300),
        lastUsedAt: new Date(),
      },
      $setOnInsert: { user: userId, endpoint },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return doc;
}

async function removeSubscription(userId, endpoint) {
  const clean = String(endpoint || '').trim();
  if (!clean) return { removed: 0 };
  const result = await PushSubscription.deleteOne({ user: userId, endpoint: clean });
  return { removed: result.deletedCount || 0 };
}

// 404/410 = suscripción caducada o desconocida por el servicio de push.
function isGoneError(error) {
  const status = error && error.statusCode;
  return status === 404 || status === 410;
}

async function sendToSubscription(sub, payload) {
  try {
    const response = await engine.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      typeof payload === 'string' ? payload : JSON.stringify(payload)
    );
    await PushSubscription.updateOne({ _id: sub._id }, { $set: { lastUsedAt: new Date() } });
    return { ok: true, statusCode: response && response.statusCode };
  } catch (error) {
    if (isGoneError(error)) {
      // El navegador ya no existe (cerró la app, limpió datos...): se borra.
      await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {});
      return { ok: false, gone: true, statusCode: error.statusCode };
    }
    logger.warn('No se pudo enviar la notificación push', {
      endpoint: sub.endpoint,
      reason: error && error.message,
      statusCode: error && error.statusCode,
    }, 'push');
    return { ok: false, error: error && error.message };
  }
}

/**
 * Envía una notificación a TODOS los dispositivos suscritos de un usuario.
 * `payload` = { title, body, url, tag, icon }.
 */
async function sendToUser(userId, payload) {
  if (!userId || !ensureConfigured()) return { sent: 0, total: 0 };
  const subs = await PushSubscription.find({ user: userId });
  if (!subs.length) return { sent: 0, total: 0 };

  const results = await Promise.all(subs.map((sub) => sendToSubscription(sub, payload)));
  return {
    sent: results.filter((r) => r.ok).length,
    total: subs.length,
  };
}

/**
 * Auxiliar para disparar notificaciones cuando ocurren eventos internos
 * (avisos, citas, tareas, chats...). Nunca lanza: un fallo de push no debe
 * romper el flujo de la aplicación.
 */
async function notifyUser(userId, { title, body, url, tag, icon, data } = {}) {
  try {
    if (!userId || !title) return null;
    const payload = {
      title: String(title),
      body: String(body || ''),
      url: url || '/',
      tag: tag ? String(tag) : '',
      icon: icon || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: data || null,
    };
    return await sendToUser(userId, payload);
  } catch (error) {
    logger.warn('Error al notificar por push', { reason: error && error.message }, 'push');
    return null;
  }
}

// Envío de prueba (botón en Configuración) para validar la cadena completa.
async function sendTest(userId) {
  if (!ensureConfigured()) {
    throw new Error('Faltan las llaves VAPID (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY) en el servidor.');
  }
  return sendToUser(userId, {
    title: 'Notificaciones activas',
    body: 'Ya recibirás los avisos de INMOBLES en este dispositivo.',
    url: 'notifications.html',
    tag: 'push-test',
  });
}

module.exports = {
  isConfigured,
  ensureConfigured,
  getEngineName,
  getPublicKey,
  saveSubscription,
  removeSubscription,
  sendToUser,
  sendTest,
  notifyUser,
};
