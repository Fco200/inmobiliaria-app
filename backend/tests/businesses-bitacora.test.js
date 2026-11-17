'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

test('los botones del embudo de Negocios aplican el filtro de etapa', () => {
  const businesses = read('frontend', 'pages', 'businesses', 'businesses.js');
  const crud = read('frontend', 'js', 'components', 'crudPage.js');

  // Cada botón del embudo debe llevar la etapa y estar conectado al filtro real
  // de la lista, no sólo mostrar el contador.
  assert.match(businesses, /data-stage-filter="concluido"/);
  assert.match(businesses, /data-stage-filter="cancelado,PAUSA"/);
  assert.match(businesses, /listCtl\.setFilter\('currentStage'/);
  assert.match(businesses, /onFilterChange:\s*\(filters\)\s*=>\s*marcarEtapaActiva/);

  // La página reutiliza el estado de crudPage en lugar de recargar a mano.
  assert.match(crud, /function setFilter\(key, value/);
  assert.match(crud, /return \{ reload: load, setFilter, getFilters: currentFilters \}/);
});

test('la bitácora ya no muestra opciones de editar ni eliminar notas', () => {
  const businesses = read('frontend', 'pages', 'businesses', 'businesses.js');

  assert.doesNotMatch(businesses, /data-note-edit=/, 'no debe existir el botón Editar');
  assert.doesNotMatch(businesses, /data-note-delete=/, 'no debe existir el botón Eliminar');
  assert.doesNotMatch(businesses, /notesApi\.update\(/, 'la vista no debe llamar a actualizar notas');
  assert.doesNotMatch(businesses, /notesApi\.remove\(/, 'la vista no debe llamar a eliminar notas');
  assert.match(businesses, /id="add-note-form"/, 'seguir permitiendo agregar notas');
});

test('imprimir bitácora incluye el checklist y lanza la impresión', () => {
  const businesses = read('frontend', 'pages', 'businesses', 'businesses.js');

  assert.match(businesses, /checklistApi\.list\(record\._id\)/);
  assert.match(businesses, /Checklist operativo/);
  assert.match(businesses, /win\.print\(\)/);
  // El script inline era bloqueado por la CSP: la impresión se dispara desde
  // la ventana que abre la bitácora.
  assert.doesNotMatch(
    businesses,
    /window\.addEventListener\('load', function \(\) \{ setTimeout\(function \(\) \{ window\.print\(\);/,
    'la impresión no debe depender de un script inline'
  );
});
