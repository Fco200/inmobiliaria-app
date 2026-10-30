'use strict';

window.AppConfig = {
  API_URL: (function () {
    const url = new URL(window.location.href);
    const isLocalHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    // Abierto como archivo local o desde Live Server en desarrollo → backend local.
    if (url.protocol === 'file:' || (isLocalHost && url.port && url.port !== '5000')) {
      return 'http://localhost:5000/api';
    }
    // Servido por el backend (mismo origen, incl. producción) → ruta relativa.
    return '/api';
  })(),

  // Origen del backend (sin /api): útil para resolver archivos subidos (/uploads/...).
  BASE_URL: (function () {
    const url = new URL(window.location.href);
    const isLocalHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol === 'file:' || (isLocalHost && url.port && url.port !== '5000')) {
      return 'http://localhost:5000';
    }
    return window.location.origin;
  })(),

  // Convierte una URL relativa del servidor (p. ej. /uploads/x.png) en una
  // URL absoluta. Para archivos de /uploads agrega el token de sesión como
  // query param (el backend exige autenticación para verlos).
  resolveUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    let full = path.startsWith('/') ? this.BASE_URL + path : path;
    if (full.includes('/uploads/')) {
      try {
        const token = localStorage.getItem('crm_token');
        if (token) {
          full += (full.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token);
        }
      } catch (error) {
        /* sin token (página pública) → el backend decide si es público */
      }
    }
    return full;
  },

  // Respaldo visual cuando una propiedad NO tiene foto o cuando la imagen del
  // servidor no carga (404/401). Es un data URI: no depende de la red y la
  // CSP (img-src 'self' data:) lo permite tanto en local como en producción.
  FALLBACK_IMG: (function () {
    const svg = [
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 90'>",
      "<rect width='120' height='90' fill='#eef1f6'/>",
      "<g stroke='#a6b0c2' stroke-width='3' fill='none' stroke-linejoin='round' stroke-linecap='round'>",
      "<path d='M34 52 L60 32 L86 52'/>",
      "<path d='M40 48 V74 H80 V48'/>",
      "<rect x='54' y='58' width='12' height='16'/>",
      '</g>',
      "<text x='60' y='87' font-family='sans-serif' font-size='9' fill='#8b95a7' text-anchor='middle'>Sin foto</text>",
      '</svg>',
    ].join('');
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  })(),

  // Atributo onerror listo para pegar en cualquier <img>: si la foto del
  // servidor falla, se sustituye por el respaldo (y no entra en bucle).
  imgFallback: 'onerror="this.onerror=null;this.src=window.AppConfig.FALLBACK_IMG;"',
};
