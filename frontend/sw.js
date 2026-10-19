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
const CACHE_NAME = 'crm-inmob-v44';
const VERSION = '2.14';

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
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match('index.html'))
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
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => {
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
    caches.match(request).then((cached) => {
      const fetchAndCache = () =>
        fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
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