'use strict';

const { generateForAllUsers, generateCustomReminders } = require('../services/notification.service');
const { updateGoalsAuto } = require('../services/goal-auto.service');
const { isProduction } = require('../config/env');

const NOTIFICATION_INTERVAL_MS = 15 * 60 * 1000; // cada 15 minutos
const REMINDER_INTERVAL_MS = 60 * 1000; // recordatorios personales: cada minuto
const GOALS_INTERVAL_MS = 30 * 60 * 1000; // cada 30 minutos

let notificationTimer = null;
let reminderTimer = null;
let goalsTimer = null;

// Genera avisos automáticos para todos los usuarios y recalcula el avance de metas.
async function runNotificationJob() {
  try {
    const totals = await generateForAllUsers();
    console.log(`[Job] Avisos automáticos: ${totals.notifications} nuevos para ${totals.users} usuarios.`);
  } catch (error) {
    console.error('[Job] Error al generar avisos automáticos:', error.message);
  }
}

async function runReminderJob() {
  try {
    const created = await generateCustomReminders();
    if (created > 0) console.log(`[Job] Recordatorios personales: ${created} nuevos.`);
  } catch (error) {
    console.error('[Job] Error al generar recordatorios personales:', error.message);
  }
}

async function runGoalsJob() {
  try {
    const updated = await updateGoalsAuto();
    if (updated > 0) console.log(`[Job] Avance de metas recalculado para ${updated} metas.`);
  } catch (error) {
    console.error('[Job] Error al recalcular metas:', error.message);
  }
}

function startJobs() {
  if (notificationTimer || reminderTimer || goalsTimer) return;
  notificationTimer = setInterval(runNotificationJob, NOTIFICATION_INTERVAL_MS);
  reminderTimer = setInterval(runReminderJob, REMINDER_INTERVAL_MS);
  goalsTimer = setInterval(runGoalsJob, GOALS_INTERVAL_MS);

  // Primer ciclo al arrancar (solo en producción para no entorpecer el desarrollo).
  if (isProduction) {
    runNotificationJob();
    runReminderJob();
    runGoalsJob();
  }

  notificationTimer.unref();
  reminderTimer.unref();
  goalsTimer.unref();
  console.log('[Jobs] Programados: avisos automáticos, recordatorios personales y recálculo de metas.');
}

function stopJobs() {
  if (notificationTimer) clearInterval(notificationTimer);
  if (reminderTimer) clearInterval(reminderTimer);
  if (goalsTimer) clearInterval(goalsTimer);
  notificationTimer = null;
  reminderTimer = null;
  goalsTimer = null;
}

module.exports = { startJobs, stopJobs };
