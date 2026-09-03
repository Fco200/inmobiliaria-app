'use strict';

// Generación de códigos QR robusta:
//  1. Usa la librería local (qrcode-generator, UMD global `qrcode`) si está
//     disponible; si no, la carga dinámicamente (no depende del <script> de la
//     página).
//  2. Si la librería no puede cargarse/generarse, cae a un servicio web
//     (qrcodegen / api.qrserver) siempre que devuelva una imagen cargable.
// Devuelve siempre un dataURL PNG (o una URL de imagen) utilizable en <img>.
window.PublicQR = (() => {
  const LIB_URL = 'js/lib/qrcode-generator.min.js';
  const WEB_FALLBACK_URL = (text, size) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(String(text))}`;

  let libLoadPromise = null;

  // Carga un <script> y resuelve cuando termina.
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (typeof document === 'undefined') return reject(new Error('No DOM'));
      const existing = document.querySelector(`script[src="${src}"]`);
      const done = () => resolve();
      const fail = () => reject(new Error('No se pudo cargar la librería de QR'));
      if (existing) {
        if (existing.getAttribute('data-loaded') === '1') return resolve();
        existing.addEventListener('load', done);
        existing.addEventListener('error', fail);
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.addEventListener('load', () => { s.setAttribute('data-loaded', '1'); done(); });
      s.addEventListener('error', fail);
      (document.head || document.documentElement).appendChild(s);
    });
  }

  // Asegura que `window.qrcode` esté disponible (carga dinámica la primera vez).
  function ensureLib() {
    if (typeof qrcode === 'function') return Promise.resolve();
    if (!libLoadPromise) libLoadPromise = loadScript(LIB_URL);
    return libLoadPromise;
  }

  // Devuelve dataURL PNG si es posible; si no, la URL del servicio web.
  function toDataUrl(text, size) {
    const s = size || 180;
    if (typeof qrcode === 'function') {
      const local = tryLocal(text, s);
      if (local) return local;
    }
    return WEB_FALLBACK_URL(text, s);
  }

  // Genera el QR de forma asíncrona: espera a la librería local y, si se carga,
  // devuelve un dataURL; si algo falla, promete la URL del servicio web.
  function dataUrl(text, size) {
    const s = size || 180;
    return ensureLib()
      .then(() => tryLocal(text, s) || WEB_FALLBACK_URL(text, s))
      .catch(() => WEB_FALLBACK_URL(text, s));
  }

  function tryLocal(text, size) {
    try {
      const s = size || 180;
      const qr = qrcode(0, 'L');
      qr.addData(String(text));
      qr.make();
      const cells = qr.getModuleCount();
      const scale = Math.max(1, Math.floor(s / cells));
      const canvas = document.createElement('canvas');
      canvas.width = cells * scale;
      canvas.height = cells * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#1a1226';
      for (let r = 0; r < cells; r += 1) {
        for (let c = 0; c < cells; c += 1) {
          if (qr.isDark(r, c)) ctx.fillRect(c * scale, r * scale, scale, scale);
        }
      }
      return canvas.toDataURL('image/png');
    } catch (error) {
      return null;
    }
  }

  return { toDataUrl, dataUrl, ensureLib };
})();
