'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

function loadFormat() {
  const source = read('frontend', 'js', 'utils', 'format.js');
  const sandbox = { Intl, Date, console };
  vm.createContext(sandbox);
  vm.runInContext(`${source}\n;globalThis.__Format = Format;`, sandbox);
  return sandbox.__Format;
}

test('las horas se convierten en la zona de Hermosillo (UTC-7, sin horario de verano)', () => {
  const Format = loadFormat();

  // Lo que captura el usuario a las 12:15 en Hermosillo se guarda como 19:15 UTC.
  assert.equal(Format.fromLocalInput('2026-11-12T12:15'), '2026-11-12T19:15:00.000Z');
  // Y al editar se vuelve a mostrar 12:15 (no 13:15 ni 11:15).
  assert.equal(Format.toLocalInput('2026-11-12T19:15:00.000Z'), '2026-11-12T12:15');
  // Una cita de las 12:20 con recordatorio 12:15 conserva ambos horarios.
  assert.equal(Format.fromLocalInput('2026-11-12T12:20'), '2026-11-12T19:20:00.000Z');
  assert.equal(Format.fromLocalInput(''), null);
});

test('las fechas sin hora se guardan al mediodía de Hermosillo para no cambiar de día', () => {
  const Format = loadFormat();
  assert.equal(Format.fromDateInput('2026-11-12'), '2026-11-12T19:00:00.000Z');
  assert.equal(Format.toDateInput('2026-11-12T19:00:00.000Z'), '2026-11-12');
});

test('el servidor interpreta las fechas sin zona como hora de Hermosillo', () => {
  const { parseLocalDateTime } = require('../src/utils/datetime');
  assert.equal(parseLocalDateTime('2026-11-12T12:15:00').toISOString(), '2026-11-12T19:15:00.000Z');
  assert.equal(parseLocalDateTime('2026-11-12T12:20').toISOString(), '2026-11-12T19:20:00.000Z');
  assert.equal(parseLocalDateTime('2026-11-12T19:15:00.000Z').toISOString(), '2026-11-12T19:15:00.000Z');
  assert.equal(parseLocalDateTime(''), null);
});

test('el selector con búsqueda acepta valores de objeto al editar', () => {
  const source = read('frontend', 'js', 'components', 'ui.js');
  // El bug original convertía { _id, name } en "[object Object]" y borraba la
  // relación al guardar. Debe normalizarse al id (o al valueField del origen).
  assert.match(source, /const rawValue = value && typeof value === 'object'/);
  assert.match(source, /value\[valueField\]/);
});

test('el job de recordatorios personales corre cada minuto', () => {
  const source = read('backend', 'src', 'jobs', 'notification.job.js');
  assert.match(source, /REMINDER_INTERVAL_MS = 60 \* 1000/);
  assert.match(source, /setInterval\(runReminderJob, REMINDER_INTERVAL_MS\)/);
  assert.match(source, /runReminderJob\(\)/);
});

test('los recordatorios usan la hora elegida y tienen ventana de recuperación', () => {
  const service = read('backend', 'src', 'services', 'notification.service.js');
  assert.match(service, /async function generateCustomReminders\(\)/);
  assert.match(service, /reminder: \{ \$ne: null, \$gte: from, \$lte: now \}/);
  assert.match(service, /REMINDER_LOOKBACK_MS/);

  const controller = read('backend', 'src', 'controllers', 'reminder.controller.js');
  assert.match(controller, /reminder: a\.reminder \|\| null/);
  assert.match(controller, /reminder: \{ \$gte: since, \$lte: end \}/);
});

test('el aviso de nueva versión no usa correo', () => {
  const source = read('backend', 'src', 'services', 'version-notice.service.js');
  assert.match(source, /io\.emit\('nueva-version'/);
  assert.match(source, /actualizaciones\.html/);
  assert.doesNotMatch(source, /sendMail|mail\.service|enviarCorreo/);
});
