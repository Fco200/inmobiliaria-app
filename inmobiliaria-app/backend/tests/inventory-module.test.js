'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const FRONTEND = path.join(ROOT, 'frontend');

const read = (...parts) => fs.readFileSync(path.join(FRONTEND, ...parts), 'utf8');

/**
 * Módulo "Propiedades" (inventario general del equipo):
 *   1) El botón "Editar" abría un modal que no cerraba al guardar. Como la
 *      ficha ya se edita en "Captar Propiedades", se quitó del inventario.
 *   2) Los filtros se reorganizaron en una rejilla con etiqueta (como el
 *      resto de módulos) para que se vean bien en PC y en celular.
 * Y el logo de la app pasa a ser la versión en blanco.
 */

test('el inventario general no ofrece el botón Editar', () => {
  const js = read('pages', 'inventory', 'inventory.js');

  assert.doesNotMatch(js, /data-kind="edit"/, 'sigue el botón Editar en la tabla');
  assert.doesNotMatch(js, /kind === 'edit'/, 'sigue el manejador del botón Editar');
  assert.doesNotMatch(js, /function openEditModal/, 'sigue el modal de edición');
  assert.doesNotMatch(js, />Editar</, 'sigue apareciendo la palabra Editar');
});

test('los filtros del inventario van en una rejilla con etiqueta', () => {
  const js = read('pages', 'inventory', 'inventory.js');
  const css = read('css', 'base.css');

  assert.match(js, /inventory-toolbar-filters/, 'falta la rejilla de filtros');
  assert.match(js, /inventory-filter-label/, 'faltan las etiquetas de los filtros');
  // Los siete filtros del módulo (asesor, tipo, operación, estado,
  // financiamiento y el rango de precio) deben estar en la rejilla.
  ['data-agent-filter', 'data-type-filter', 'data-operation-filter', 'data-status-filter', 'data-payment-filter', 'data-min-price', 'data-max-price']
    .forEach((attr) => assert.match(js, new RegExp(attr), `falta el filtro ${attr}`));

  assert.match(css, /\.inventory-toolbar-filters\s*\{[^}]*display:\s*grid/s, 'la rejilla de filtros no está en CSS');
  assert.match(css, /\.inventory-filter-label\s*\{[^}]*text-transform:\s*uppercase/s, 'las etiquetas no están en CSS');
  // En móvil los filtros se pliegan para no tapar la tabla.
  assert.match(css, /\.inventory-toolbar-filters\.is-collapsed\s*\{\s*display:\s*none/, 'en móvil los filtros no se pliegan');
});

test('el logo de la app es la versión en blanco', () => {
  const htmls = fs.readdirSync(FRONTEND).filter((f) => /\.html$/i.test(f));
  const landings = ['asesor.html', 'contacto.html', 'equipo.html', 'landing.html', 'propiedades.html', 'servicios.html'];

  for (const f of htmls) {
    const html = read(f);
    assert.doesNotMatch(html, /LOGOICONO\.jpeg/, `${f} sigue usando el icono negro`);
  }

  // El manifiesto debe apuntar a los íconos reales (los que existen en disco).
  const manifest = JSON.parse(read('manifest.json').replace(/^\uFEFF/, ''));
  manifest.icons.forEach((icon) => {
    assert.ok(fs.existsSync(path.join(FRONTEND, icon.src)), `falta el ícono ${icon.src}`);
    assert.match(icon.src, /icons\//, 'el ícono de la app debe ser la versión en blanco de icons/');
  });
  manifest.shortcuts.forEach((sc) => {
    sc.icons.forEach((icon) => assert.ok(fs.existsSync(path.join(FRONTEND, icon.src)), `falta el ícono ${icon.src}`));
  });

  // Las cabeceras y pies de las páginas públicas son oscuros: ahí el logo
  // va en blanco para que se vea.
  landings.forEach((f) => {
    const html = read(f);
    assert.match(html, /logoinmobles-blanco\.png/, `${f} no usa el logo blanco`);
  });
  assert.ok(fs.existsSync(path.join(FRONTEND, 'logoinmobles-blanco.png')), 'falta el logotipo blanco');
});
