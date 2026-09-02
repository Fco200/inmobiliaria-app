'use strict';

// Generación de códigos QR 100% local (sin depender de servicios externos).
// Usa qrcode-generator (UMD global `qrcode`, MIT) y dibuja el QR en un canvas
// → dataURL PNG. Si la librería no está cargada, cae a api.qrserver.com.
window.PublicQR = (() => {
  function fallback(text, size) {
    const s = size || 180;
    return `https://api.qrserver.com/v1/create-qr-code/?size=${s}x${s}&margin=8&data=${encodeURIComponent(String(text))}`;
  }

  // Devuelve un dataURL PNG listo para <img> o un URL de respaldo.
  function toDataUrl(text, size) {
    if (typeof qrcode !== 'function') return fallback(text, size);
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
      if (!ctx) return fallback(text, s);
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
      return fallback(text, size);
    }
  }

  return { toDataUrl };
})();