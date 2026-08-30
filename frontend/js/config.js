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
};
