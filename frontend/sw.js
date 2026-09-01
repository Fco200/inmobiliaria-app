'use strict';

// Service Worker de INMOBLES.
// Estrategia:
//  - Navegaciones (páginas HTML): network-first con respaldo a la copia en
//    caché; así los cambios de versión llegan al abrir la app (crítico en iOS).
//  - Estáticos (JS/CSS/imágenes): cache-first con actualización en segundo
//    plano (stale-while-revalidate): respuesta inmediata y refresco silencioso.
//  - API, uploads y cualquier no-GET: nunca se tocan.
//  - NUNCA se responde index.html como fallback para peticiones de assets: eso
//    rompía la app en iOS (servía HTML con content-type de JS/CSS).
const CACHE_NAME = 'crm-inmob-v26';
const VERSION = '1.6';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
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

  const isNavigation = event.request.mode === 'navigate';
  const request = isNavigation ? event.request : event.request;

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

  // Estáticos: devolver inmediatamente lo que haya en caché, y por detrás
  // actualizarlo con la red (la próxima visita ya tendrá la versión nueva).
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