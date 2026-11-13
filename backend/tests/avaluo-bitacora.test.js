'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

test('el módulo Avalúo usa la misma bitácora, checklist e impresión que Negocios', () => {
  const avaluo = read('frontend', 'pages', 'avaluo', 'avaluo.js');

  // Los botones son los mismos que en Negocios y la tabla no se estira.
  assert.match(avaluo, /compactRows:\s*true/);
  assert.match(avaluo, /actionsGrid:\s*true/);
  assert.match(avaluo, /data-bitacora/);
  assert.match(avaluo, /data-print-bitacora/);
  assert.match(avaluo, /data-checklist/);

  // La impresión incluye checklist e historial y lanza el diálogo.
  assert.match(avaluo, /Checklist \(\$\{hechos\} de \$\{checklist\.length\} completados\)/);
  assert.match(avaluo, /Historial cronológico/);
  assert.match(avaluo, /win\.print\(\)/);
});

test('la bitácora de Avalúo permite editar y eliminar notas', () => {
  const avaluo = read('frontend', 'pages', 'avaluo', 'avaluo.js');
  const services = read('frontend', 'js', 'services', 'index.js');
  const routes = read('backend', 'src', 'routes', 'appraisal.routes.js');
  const controller = read('backend', 'src', 'controllers', 'appraisal.controller.js');

  assert.match(avaluo, /data-bitacora-edit=/);
  assert.match(avaluo, /data-bitacora-delete=/);
  assert.match(avaluo, /API\.avaluos\.updateBitacora\(recordId, entryId, message\)/);
  assert.match(avaluo, /API\.avaluos\.removeBitacora\(recordId, entryId\)/);

  assert.match(services, /updateBitacora: \(id, entryId, message\) => ApiClient\.patch\(`\/avaluos\/\$\{id\}\/bitacora\/\$\{entryId\}`/);
  assert.match(services, /removeBitacora: \(id, entryId\) => ApiClient\.remove\(`\/avaluos\/\$\{id\}\/bitacora\/\$\{entryId\}`/);

  assert.match(routes, /router\.patch\('\/:id\/bitacora\/:entryId'/);
  assert.match(routes, /router\.delete\('\/:id\/bitacora\/:entryId'/);
  assert.match(controller, /const updateBitacora = asyncHandler/);
  assert.match(controller, /const removeBitacora = asyncHandler/);
  // Los movimientos automáticos se conservan: sólo las notas manuales se tocan.
  assert.match(controller, /entry\.action !== 'nota'/);
});

test('el checklist de Avalúo permite agregar, marcar, editar y quitar', () => {
  const avaluo = read('frontend', 'pages', 'avaluo', 'avaluo.js');

  assert.match(avaluo, /data-add-check/);
  assert.match(avaluo, /data-check=/);
  assert.match(avaluo, /data-edit-check=/);
  assert.match(avaluo, /data-save-check=/);
  assert.match(avaluo, /data-del-check=/);
  assert.match(avaluo, /API\.avaluos\.saveChecklist\(recordId/);
});
