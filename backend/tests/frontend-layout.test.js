'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FRONTEND = path.join(__dirname, '..', '..', 'frontend');

const read = (...parts) => fs.readFileSync(path.join(FRONTEND, ...parts), 'utf8');

/**
 * Estos son errores de LAYOUT que no se ven en las pruebas de API pero que
 * dejaron el chat "cortado por abajo" y sin verse:
 *   1) La rejilla del menú lateral usa `align-items: start`, así que la
 *      columna de contenido no ocupaba el alto de la fila y el chat se
 *      salía de la ventana.
 *   2) En una columna flex, un elemento con scroll conserva por defecto su
 *      altura mínima igual a la del contenido: la lista de mensajes crecía
 *      sin límite y empujaba la barra de escritura fuera de la pantalla.
 * Las reglas se comprueban sobre los archivos reales para que nadie pueda
 * quitar sin quererlas y volver a dejar el chat roto.
 */

test('el chat no se sale de la ventana en escritorio', () => {
  const html = read('chat.html');

  // 1) La columna de contenido debe estirarse a lo alto disponible.
  assert.match(
    html,
    /body\.page-chat \.app\.has-sidebar\s*\{[^}]*align-items:\s*stretch/s,
    'falta align-items: stretch en la rejilla del chat'
  );

  // 2) La lista de mensajes debe poder encogerse para que el scroll funcione.
  const messages = html.match(/\.chat-messages\s*\{([^}]*)\}/);
  assert.ok(messages, 'no se encontró la regla .chat-messages');
  assert.match(
    messages[1],
    /min-height:\s*0/,
    '.chat-messages necesita min-height: 0 o empuja la barra de escritura fuera'
  );

  // La barra de escritura nunca debe encogerse.
  const input = html.match(/\.chat-input-bar\s*\{([^}]*)\}/);
  assert.ok(input, 'no se encontró la regla .chat-input-bar');
  assert.match(input[1], /flex-shrink:\s*0/, '.chat-input-bar debe tener flex-shrink: 0');
});

test('el chat embebido (burbuja) muestra la conversación, no la lista', () => {
  const html = read('chat.html');

  // En el panel flotante el chat tiene que estar SIEMPRE visible: la lista
  // de participantes pasa a ser un cajón que se abre a pedido.
  assert.match(
    html,
    /body\.is-embed \.chat-main\s*\{[^}]*display:\s*flex\s*!important/s,
    'en el panel flotante el chat debe verse siempre'
  );
  assert.match(
    html,
    /body\.is-embed \.chat-sidebar\s*\{[^}]*position:\s*absolute/s,
    'en el panel flotante la lista debe ser un cajón superpuesto'
  );
  assert.match(
    html,
    /body\.is-embed\.chat-drawer-open \.chat-sidebar/,
    'falta el estado que abre el cajón de conversaciones'
  );
  assert.match(
    html,
    /body\.is-embed #btn-chat-list/,
    'falta el botón para abrir la lista de conversaciones'
  );
});

test('el chat no lista a los 50 participantes en la cabecera', () => {
  const js = read('pages', 'chat', 'chat.js');
  // Con más de 4 personas la cabecera resume ("N participantes") y el detalle
  // queda en el tooltip: si no, la cabecera crecía y tapaba el chat.
  assert.match(js, /participantes`/, 'falta el resumen de participantes');
  assert.match(js, /partNames\.length > 4/, 'falta el umbral del resumen de participantes');
});

test('la burbuja de chat abre sola el canal general', () => {
  const js = read('pages', 'chat', 'chat.js');
  // En el panel flotante lo que se quiere es ver los mensajes de inmediato.
  assert.match(js, /isEmbed\s*\|\|\s*!window\.matchMedia/, 'el canal general no se abre en la burbuja');
});
