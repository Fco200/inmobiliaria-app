'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

test('Citas quedó fusionado en Calendario sin perder el formulario ni los datos', () => {
  const nav = read('frontend', 'js', 'multipage.js');
  const calendarHtml = read('frontend', 'calendar.html');
  const legacyHtml = read('frontend', 'appointments.html');
  const appointments = read('frontend', 'pages', 'appointments', 'appointments.js');
  const calendar = read('frontend', 'pages', 'calendar', 'calendar.js');
  const service = read('frontend', 'js', 'services', 'index.js');

  // El menú ya no ofrece Citas; la URL antigua redirige al Calendario.
  assert.doesNotMatch(nav, /key: 'appointments'[^}]*href: 'appointments\.html'/);
  assert.doesNotMatch(nav, /'appointments\.html'/);
  assert.match(nav, /key: 'calendar'[^}]*href: 'calendar\.html'/);
  assert.match(legacyHtml, /url=calendar\.html/);
  assert.match(legacyHtml, /location\.replace\('calendar\.html'/);

  // Calendario usa el MISMO formulario de citas (campos, filtros y validación).
  assert.match(calendarHtml, /pages\/appointments\/appointments\.js/);
  assert.match(appointments, /window\.AppointmentsUI = \{/);
  assert.match(appointments, /API\.appointments\.create/);
  assert.match(appointments, /API\.appointments\.update/);
  assert.match(appointments, /API\.appointments\.remove/);
  assert.match(calendar, /window\.AppointmentsUI\.mount\(appointmentsPanel/);
  assert.match(calendar, /onChanged:\s*\(\)\s*=>\s*\{\s*refreshView\(\);/);
  assert.match(calendar, /data-edit-appointment/);
  assert.match(service, /get: \(id\) => ApiClient\.get\(`\/appointments\/\$\{id\}`\)/);
});

test('los días con actividad llevan puntitos de color en mes, semana y día', () => {
  const calendar = read('frontend', 'pages', 'calendar', 'calendar.js');
  const css = read('frontend', 'css', 'base.css');

  assert.match(calendar, /function dayDots\(events\)/);
  assert.match(calendar, /class="cal-dots"/);
  assert.match(calendar, /class="cal-cell-top"/);
  assert.match(calendar, /cal-weekcol-head[\s\S]*\$\{dayDots\(events\)\}/);
  assert.match(calendar, /cal-day-head[\s\S]*\$\{dayDots\(events\)\}/);
  assert.match(calendar, /class="cal-event cal-event-week"[^\n]*--ev-color/);
  assert.match(css, /\.cal-dot \{[^}]*--dot-color/);
});

test('las reuniones se pintan de verde en calendario y en el componente compartido', () => {
  const backend = read('backend', 'src', 'controllers', 'calendar.controller.js');
  const calendar = read('frontend', 'pages', 'calendar', 'calendar.js');
  const shared = read('frontend', 'js', 'components', 'calendarView.js');

  assert.match(backend, /meeting: \{ label: 'Reunión', color: '#16a34a' \}/);
  assert.match(calendar, /meeting: \{ label: 'Reuniones', color: '#16a34a' \}/);
  assert.match(shared, /meeting: \{ label: 'Reuniones', color: '#16a34a' \}/);
  assert.doesNotMatch(calendar, /meeting: \{ label: 'Reuniones', color: '#d97706' \}/);
});
