'use strict';

// Service Worker de INMOBLES.
// Estrategia:
//  - Navegaciones (páginas HTML): network-first con respaldo a la copia en
//    caché; así los cambios de versión llegan al abrir la app (crítico en iOS).
//  - CÓDIGO (JS/CSS): network-first con respaldo a la copia en caché. Antes se
//    servían cache-first y eso dejaba el bundle VIEJO pegado en el navegador:
//    una corrección publicada seguía lanzando el error viejo (por ejemplo
//    "filterEl is not defined" al abrir Clientes) hasta que el usuario hacia una
//    recarga forzada. Con network-first el código corregido llega siempre en la
//    primera carga y, si no hay red, se usa la última copia conocida.
//  - IMÁGENES y otros estáticos pesados: cache-first con refresco silencioso
//    (stale-while-revalidate) para no repetir descargas ni payloads.
//  - API, uploads y cualquier no-GET: nunca se tocan.
//  - NUNCA se responde index.html como fallback para peticiones de assets: eso
//    rompía la app en iOS (servía HTML con content-type de JS/CSS).
// El nombre de la caché DEBE subirse en cada publicación: sin cambiarlo, las
// copias viejas siguen en disco y ocupan cuota.
const CACHE_NAME = 'crm-inmob-v55';
const VERSION = '2.24';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      // Avisa a las pestañas abiertas que ya hay versión nueva. La interfaz
      // decide cuándo recargar (nunca se recarga sola: el asesor puede estar
      // escribiendo la descripción de una propiedad).
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED', version: VERSION })))
  );
});

// Permite forzar la activación ("Restablecer aplicación") desde la interfaz.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Respuestas comprimidas y caché del Service Worker ───────────────────────
// El servidor envía las respuestas de texto comprimidas (gzip) para ahorrar
// ancho de banda. Al guardarlas en el Cache API hay que tener cuidado con la
// cabecera "Content-Encoding": el navegador puede entregar el cuerpo YA
// descomprimido pero dejar la cabecera puesta, y si esa respuesta se vuelve a
// servir desde la caché el navegador intentaría descomprimirla otra vez
// (archivo roto). Esta función reconstruye la respuesta de forma segura:
//  - Si el cuerpo llega comprimido (magic bytes 1f 8b) se guarda tal cual.
//  - Si llega ya descomprimido se quitan Content-Encoding y Content-Length.
async function cacheableResponse(response) {
  const encoding = response.headers.get('Content-Encoding');
  if (!encoding) return response;
  let buffer;
  try {
    buffer = await response.arrayBuffer();
  } catch (error) {
    return response;
  }
  const bytes = new Uint8Array(buffer);
  const looksCompressed = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  const headers = new Headers(response.headers);
  if (!looksCompressed) {
    headers.delete('Content-Encoding');
    headers.delete('Content-Length');
  }
  try {
    return new Response(buffer, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    return response;
  }
}

// Guarda la respuesta en la caché sin romperla (ignora errores silenciosos:
// si algo falla, la app sigue funcionando con red).
async function putInCache(cache, request, response) {
  try {
    const copy = response.clone();
    const safe = await cacheableResponse(copy);
    await cache.put(request, safe);
  } catch (error) {
    /* sin caché: no es crítico */
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/api') || url.pathname.includes('/api/')) return;
  if (url.pathname.includes('/uploads/')) return;
  if (event.request.method !== 'GET') return;

  const request = event.request;
  const isNavigation = event.request.mode === 'navigate';

  // Clasifica el recurso: el CÓDIGO va network-first (para que una corrección
  // publicada nunca se quede pegada en el navegador) y el resto cache-first.
  const CODE_RE = /\.(?:js|mjs|css)$/i;
  const isCode = CODE_RE.test(url.pathname);

  // Navegación: red primero; si no hay red, usar la copia cacheada (o libreta).
  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            caches.open(CACHE_NAME).then((cache) => putInCache(cache, request, response)).catch(() => {});
          }
          return response;
        })
        .catch(() =>
          caches.match(request, { ignoreVary: true }).then((cached) => cached || caches.match('index.html', { ignoreVary: true }))
        )
    );
    return;
  }

  // Código (JS/CSS): red primero y, en paralelo, refrescar la copia en caché.
  // Si la red falla se entrega la última versión conocida (arranque sin conexión).
  if (isCode) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            caches.open(CACHE_NAME).then((cache) => putInCache(cache, request, response)).catch(() => {});
          }
          return response;
        })
        .catch(() =>
          caches.match(request, { ignoreVary: true }).then((cached) => {
            if (cached) return cached;
            // Nunca se devuelve index.html para un JS/CSS: el navegador lo
            // aceptaría y la app reventaría con errores de sintaxis.
            return new Response('', { status: 504, statusText: 'Offline y sin copia en caché' });
          })
        )
    );
    return;
  }

  // Estáticos pesados (imágenes, fuentes, pdf): devolver de inmediato lo que haya
  // en caché y, por detrás, actualizarlo con la red.
  event.respondWith(
    caches.match(request, { ignoreVary: true }).then((cached) => {
      const fetchAndCache = () =>
        fetch(request)
          .then((response) => {
            if (response && response.ok) {
              caches.open(CACHE_NAME).then((cache) => putInCache(cache, request, response)).catch(() => {});
            }
            return response;
          })
          .catch(() => cached);
      return cached || fetchAndCache();
    })
  );
});

// Mantiene informada a la interfaz de cuando hay una versión nueva disponible.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CHECK_VERSION') {
    event.source && event.source.postMessage({ type: 'SW_VERSION', version: VERSION });
  }
});

// ── Notificaciones push nativas (Web Push) ──────────────────────────────────
// El backend envía el payload cifrado (RFC 8291) y aquí se muestra con
// showNotification: es lo que permite recibir avisos con la app cerrada en
// Android, iOS (PWA agregada al inicio) y escritorio.
self.addEventListener('push', (event) => {
  let payload = { title: 'INMOBLES', body: '', url: '/', tag: '' };
  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') payload = Object.assign({}, payload, parsed);
    }
  } catch (error) {
    // El servidor mandó texto plano en vez de JSON.
    if (event.data) payload.body = event.data.text();
  }

  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || undefined,
    renotify: true,
    data: { url: payload.url || '/' },
    vibrate: [120, 60, 120],
  };

  event.waitUntil(self.registration.showNotification(payload.title || 'INMOBLES', options));
});

// Al tocar la notificación se abre (o recupera) la pestaña de la aplicación.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    })
  );
});

// El servicio de push puede renovar/rotar la suscripción (caducidad, cambio de
// dispositivo, recuperación del sistema). El Service Worker vive SIN token de
// sesión, así que no puede llamar a la API directamente: se avisa a las pestañas
// abiertas y la interfaz (push.js → syncAfterLogin) re-registra la suscripción
// nueva con POST /api/push/subscribe. Si la app está cerrada, el re-sync ocurre
// al abrirla (multipage.js ya llama a syncAfterLogin al cargar).
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => clients.forEach((client) => client.postMessage({ type: 'PUSH_RESYNC_REQUIRED' })))
  );
});