'use strict';

/**
 * Normaliza la ruta de una foto guardada en MongoDB para que SIEMPRE quede
 * como una ruta relativa servible desde el frontend: "/uploads/archivo.jpg".
 *
 * - "http://host/uploads/x.jpg"  -> "/uploads/x.jpg" (se ignora el dominio,
 *   así si cambia la URL de Render/Live Server las fotos siguen funcionando)
 * - "uploads/x.jpg"              -> "/uploads/x.jpg"
 * - "/uploads/x.jpg?token=abc"   -> "/uploads/x.jpg" (sin query)
 * - "https://cdn.ajeno/x.jpg"    -> se conserva (URL externa)
 * - "data:image/png;base64,..."  -> se conserva
 */
function normalizePhotoPath(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';

  if (/^(data|blob):/i.test(raw)) return raw;

  const idx = raw.toLowerCase().indexOf('/uploads/');
  if (idx >= 0) {
    return raw.slice(idx).split('?')[0].split('#')[0];
  }

  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  if (/^uploads\//i.test(raw)) return `/${raw}`;
  return raw;
}

function normalizePhotos(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizePhotoPath).filter(Boolean);
}

module.exports = { normalizePhotoPath, normalizePhotos };
