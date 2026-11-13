'use strict';

// Aviso de NUEVA VERSIÓN.
//
// Se dispara al arrancar el servidor después de un despliegue. Compara la
// versión publicada (version.json) con la última que ya se notificó (guardada
// en Config) y, si cambió:
//   1. envía una notificación push a TODOS los dispositivos suscritos,
//   2. emite un evento Socket.IO a las sesiones abiertas para que la app
//      muestre su banner/modal de actualización.
//
// NO envía correo: el usuario pidió expresamente que el aviso sea sólo dentro
// de la app y por notificación push.

const { getVersion } = require('./version.service');
const { isProduction } = require('../config/env');
const logger = require('./logger.service');
const { Config, PushSubscription } = require('../models');

const CONFIG_KEY = 'lastNotifiedVersion';
const NOTICE_TAG = 'nueva-version';

// Envía el push a cada usuario que tenga al menos un dispositivo suscrito.
// Se hace por usuario (no por suscripción) para reutilizar la deduplicación y
// limpieza de endpoints caducados de push.service.
async function pushToSubscribedUsers(payload) {
  const push = require('./push.service');
  if (!push.isConfigured()) {
    return { sent: 0, total: 0, users: 0, configured: false };
  }
  const userIds = await PushSubscription.distinct('user');
  const valid = (userIds || []).filter(Boolean);
  let sent = 0;
  let total = 0;
  // Lotes pequeños: no satura el pool de conexiones ni el proveedor de push.
  for (let i = 0; i < valid.length; i += 10) {
    const batch = valid.slice(i, i + 10);
    const results = await Promise.all(
      batch.map((userId) =>
        push
          .notifyUser(String(userId), payload)
          .catch(() => null)
      )
    );
    results.forEach((result) => {
      if (!result) return;
      sent += Number(result.sent) || 0;
      total += Number(result.total) || 0;
    });
  }
  return { sent, total, users: valid.length, configured: true };
}

async function notifyNewVersion({ io } = {}) {
  try {
    // En desarrollo no se avisa a los dispositivos reales en cada reinicio.
    if (!isProduction && String(process.env.VERSION_NOTICE_FORCE || '') !== '1') {
      return { skipped: true, reason: 'development' };
    }

    const meta = await getVersion();
    const version = String((meta && meta.version) || '').trim();
    if (!version || version === 'dev') {
      return { skipped: true, reason: 'sin-version' };
    }

    const previous = await Config.findOne({ key: CONFIG_KEY }).lean();
    if (previous && String(previous.value) === version) {
      return { skipped: true, reason: 'ya-notificada', version };
    }

    const payload = {
      title: `Nueva versión ${version} disponible`,
      body: 'Abre INMOBLES y toca "Ver mejoras" para actualizar la app.',
      url: 'actualizaciones.html',
      tag: NOTICE_TAG,
    };

    const pushResult = await pushToSubscribedUsers(payload);

    const eventPayload = {
      version,
      hash: meta.hash || '',
      title: meta.title || 'Nueva versión disponible',
      notes: Array.isArray(meta.notes) ? meta.notes.slice(0, 6) : [],
      date: meta.date || null,
    };
    try {
      if (io) io.emit('nueva-version', eventPayload);
    } catch (error) {
      logger.warn('No se pudo emitir el aviso de nueva versión por Socket.IO', {
        reason: error && error.message,
      }, 'version');
    }

    // Se marca como notificada una sola vez por versión. Si VAPID aún no está
    // configurado en el servidor, NO se guarda la marca: así el push se
    // reintenta en el siguiente arranque después de configurarlo.
    if (pushResult.configured) {
      await Config.findOneAndUpdate(
        { key: CONFIG_KEY },
        {
          $set: {
            value: version,
            group: 'sistema',
            description: 'Última versión que ya se avisó por push y dentro de la app.',
          },
        },
        { upsert: true }
      );
    } else {
      logger.warn('Push sin configurar: el aviso de versión se reintentará al configurar VAPID', {
        version,
      }, 'version');
    }

    logger.info('Aviso de nueva versión enviado', {
      version,
      pushSent: pushResult.sent,
      pushTotal: pushResult.total,
      users: pushResult.users,
      pushConfigured: pushResult.configured,
      socket: Boolean(io),
    }, 'version');

    return { version, ...pushResult, event: eventPayload };
  } catch (error) {
    logger.warn('No se pudo enviar el aviso de nueva versión', {
      reason: error && error.message,
    }, 'version');
    return { error: error && error.message };
  }
}

module.exports = { notifyNewVersion };
