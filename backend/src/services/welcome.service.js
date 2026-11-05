'use strict';

// Envío confiable del correo de bienvenida al boletín.
//
// Antes el correo se enviaba dentro de la misma petición de suscripción. Si el
// proveedor tardaba más de 10 segundos (o estaba mal configurado), el usuario
// veía "No pudimos enviar el correo" aunque la suscripción sí quedaba guardada.
// Ahora la suscripción encola el correo y responde al instante; un trabajo en
// segundo plano lo envía y reintenta los fallos, incluso si el proveedor se
// configura después.

const { Newsletter } = require('../models');
const { sendMailWithin, mailWelcome } = require('./mail.service');

const MAX_ATTEMPTS = 8;
const RETRY_AFTER_MS = 5 * 60 * 1000; // 5 minutos entre intentos
const BATCH_SIZE = 25;
const SEND_TIMEOUT_MS = 15000; // mayor que el timeout HTTP (12 s)
const JOB_INTERVAL_MS = 2 * 60 * 1000; // revisa pendientes cada 2 minutos

let running = false;
let timer = null;

function kickWelcomeQueue() {
  // Se ejecuta fuera de la petición: la respuesta al usuario no espera al
  // proveedor de correo. El candado `running` evita envíos duplicados.
  setImmediate(() => {
    runWelcomeQueue().catch((error) => {
      console.error('[Welcome] Error en la cola de bienvenidas:', error.message);
    });
  });
}

/**
 * Marca una suscripción para enviar (o reintentar) su correo de bienvenida.
 * No envía en el momento: deja el trabajo a la cola.
 */
async function queueWelcome(sub, { reset = false } = {}) {
  if (!sub) return sub;
  if (!reset && sub.welcomeStatus === 'enviado') return sub;

  sub.welcomeStatus = 'pendiente';
  sub.welcomeLastAttemptAt = null;
  if (reset) {
    sub.welcomeAttempts = 0;
    sub.welcomeLastError = '';
  }
  await sub.save();
  kickWelcomeQueue();
  return sub;
}

async function sendWelcomeRecord(record) {
  const result = await sendMailWithin(mailWelcome(record.email, record.name), SEND_TIMEOUT_MS);
  if (result.sent && !result.simulated) {
    await Newsletter.updateOne(
      { _id: record._id },
      {
        $set: {
          welcomeStatus: 'enviado',
          welcomeSentAt: new Date(),
          welcomeLastError: '',
        },
      }
    );
    return { sent: true, simulated: false };
  }

  // Un envío simulado solo significa "todavía no hay proveedor". No se deben
  // consumir intentos: en cuanto soporte configure Brevo/Resend/SendGrid, la
  // cola lo enviará automáticamente.
  const simulated = Boolean(result.simulated);
  const error = simulated
    ? 'No hay proveedor de correo configurado.'
    : String(result.error || 'Error desconocido al enviar el correo.').slice(0, 300);
  const attempts = simulated ? 0 : Number(record.welcomeAttempts) || 0;
  const final = !simulated && attempts >= MAX_ATTEMPTS;

  await Newsletter.updateOne(
    { _id: record._id },
    {
      $set: {
        welcomeStatus: final ? 'fallido' : 'pendiente',
        welcomeLastError: error,
        ...(simulated ? { welcomeAttempts: 0 } : {}),
      },
    }
  );

  return { sent: false, simulated, final, error };
}

/**
 * Procesa los correos de bienvenida pendientes. Toma cada registro con una
 * actualización atómica para que dos procesos no envíen el mismo correo.
 */
async function runWelcomeQueue({ limit = BATCH_SIZE } = {}) {
  if (running) return { skipped: true, processed: 0, sent: 0, failed: 0, pending: 0 };
  running = true;

  const summary = { skipped: false, processed: 0, sent: 0, failed: 0, pending: 0 };

  try {
    const stale = new Date(Date.now() - RETRY_AFTER_MS);
    const candidates = await Newsletter.find({
      welcomeStatus: 'pendiente',
      welcomeAttempts: { $lt: MAX_ATTEMPTS },
      $or: [{ welcomeLastAttemptAt: null }, { welcomeLastAttemptAt: { $lt: stale } }],
    })
      .sort({ createdAt: 1 })
      .limit(limit);

    for (const candidate of candidates) {
      const claimed = await Newsletter.findOneAndUpdate(
        {
          _id: candidate._id,
          welcomeStatus: 'pendiente',
          $or: [{ welcomeLastAttemptAt: null }, { welcomeLastAttemptAt: { $lt: stale } }],
        },
        {
          $set: { welcomeLastAttemptAt: new Date() },
          $inc: { welcomeAttempts: 1 },
        },
        { new: true }
      );
      if (!claimed) continue;

      summary.processed += 1;
      try {
        const outcome = await sendWelcomeRecord(claimed);
        if (outcome.sent) summary.sent += 1;
        else if (outcome.final) summary.failed += 1;
        else summary.pending += 1;
      } catch (error) {
        // Un error inesperado no debe detener el resto de la cola.
        const attempts = Number(claimed.welcomeAttempts) || 0;
        const final = attempts >= MAX_ATTEMPTS;
        if (final) summary.failed += 1;
        else summary.pending += 1;
        await Newsletter.updateOne(
          { _id: claimed._id },
          {
            $set: {
              welcomeStatus: final ? 'fallido' : 'pendiente',
              welcomeLastError: String(error.message || error).slice(0, 300),
            },
          }
        );
        console.error('[Welcome] Error inesperado con', claimed.email, ':', error.message);
      }
    }
  } finally {
    running = false;
  }

  if (summary.processed > 0) {
    console.log(
      `[Welcome] Cola de bienvenidas: ${summary.sent} enviadas, ${summary.pending} pendientes, ${summary.failed} fallidas.`
    );
  }
  return summary;
}

function startWelcomeJob() {
  if (timer) return;
  timer = setInterval(() => {
    runWelcomeQueue().catch((error) => {
      console.error('[Welcome] Error en el trabajo periódico:', error.message);
    });
  }, JOB_INTERVAL_MS);
  timer.unref();

  // Primer intento poco después de arrancar, sin bloquear el inicio.
  const kick = setTimeout(() => {
    runWelcomeQueue().catch((error) => {
      console.error('[Welcome] Error en el primer intento:', error.message);
    });
  }, 8000);
  kick.unref?.();

  console.log('[Jobs] Bienvenidas pendientes: cada 2 minutos.');
}

function stopWelcomeJob() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  queueWelcome,
  kickWelcomeQueue,
  runWelcomeQueue,
  startWelcomeJob,
  stopWelcomeJob,
  MAX_ATTEMPTS,
};
