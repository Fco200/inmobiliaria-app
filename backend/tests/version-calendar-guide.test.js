'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

test('la versión 2.40 conserva la novedad destacada de citas en Calendario', () => {
  const meta = JSON.parse(read('backend', 'version.json'));
  assert.equal(meta.version, '2.40');
  assert.ok(meta.spotlight, 'debe existir una novedad destacada');
  assert.equal(meta.spotlight.type, 'calendar-citas');
  assert.match(meta.spotlight.title, /TUS CITAS AHORA DESDE CALENDARIO/);
  assert.match(meta.spotlight.cta, /IR AHÍ/);
  assert.equal(meta.spotlight.steps.length, 3);
  assert.match(meta.spotlight.steps[0].text, /agendar tu cita/);
  assert.match(meta.spotlight.steps[0].href, /new=appointment/);
  assert.match(meta.spotlight.steps[1].text, /calendario y ver los detalles/);
  assert.match(meta.spotlight.steps[2].text, /Semanal y ve pintado de color/);
  assert.ok(meta.notes.some((n) => /citas ahora desde Calendario/i.test(n)));
});

test('el backend reenvía la novedad destacada al frontend', () => {
  const service = read('backend', 'src', 'services', 'version.service.js');
  assert.match(service, /const spotlight = meta\.spotlight/);
  assert.match(service, /notes,\s*commits,\s*spotlight,/);
  assert.match(service, /spotlight: null/);
});

test('el modal de novedades muestra la mini guía animada con botón "Ir ahí"', () => {
  const appVersion = read('frontend', 'js', 'appVersion.js');
  const css = read('frontend', 'css', 'base.css');

  assert.match(appVersion, /buildSpotlightMarkup\(spotlight, versionText\)/);
  assert.match(appVersion, /setupSpotlightGuide\(overlay, spotlight, close\)/);
  assert.match(appVersion, /data-goto-calendar/);
  assert.match(appVersion, /window\.location\.href = 'calendar\.html'/);
  assert.match(appVersion, /Continuar →/);
  assert.match(appVersion, /Entendido ✓/);
  assert.match(appVersion, /cal-guide-link/);
  assert.match(appVersion, /Clic aquí para agendar tu cita/);
  assert.match(appVersion, /Luego clic aquí en Semanal y ve pintado de color lo que tienes/);
  assert.match(css, /@keyframes calGuideIn/);
  assert.match(css, /\.whatsnew-overlay\.show \.cal-guide-step\.active/);
  assert.match(css, /@keyframes calGuideCta/);
});
