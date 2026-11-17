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

test('la bitácora de Avalúo ya no muestra opciones de editar ni eliminar notas', () => {
  const avaluo = read('frontend', 'pages', 'avaluo', 'avaluo.js');

  assert.doesNotMatch(avaluo, /data-bitacora-edit=/, 'no debe existir el botón Editar');
  assert.doesNotMatch(avaluo, /data-bitacora-delete=/, 'no debe existir el botón Eliminar');
  assert.doesNotMatch(avaluo, /API\.avaluos\.updateBitacora\(/, 'la vista no debe llamar a actualizar notas');
  assert.doesNotMatch(avaluo, /API\.avaluos\.removeBitacora\(/, 'la vista no debe llamar a eliminar notas');
  assert.match(avaluo, /data-add-bitacora/, 'seguir permitiendo agregar notas');
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
