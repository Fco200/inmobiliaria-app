'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

/**
 * Cambios de la versión 2.25:
 *   1) El visor de fotos del inventario no debe desbordarse en celular.
 *   2) Al guardar una propiedad se avisa que se está subiendo y que ya se
 *      puede cerrar la ventana.
 *   3) Los avisos "nueva propiedad interesada" se desactivan por defecto.
 *   4) El CRM debe aguantar más de 1000 peticiones concurrentes.
 */

test('el visor de fotos no desborda la pantalla en celular', () => {
  const css = read('frontend', 'css', 'base.css');

  assert.match(css, /\.image-lightbox\s*\{[^}]*overflow:\s*hidden/s, 'el visor permite desbordarse');
  assert.match(css, /\.lightbox-stage\s*\{[^}]*overflow:\s*hidden/s, 'el escenario del visor permite desbordarse');
  assert.match(css, /\.lightbox-photo\s*\{[^}]*max-height:\s*100%/s, 'la foto no se ajusta al alto disponible');
  assert.match(css, /\.pc-thumbs\s*\{[^}]*min-width:\s*0/s, 'las miniaturas no se contienen');
  assert.match(css, /\.inventory-detail-grid\s*\{[^}]*grid-template-columns/s, 'falta la rejilla del detalle del inventario');
});

test('al guardar una propiedad se avisa que se puede cerrar la ventana', () => {
  const crud = read('frontend', 'js', 'components', 'crudPage.js');
  const properties = read('frontend', 'pages', 'properties', 'properties.js');
  const css = read('frontend', 'css', 'base.css');

  assert.match(crud, /config\.submitNotice/, 'crudPage no usa el aviso configurable');
  assert.match(crud, /form\._crudSubmitting/, 'no se bloquea el doble envío');
  assert.match(crud, /document\.getElementById\('modal-overlay'\) === overlay/, 'el cierre del modal no es seguro');

  assert.match(properties, /submitNotice:/, 'Propiedades no define el aviso de subida');
  assert.match(properties, /ya puedes cerrar esta ventana/, 'el aviso no menciona que se puede cerrar la ventana');
  assert.match(properties, /const concurrency = Math\.max\(1, Math\.min\(3, list\.length\)\)/, 'la subida de fotos no es concurrente');
  assert.match(properties, /results\[index\] = url/, 'la subida no conserva el orden de las fotos');

  assert.match(css, /\.submit-progress\s*\{/, 'falta el estilo del aviso de subida');
  assert.match(css, /@keyframes submitSpin/, 'falta la animación del aviso de subida');
});

test('los avisos de propiedad interesada quedan desactivados y se limpian', () => {
  const controller = read('backend', 'src', 'controllers', 'property.controller.js');
  const server = read('backend', 'server.js');

  assert.match(controller, /NOTIFY_INTERESTED_CLIENTS \|\| 'false'/, 'los avisos deberían estar apagados por defecto');
  assert.match(controller, /if \(!NOTIFY_INTERESTED_CLIENTS\) return 0;/, 'no se corta la generación de avisos');
  assert.match(controller, /runInBackground\('avisos de propiedad creada'/, 'los avisos no van en segundo plano');
  assert.match(server, /Notification\.deleteMany\(\{ type: 'nueva_propiedad' \}\)/, 'no se limpian los avisos antiguos');
});

test('la configuración soporta más de 1000 peticiones', () => {
  const app = read('backend', 'src', 'app.js');
  const db = read('backend', 'src', 'config', 'db.js');
  const server = read('backend', 'server.js');

  const rate = app.match(/API_RATE_MAX \|\| (\d+)/);
  const anon = app.match(/API_RATE_MAX_ANON \|\| (\d+)/);
  assert.ok(rate && Number(rate[1]) >= 1000, 'el límite autenticado es menor a 1000');
  assert.ok(anon && Number(anon[1]) >= 1000, 'el límite anónimo es menor a 1000');

  const pool = db.match(/MONGO_MAX_POOL \|\| (\d+)/);
  assert.ok(pool && Number(pool[1]) >= 100, 'el pool de MongoDB es demasiado pequeño');
  assert.match(db, /maxConnecting:/, 'falta maxConnecting en el pool');
  assert.match(db, /MONGO_WAIT_QUEUE_MS \|\| 30000/, 'la espera de conexión es demasiado corta');

  assert.match(server, /server\.maxConnections =/, 'falta el límite de conexiones del servidor');
  assert.match(server, /server\.keepAliveTimeout =/, 'falta keepAliveTimeout');
  assert.match(server, /server\.headersTimeout =/, 'falta headersTimeout');
  assert.match(server, /server\.requestTimeout =/, 'falta requestTimeout');
});

test('la versión y la caché del Service Worker se actualizan juntas', () => {
  const version = JSON.parse(read('backend', 'version.json'));
  const sw = read('frontend', 'sw.js');
  const swVersion = sw.match(/const VERSION = '([^']+)'/);

  assert.equal(version.version, '2.25');
  assert.ok(swVersion, 'el Service Worker no declara VERSION');
  assert.equal(swVersion[1], version.version, 'la versión del SW no coincide con la del backend');
  assert.match(sw, /const CACHE_NAME = 'crm-inmob-v56'/, 'no se cambió el nombre de la caché');
});
