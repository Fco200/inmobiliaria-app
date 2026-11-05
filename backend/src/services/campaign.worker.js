'use strict';

// Trabajador de campañas de correo del boletín.
//
// - Cada campaña tiene sus destinatarios guardados (CampaignRecipient). Al
//   enviar, se marca cada destinatario como enviado o fallido, así que reanudar
//   una campaña nunca vuelve a enviar a quien ya recibió el correo.
// - Una campaña la procesa un solo proceso a la vez: se toma con una concesión
//   (lockedBy + leaseUntil) que se renueva en cada lote. Si el proceso se cae,
//   la concesión expira y otro proceso retoma desde los pendientes.
// - Al apagar el servidor se termina el lote en curso, se libera la concesión y
//   la campaña queda lista para retomarse.

const os = require('os');
const crypto = require('crypto');
const { Campaign, CampaignRecipient } = require('../models');
const { sendMailWithin, mailNewsletterCampaign } = require('./mail.service');
const { logActivity } = require('./log.service');

const WORKER_ID = `${os.hostname()}-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
const LEASE_MS = 60 * 1000;
const BATCH_SIZE = 10;
const TICK_MS = 5000;
const MAX_ATTEMPTS = 5;

let timer = null;
let busy = false;
let stopping = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function claimCampaign() {
  const now = new Date();
  return Campaign.findOneAndUpdate(
    {
      status: { $in: ['en_cola', 'en_proceso'] },
      attempts: { $lt: MAX_ATTEMPTS },
      $or: [{ leaseUntil: null }, { leaseUntil: { $lt: now } }],
    },
    {
      $set: { status: 'en_proceso', lockedBy: WORKER_ID, leaseUntil: new Date(now.getTime() + LEASE_MS) },
      $inc: { attempts: 1 },
    },
    { sort: { createdAt: 1 }, new: true }
  );
}

async function renewLease(campaignId) {
  const res = await Campaign.updateOne(
    { _id: campaignId, lockedBy: WORKER_ID },
    { $set: { leaseUntil: new Date(Date.now() + LEASE_MS) } }
  );
  return res.matchedCount === 1;
}

async function releaseLease(campaignId) {
  await Campaign.updateOne(
    { _id: campaignId, lockedBy: WORKER_ID },
    { $set: { lockedBy: null, leaseUntil: null } }
  );
}

async function countByStatus(campaignId) {
  const rows = await CampaignRecipient.aggregate([
    { $match: { campaign: campaignId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const counts = { pendiente: 0, enviado: 0, fallido: 0 };
  rows.forEach((row) => { counts[row._id] = row.count; });
  return counts;
}

async function sendToRecipient(campaign, recipient) {
  try {
    const mail = mailNewsletterCampaign({
      email: recipient.email,
      name: recipient.name,
      subject: campaign.subject,
      message: campaign.message,
      intro: campaign.intro || undefined,
    });
    // Con límite de tiempo: una campaña no debe quedarse colgada esperando a
    // un SMTP bloqueado. Un envío simulado (sin proveedor) NO cuenta como
    // entregado: el panel debe reflejar la verdad.
    const result = await sendMailWithin(mail, 12000);
    if (result && result.sent && !result.simulated) {
      return { status: 'enviado', sentAt: new Date(), error: '' };
    }
    if (result && result.simulated) {
      return {
        status: 'fallido',
        sentAt: null,
        error: 'No hay proveedor de correo configurado: el envío se simuló y no llegó.',
      };
    }
    return {
      status: 'fallido',
      sentAt: null,
      error: String((result && result.error) || 'El servidor de correo no aceptó el mensaje.').slice(0, 300),
    };
  } catch (error) {
    return { status: 'fallido', sentAt: null, error: String(error.message || 'Error al enviar').slice(0, 300) };
  }
}

// Procesa lotes hasta terminar, o hasta que se pida detener el servidor.
async function runCampaign(campaign) {
  const campaignId = campaign._id;

  while (!stopping) {
    // eslint-disable-next-line no-await-in-loop
    const batch = await CampaignRecipient.find({ campaign: campaignId, status: 'pendiente' })
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .lean();
    if (!batch.length) break;

    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.all(batch.map(async (recipient) => ({
      recipient,
      result: await sendToRecipient(campaign, recipient),
    })));

    // eslint-disable-next-line no-await-in-loop
    await CampaignRecipient.bulkWrite(results.map(({ recipient, result }) => ({
      updateOne: {
        filter: { _id: recipient._id, status: 'pendiente' },
        update: { $set: result },
      },
    })));

    // eslint-disable-next-line no-await-in-loop
    const counts = await countByStatus(campaignId);
    // eslint-disable-next-line no-await-in-loop
    const stillOurs = await renewLease(campaignId);
    // eslint-disable-next-line no-await-in-loop
    await Campaign.updateOne(
      { _id: campaignId },
      { $set: { enviados: counts.enviado, fallidos: counts.fallido } }
    );
    if (!stillOurs) return;
  }

  if (stopping) {
    await releaseLease(campaignId);
    return;
  }

  const counts = await countByStatus(campaignId);
  // Si no salió ni un correo y hubo fallos, la campaña es "fallida": así el
  // panel de soporte no muestra como exitoso un envío que en realidad no llegó.
  const finalStatus = counts.enviado === 0 && counts.fallido > 0 ? 'fallida' : 'completada';
  const finished = await Campaign.findOneAndUpdate(
    { _id: campaignId, lockedBy: WORKER_ID },
    {
      $set: {
        status: finalStatus,
        enviados: counts.enviado,
        fallidos: counts.fallido,
        finishedAt: new Date(),
        lockedBy: null,
        leaseUntil: null,
      },
    },
    { new: true }
  );
  if (!finished) return;

  await logActivity({
    entityType: 'Newsletter',
    entityId: finished.createdBy || finished._id,
    user: finished.createdBy,
    action: 'campana_newsletter',
    message: finalStatus === 'fallida'
      ? `La campaña "${finished.subject}" no pudo entregarse (${counts.fallidos} fallidos). Revisa el estado del correo.`
      : `Campaña "${finished.subject}" enviada a ${counts.enviado} destinatarios (${finished.audience})`,
    data: {
      subject: finished.subject,
      audience: finished.audience,
      role: finished.role || '',
      total: finished.total,
      enviados: counts.enviado,
      fallidos: counts.fallido,
      status: finalStatus,
    },
  });
}

async function tick() {
  if (busy || stopping) return;
  busy = true;
  let campaign = null;
  try {
    campaign = await claimCampaign();
    if (!campaign) return;
    await runCampaign(campaign);
  } catch (error) {
    console.error('[Campañas] Error al procesar la campaña:', error.message);
    if (campaign) {
      try {
        const exhausted = campaign.attempts >= MAX_ATTEMPTS;
        await Campaign.updateOne(
          { _id: campaign._id, lockedBy: WORKER_ID },
          {
            $set: {
              lockedBy: null,
              leaseUntil: null,
              ...(exhausted ? { status: 'fallida', finishedAt: new Date() } : {}),
            },
          }
        );
      } catch (releaseError) {
        console.error('[Campañas] No se pudo liberar la campaña:', releaseError.message);
      }
    }
  } finally {
    busy = false;
  }
}

// Arranca el trabajador (revisa la cola cada pocos segundos).
function startCampaignWorker() {
  if (timer) return;
  stopping = false;
  timer = setInterval(() => { tick(); }, TICK_MS);
  tick();
}

// Revisa la cola de inmediato (se llama al crear una campaña).
function kick() {
  if (!stopping) setImmediate(() => { tick(); });
}

// Detiene el trabajador: termina el lote en curso y libera la campaña.
async function stopCampaignWorker(maxWaitMs = 25000) {
  stopping = true;
  if (timer) clearInterval(timer);
  timer = null;
  const started = Date.now();
  while (busy && Date.now() - started < maxWaitMs) {
    // eslint-disable-next-line no-await-in-loop
    await sleep(200);
  }
}

module.exports = {
  WORKER_ID,
  startCampaignWorker,
  stopCampaignWorker,
  kick,
};
