'use strict';

// Guardar fotos en la galería del celular desde el navegador.
//
// No existe una API web para escribir directamente en "Fotos"/"Carrete".
// La única vía web que en iOS muestra la acción "Guardar imagen" es la Web
// Share API con archivos (navigator.share({ files })). En Android también es
// la forma de que la imagen pase a Galería/Fotos; si no está disponible se
// usa la descarga con <a download>, que cae en Descargas/Archivos.
//
// La función principal acepta un Blob/File YA cargado: hay que llamarla desde
// un gesto del usuario (click), porque navigator.share exige activación
// transitoria y un fetch previo puede agotarla.

window.PhotoGallery = (() => {
  const DEFAULT_NAME = 'foto-propiedad.jpg';

  // Caché de imágenes ya descargadas. Se llena ANTES del clic en "Guardar"
  // porque navigator.share exige activación transitoria del usuario.
  const preloaded = new Map();

  // Las fotos del servidor llegan como rutas relativas (/uploads/x.jpg) y el
  // backend exige token. Resolver aquí la misma URL que usó la precarga evita
  // un segundo fetch sin autenticación al guardar.
  function resolveSource(source) {
    if (source instanceof Blob) return source;
    const url = typeof source === 'string' ? source : String(source);
    if (typeof window !== 'undefined' && window.AppConfig
      && typeof window.AppConfig.resolveUrl === 'function') {
      return window.AppConfig.resolveUrl(url);
    }
    return url;
  }

  function cacheKey(source) {
    const resolved = resolveSource(source);
    if (resolved instanceof Blob) return resolved;
    try { return new URL(resolved, location.href).href; } catch (error) { return String(resolved); }
  }

  function preload(source) {
    if (!source) return Promise.resolve(null);
    const key = cacheKey(source);
    if (!preloaded.has(key)) preloaded.set(key, toBlob(source).catch(() => null));
    return preloaded.get(key);
  }

  function preloadAll(sources) {
    return Promise.all((Array.isArray(sources) ? sources : []).filter(Boolean).map(preload));
  }

  function fileNameFrom(source) {
    if (source instanceof File && source.name) return source.name;
    if (typeof source === 'string') {
      try {
        const u = new URL(source, location.href);
        return decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '') || DEFAULT_NAME;
      } catch (error) { /* ignore */ }
    }
    return DEFAULT_NAME;
  }

  async function toBlob(source) {
    const resolved = resolveSource(source);
    if (resolved instanceof Blob) return resolved;
    const response = await fetch(resolved, { mode: 'cors' });
    if (!response.ok) throw new Error(`No se pudo obtener la imagen (${response.status})`);
    return response.blob();
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Safari/iOS necesita tiempo para leer el blob antes de revocarlo.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function toShareFile(blob, filename) {
    try {
      if (typeof File === 'function') {
        return new File([blob], filename || DEFAULT_NAME, {
          type: blob.type || 'image/jpeg',
          lastModified: Date.now(),
        });
      }
    } catch (error) {
      // WebView antiguo sin constructor File: se usa el Blob directamente.
    }
    return blob;
  }

  // Acepta UN archivo (save) o un ARRAY de archivos (saveMany). Antes siempre
  // envolvía el argumento en otro array, así que guardar todas pasaba
  // `files: [[File, File...]]` y iOS lanzaba TypeError en canShare().
  function canShareFiles(files) {
    const list = Array.isArray(files) ? files : [files];
    if (!list.length || list.some((file) => !file)) return false;
    if (typeof navigator === 'undefined'
      || typeof navigator.share !== 'function'
      || typeof navigator.canShare !== 'function') return false;
    try {
      return Boolean(navigator.canShare({ files: list }));
    } catch (error) {
      // iOS/WebView pueden lanzar TypeError al validar File/Blob.
      return false;
    }
  }

  /**
   * Guarda/comparte una imagen.
   * @param {Blob|File|string} source Blob/File ya cargado (recomendado) o URL.
   * @param {string} [filename]
   * @returns {Promise<'shared'|'downloaded'|'cancelled'|'failed'>}
   */
  async function save(source, filename) {
    const blob = source instanceof Blob ? source : await preload(source);
    if (!blob) return 'failed';
    const name = filename || fileNameFrom(source);
    const file = toShareFile(blob, name);

    if (canShareFiles(file)) {
      try {
        // Solo `files`: en iOS es la combinación que muestra "Guardar imagen".
        await navigator.share({ files: [file] });
        return 'shared';
      } catch (error) {
        if (error && error.name === 'AbortError') return 'cancelled';
        // NotAllowedError / TypeError: se pierde la activación o el share falla.
      }
    }

    try {
      downloadBlob(blob, name);
      return 'downloaded';
    } catch (error) {
      return 'failed';
    }
  }

  /**
   * Descarga desde una URL (útil para fotos ya guardadas en el servidor).
   * ADVERTENCIA: hacer fetch antes de share puede perder la activación en iOS;
   * para esos casos usa ensureBlob() por adelantado y luego save(blob).
   */
  async function saveFromUrl(url, filename) {
    return save(url, filename || fileNameFrom(url));
  }

  // Precarga una URL a Blob para poder pasarla a save() dentro del click.
  async function ensureBlob(url) {
    return preload(url);
  }

  /**
   * Guarda TODAS las fotos de un jalón. Si el dispositivo permite compartir
   * varios archivos, abre una sola hoja de compartir (en iOS: "Guardar imagen")
   * con la galería completa; si no, las descarga una por una.
   * @param {Array<Blob|File|string>} sources Blobs precargados o URLs.
   * @param {{names?: string[], baseName?: string}} [options]
   */
  async function saveMany(sources, options = {}) {
    const list = (Array.isArray(sources) ? sources : []).filter(Boolean);
    if (!list.length) return 'empty';

    const names = Array.isArray(options.names) ? options.names : [];
    const baseName = options.baseName || 'fotos';
    const files = [];
    const downloads = [];
    for (let i = 0; i < list.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const blob = list[i] instanceof Blob ? list[i] : await preload(list[i]);
      if (!blob) continue;
      const name = names[i] || `${baseName}-${i + 1}.jpg`;
      files.push(toShareFile(blob, name));
      // Se guarda el blob original: si File no existe, toShareFile devuelve un
      // Blob sin .name y el respaldo de descarga debe seguir usando el nombre.
      downloads.push({ blob, name });
    }
    if (!files.length) return 'failed';

    if (canShareFiles(files)) {
      try {
        await navigator.share({ files });
        return 'shared';
      } catch (error) {
        if (error && error.name === 'AbortError') return 'cancelled';
        // Sin activación o share rechazado: se cae a descarga múltiple.
      }
    }

    try {
      downloads.forEach((entry, i) => {
        const name = entry.name || `${baseName}-${i + 1}.jpg`;
        downloadBlob(entry.blob, name);
      });
      return 'downloaded';
    } catch (error) {
      return 'failed';
    }
  }

  function toastResult(result, count = 1) {
    const muchas = Number(count) > 1;
    if (result === 'shared') {
      UI.toast(muchas
        ? `${count} fotos enviadas al menú para guardarlas en Fotos/Galería.`
        : 'Foto enviada al menú para guardarla en Fotos/Galería.', 'success');
    } else if (result === 'downloaded') {
      UI.toast(muchas
        ? `${count} fotos descargadas. En iPhone: mantén pulsada cada una y elige "Guardar imagen".`
        : 'Foto descargada. En iPhone: mantén pulsada y elige "Guardar imagen".', 'info');
    } else if (result === 'failed') {
      UI.toast(muchas ? 'No se pudieron guardar las fotos.' : 'No se pudo guardar la foto.', 'error');
    }
    // 'cancelled' no merece aviso: el usuario cerró el menú a propósito.
  }

  return {
    save,
    saveMany,
    saveFromUrl,
    preload,
    preloadAll,
    ensureBlob,
    canShareFiles,
    toastResult,
    fileNameFrom,
  };
})();
