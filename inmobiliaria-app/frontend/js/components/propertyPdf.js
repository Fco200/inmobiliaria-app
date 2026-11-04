'use strict';

// Genera un PDF real (adjuntable) de una propiedad para compartirla por
// WhatsApp. Se arma en el navegador con jsPDF y busca verse PROFESIONAL y
// completo:
//   · Portada destacada (la primera foto del PhotoManager) con marco y sello.
//   · TODAS las fotografías adicionales en galería (2 columnas), no solo unas
//     cuantas: antes se recortaba a 4 y el asesor veía "la mitad" de sus fotos.
//   · Datos clave ampliados (folio, precio, operación, superficies, pagos…).
//   · Descripción completa respetando los saltos de línea originales.
//   · Contacto del asesor que COMPARTE: nombre, teléfono, correo, ID de usuario
//     del CRM y un código QR con la ficha pública.
//
// Uso:
//   const pdf = await PropertyPdf.build({ property, asesor, fotos });
//   PropertyPdf.share(pdf, telefono, 'mensaje'); // navigator.share o descarga
window.PropertyPdf = (() => {
  const TYPE_LABELS = {
    casa: 'Casa',
    departamento: 'Departamento',
    local: 'Local',
    bodega: 'Bodega',
    rancho: 'Rancho',
    terreno: 'Terreno',
    playa: 'Playa',
    otro: 'Otro',
  };

  const OP_LABELS = { venta: 'Venta', renta: 'Renta', compra_localizada: 'Compra Localizada' };

  const STATUS_LABELS = {
    disponible: 'Disponible',
    apartada: 'Apartada',
    inactiva: 'Inactiva',
    concluida: 'Concluida',
    // Valores heredados para PDFs de fichas aún no migradas.
    en_proceso: 'En proceso',
    vendida: 'Vendida',
    rentada: 'Rentada',
  };

  // Paleta de marca (morado INMOBLES + dorado).
  const INK = [45, 16, 72];
  const GOLD = [185, 145, 47];
  const SLATE = [71, 85, 105];
  const BORDER = [226, 232, 240];
  const TEXT = [15, 23, 42];
  // Paneles con más contraste para que la descripción no se pierda en el blanco.
  const PANEL_BG = [243, 240, 250];
  const PANEL_BORDER = [213, 202, 236];
  const ROW_LINE = [234, 229, 244];

  // Máximo de fotos que entran al PDF. Se puede subir mucho más alto que antes
  // (era 6): el PDF se mantiene razonable porque cada foto se reduce a JPEG.
  const MAX_PHOTOS = 24;

  function jsPDFCtor() {
    const lib = window.jspdf || {};
    return lib.jsPDF || null;
  }

  function currency(value) {
    if (window.Format && Format.currency) return Format.currency(value);
    return `$${Number(value || 0).toLocaleString('es-MX')}`;
  }

  function caracteristicas(prop) {
    const c = prop && prop.characteristics;
    if (!Array.isArray(c)) return [];
    return c
      .map((item) => {
        if (item && typeof item === 'object') {
          return item.name && item.value ? `${item.name}: ${item.value}` : item.value || item.name || '';
        }
        return String(item);
      })
      .filter(Boolean);
  }

  function paymentLabel(prop) {
    const list = Array.isArray(prop.paymentMethods) ? prop.paymentMethods : [];
    if (!list.length) return '';
    const MAP = { contado: 'Contado', infonavit: 'Infonavit', banco: 'Banco', fovissste: 'Fovissste', todos: 'Todos', otro: 'Otro' };
    return list
      .map((m) => (m === 'otro' ? (prop.paymentMethodsOther || 'Otro') : (MAP[m] || m)))
      .join(', ');
  }

  let logoCache;
  function loadLogo() {
    if (logoCache !== undefined) return Promise.resolve(logoCache);
    const candidates = [
      'icons/logoinmobles_ennegro.jfif',
      'logoinmobles_ennegro.jfif',
      'logoinmobles-blanco.png',
      'icons/logoinmobles-blanco.png',
      'icons/logoinmobles.png',
      'logoinmobles.png',
    ];
    const tryLoad = (url) => new Promise((resolve) => {
      const img = new Image();
      const timer = setTimeout(() => resolve(null), 8000);
      img.onload = () => {
        clearTimeout(timer);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || 300;
          canvas.height = img.naturalHeight || 300;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          logoCache = { data: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
          resolve(logoCache);
        } catch (e) { resolve(null); }
      };
      img.onerror = () => { clearTimeout(timer); resolve(null); };
      try { img.src = new URL(url, document.baseURI).href; } catch (e) { img.src = url; }
    });
    return (async () => {
      for (let i = 0; i < candidates.length; i += 1) {
        const res = await tryLoad(candidates[i]);
        if (res) return res;
      }
      logoCache = null;
      return null;
    })();
  }

  // Los formatos HEIC/HEIF (típicos de iPhone) casi nunca se pueden
  // decodificar en el navegador: se omiten de inmediato para no esperar el
  // timeout de cada foto y dejar colgado el botón de "Generando PDF…".
  function isLikelyUndecodable(src) {
    const clean = String(src || '').split('?')[0].toLowerCase();
    return /\.(heic|heif)$/.test(clean);
  }

  // Carga una imagen con tiempo máximo: si el servidor se queda colgado, la
  // promesa se rechaza y el PDF se sigue generando sin esa foto.
  function loadImage(src, { crossOrigin, timeout = 12000 } = {}) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      let done = false;
      const finish = (fn, arg) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        fn(arg);
      };
      const timer = setTimeout(() => finish(reject, new Error('timeout')), timeout);
      img.onload = () => finish(resolve, img);
      img.onerror = () => finish(reject, new Error('load-error'));
      if (crossOrigin) img.crossOrigin = crossOrigin;
      img.src = src;
    });
  }

  // Estrategia 1: traer la foto como Blob (fetch con el token en la URL) y
  // dibujarla desde un objectURL. Así el canvas NUNCA se contamina, aunque la
  // foto venga de otro origen (Live Server, CDN, etc.).
  async function loadViaFetch(url) {
    try {
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob || !blob.size) return null;
      const objectUrl = URL.createObjectURL(blob);
      try {
        const img = await loadImage(objectUrl);
        return { img, objectUrl };
      } catch (e) {
        URL.revokeObjectURL(objectUrl);
        return null;
      }
    } catch (e) {
      return null;
    }
  }

  // Dibuja la imagen en un canvas y devuelve un data-URL JPEG (o null si no
  // se pudo convertir). Se limitan AMBOS lados: iOS falla con canvases
  // gigantes y el PDF pesaría demasiado para subirlo al chat.
  function jpegFromImage(img, maxWidth = 1600, maxHeight = 1600) {
    try {
      const nw = img.naturalWidth || img.width || 0;
      const nh = img.naturalHeight || img.height || 0;
      if (!nw || !nh) return null;
      const scale = Math.min(1, maxWidth / nw, maxHeight / nh);
      const w = Math.max(1, Math.round(nw * scale));
      const h = Math.max(1, Math.round(nh * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return canvas.toDataURL('image/jpeg', 0.82);
    } catch (e) {
      // Canvas contaminado u otro error de conversión → se omite la foto.
      return null;
    }
  }

  // Convierte una imagen remota (con token en la URL) a data-URL JPEG.
  // Cadena de respaldos: fetch→blob → Image con CORS → Image sin CORS.
  // Si todo falla devuelve null y el PDF se arma sin esa foto.
  async function imgToJpeg(url) {
    if (!url || isLikelyUndecodable(url)) return null;

    const viaFetch = await loadViaFetch(url);
    if (viaFetch) {
      try {
        const data = jpegFromImage(viaFetch.img);
        if (data) return data;
      } finally {
        try { URL.revokeObjectURL(viaFetch.objectUrl); } catch (e) { /* noop */ }
      }
    }

    for (const cross of ['anonymous', undefined]) {
      try {
        const img = await loadImage(url, { crossOrigin: cross });
        const data = jpegFromImage(img);
        if (data) return data;
      } catch (e) { /* se intenta con la siguiente variante */ }
    }
    return null;
  }

  function resolveSrc(src) {
    return window.AppConfig ? AppConfig.resolveUrl(src) : src;
  }

  // Descarga TODAS las fotos (portada primero) y regresa solo las que se
  // pudieron cargar. Se cargan EN PARALELO por lotes para que la espera no se
  // multiplique por foto y no se abran 24 conexiones de golpe.
  async function loadPhotos(photos, max = MAX_PHOTOS) {
    const list = (Array.isArray(photos) ? photos : []).filter(Boolean).slice(0, max);
    if (!list.length) return [];
    const results = [];
    const BATCH = 6;
    for (let i = 0; i < list.length; i += BATCH) {
      const chunk = list.slice(i, i + BATCH);
      const chunkResults = await Promise.all(chunk.map((src) => imgToJpeg(resolveSrc(src))));
      results.push(...chunkResults);
    }
    return results.filter(Boolean);
  }

  // Divide un bloque de texto en líneas que quepan en `maxWidth` (pt).
  // `prefix` se usa para medir con la sangría de las viñetas.
  function wrapWords(doc, text, maxWidth, prefix = '') {
    const words = String(text || '').split(' ').filter((w) => w !== '');
    const lines = [];
    let current = '';
    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      if (doc.getTextWidth(prefix + candidate) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    });
    if (current) lines.push(current);
    return lines;
  }

  // Divide un bloque de texto respetando los saltos de línea ORIGINALES. Las
  // viñetas y listas numeradas conservan su marcador y las líneas siguientes
  // se sangran (sangría francesa) para que el texto no se amontone debajo.
  function wrapText(doc, text, maxWidth) {
    // Limpia emojis y caracteres fuera del rango Latin-1 para evitar símbolos
    // extraños (□□□) al renderizar en pdf.js/fonts.
    const cleaned = String(text || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '');
    const out = [];
    cleaned.split(/\r?\n/).forEach((rawLine) => {
      const line = rawLine.replace(/\s+/g, ' ').trim();
      if (!line) { out.push(''); return; }
      const bullet = line.match(/^([•·▪◦‣∙*]\s+|[-–—]\s+|\d{1,2}[.)]\s+)/);
      if (bullet) {
        const head = bullet[1];
        const pad = '    ';
        const lines = wrapWords(doc, line.slice(head.length), maxWidth, pad);
        lines.forEach((l, i) => out.push(i === 0 ? head + l : pad + l));
        return;
      }
      wrapWords(doc, line, maxWidth).forEach((l) => out.push(l));
    });
    return out;
  }

  // Encabezado de marca reutilizable (sirve para la 1ª página y las siguientes).
  // El logo ya viene cargado, así que es SÍNCRONO: se puede llamar dentro de
  // bucles sin volverlos async.
  function paintHeader(doc, pageW, margin, logo, rightText) {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, 58, 'F');
    // Franja dorada inferior del encabezado.
    doc.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.rect(0, 54, pageW, 4, 'F');

    let titleX = margin;
    if (logo) {
      const logoH = 34;
      const logoW = Math.min(150, logo.width * (logoH / logo.height));
      try {
        doc.addImage(logo.data, 'PNG', margin, 10, logoW, logoH);
        titleX = margin + logoW + 16;
      } catch (e) { /* sin logo: el encabezado queda igual */ }
    }
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('Ficha de propiedad', titleX, 34);
    if (rightText) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(String(rightText), pageW - margin, 34, { align: 'right' });
    }
  }

  /**
   * Construye el PDF de la propiedad.
   * @param {object} opts
   *   · property (objeto Property completo o item de inventario poblado)
   *   · asesor   { name, phone, email, id }  → usuario que COMPARTE
   *   · fotos    string[]  opcional (si no se pasa se usa property.photos)
   * @returns {Promise<{blob: Blob, filename: string, photosUsed, photosTotal}>}
   */
  async function build({ property, asesor = null, fotos = null } = {}) {
    const JsPDF = jsPDFCtor();
    if (!JsPDF) throw new Error('No se pudo cargar la librería PDF (jsPDF)');

    let prop = property || {};
    // Enriquecido: si el objeto viene parcial (por ejemplo desde una tarjeta de
    // inventario), se pide la ficha COMPLETA para que el PDF lleve toda la
    // información de la propiedad (características, propietario, descripción…).
    const needsFull = prop._id && (prop.characteristics === undefined || prop.owner === undefined || prop.description === undefined);
    if (needsFull && window.API && window.API.properties && window.API.properties.get) {
      try {
        const full = await window.API.properties.get(prop._id);
        const doc = full && full.data !== undefined ? full.data : full;
        if (doc) prop = { ...prop, ...doc };
      } catch (e) { /* se genera con lo que haya */ }
    }
    const sourcePhotos = fotos || prop.photos || [];
    const rawPhotos = (Array.isArray(sourcePhotos) ? sourcePhotos : []).filter(Boolean);
    const photos = await loadPhotos(rawPhotos);
    const doc = new JsPDF({ unit: 'pt', format: 'letter' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    const contentW = pageW - margin * 2;

    // ── Datos de contacto de quien COMPARTE (usuario activo) ───────────
    const user = (window.ApiClient && ApiClient.getStoredUser()) || {};
    const asesorNombre = (asesor && asesor.name) || user.name || '';
    const asesorTel = (asesor && asesor.phone) || user.phone || '';
    const asesorEmail = (asesor && asesor.email) || user.email || '';

    const logo = await loadLogo();

    // ── Encabezado de marca (logo + título + folio) ────────────────────
    paintHeader(doc, pageW, margin, logo, prop.folio ? `Folio ${prop.folio}` : '');

    let y = 66;

    // Límite útil de la página: deja libre el pie de página.
    const PAGE_BOTTOM = pageH - 48;
    const addPage = (top = 70) => {
      doc.addPage();
      paintHeader(doc, pageW, margin, logo, prop.folio ? `Folio ${prop.folio}` : '');
      y = top;
    };
    const ensureSpace = (needed, top = 70) => {
      if (y + needed > PAGE_BOTTOM) addPage(top);
    };
    const sectionLabel = (label) => {
      ensureSpace(32);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.text(label, margin, y + 10);
      doc.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
      doc.roundedRect(margin, y + 15, 30, 2.5, 1.2, 1.2, 'F');
      y += 25;
    };

    // ── Portada destacada (la primera foto) ────────────────────────────
    if (photos.length) {
      const areaH = 230;
      const img = photos[0];
      const dims = doc.getImageProperties(img);
      const ratio = Math.min(contentW / dims.width, areaH / dims.height);
      const w = dims.width * ratio;
      const h = dims.height * ratio;
      const imgX = margin + (contentW - w) / 2;
      const imgY = y + 6;
      doc.addImage(img, 'JPEG', imgX, imgY, w, h);
      // Marco + etiqueta "PORTADA" para que quede clara la foto principal.
      doc.setDrawColor(INK[0], INK[1], INK[2]);
      doc.setLineWidth(1.2);
      doc.rect(imgX, imgY, w, h, 'S');
      doc.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
      doc.rect(imgX, imgY, 64, 16, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
      doc.text('PORTADA', imgX + 8, imgY + 11);
      doc.setLineWidth(0.2);
      y += 6 + h + 16;
    } else {
      y += 12;
    }

    // ── Título, ubicación y precio destacado ───────────────────────────
    const tipo = TYPE_LABELS[prop.type] || 'Propiedad';
    const operacion = OP_LABELS[prop.operationType] || '';
    const titulo = operacion ? `${tipo} en ${operacion}` : tipo;
    const estado = prop.status ? (STATUS_LABELS[prop.status] || String(prop.status).replace(/_/g, ' ')) : '';

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.text('FICHA DE PROPIEDAD', margin, y + 8);
    y += 21;

    doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text(titulo, margin, y + 16);
    y += 31;

    const place = [prop.address, prop.zone, prop.city, prop.state].filter(Boolean).join(', ');
    if (place) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11.5);
      doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
      wrapText(doc, place, contentW).forEach((line) => {
        if (y + 16 > PAGE_BOTTOM) addPage();
        doc.text(line, margin, y + 10);
        y += 15;
      });
      y += 7;
    }

    // Banda de precio y estado: da jerarquía visual a lo más importante.
    if (prop.price || operacion || estado) {
      const heroH = 54;
      ensureSpace(heroH + 16);
      doc.setFillColor(INK[0], INK[1], INK[2]);
      doc.roundedRect(margin, y, contentW, heroH, 7, 7, 'F');

      const priceText = prop.price ? currency(prop.price) : 'Precio a consultar';
      let priceSize = 19;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(priceSize);
      while (doc.getTextWidth(priceText) > contentW - 230 && priceSize > 12) {
        priceSize -= 1;
        doc.setFontSize(priceSize);
      }
      doc.setFontSize(8);
      doc.setTextColor(205, 190, 225);
      doc.text('PRECIO', margin + 18, y + 15);
      doc.setFontSize(priceSize);
      doc.setTextColor(255, 255, 255);
      doc.text(priceText, margin + 18, y + 40);

      let chipX = pageW - margin - 16;
      const chipY = y + 17;
      const chipH = 21;
      const drawChip = (text, fill, color) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        const chipW = doc.getTextWidth(text) + 18;
        chipX -= chipW;
        doc.setFillColor(fill[0], fill[1], fill[2]);
        doc.roundedRect(chipX, chipY, chipW, chipH, 10.5, 10.5, 'F');
        doc.setTextColor(color[0], color[1], color[2]);
        doc.text(text, chipX + chipW / 2, chipY + 13.8, { align: 'center' });
        chipX -= 6;
      };
      if (estado) drawChip(estado.toUpperCase(), [255, 255, 255], INK);
      if (operacion) drawChip(operacion.toUpperCase(), GOLD, [255, 255, 255]);

      y += heroH + 18;
    }

    // ── Datos clave (recuadro de dos columnas etiqueta/valor) ──────────
    // Primero se calculan las filas para saber la altura del recuadro; el
    // fondo se pinta ANTES del texto (si no, lo taparía).
    const filas = [];
    if (prop.folio) filas.push({ label: 'Folio', value: prop.folio });
    if (prop.operationType) filas.push({ label: 'Operación', value: OP_LABELS[prop.operationType] || prop.operationType });
    if (prop.type) filas.push({ label: 'Tipo', value: tipo });
    if (prop.status) filas.push({ label: 'Estado', value: estado || String(prop.status).replace(/_/g, ' ') });
    if (prop.address) filas.push({ label: 'Dirección', value: prop.address });
    const zonaTxt = [prop.zone, prop.city, prop.state].filter(Boolean).join(', ');
    if (zonaTxt) filas.push({ label: 'Zona / ciudad', value: zonaTxt });
    const chars = caracteristicas(prop);
    if (chars.length) filas.push({ label: 'Características', value: chars.join(' · ') });
    const pagos = paymentLabel(prop);
    if (pagos) filas.push({ label: 'Se puede vender con', value: pagos });
    const propietario = (prop.owner && (prop.owner.nombre || prop.owner.name)) || prop.ownerName;
    if (propietario) filas.push({ label: 'Propietario', value: propietario });
    const asesorResp = prop.responsibleUser && (prop.responsibleUser.name || prop.responsibleUser);
    if (asesorResp) filas.push({ label: 'Asesor responsable', value: asesorResp });
    if (prop.isExternal) {
      filas.push({ label: 'Origen', value: prop.externalAdvisor ? `Externa — ofrecida por ${prop.externalAdvisor}` : 'Externa (otra inmobiliaria)' });
    }
    if (prop.location && prop.location.lat && prop.location.lng) {
      filas.push({ label: 'Coordenadas', value: `${prop.location.lat}, ${prop.location.lng}` });
    }
    if (prop.createdAt) {
      try { filas.push({ label: 'Alta en el CRM', value: new Date(prop.createdAt).toLocaleDateString('es-MX') }); } catch (e) { /* opcional */ }
    }

    const VALUE_X = margin + 150;
    const VALUE_W = contentW - 168;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const filasRender = [];
    filas.forEach((f) => {
      const lines = wrapText(doc, f.value, VALUE_W);
      lines.forEach((line, i) => {
        filasRender.push({ label: i === 0 ? f.label : '', value: line });
      });
    });

    if (filasRender.length) {
      ensureSpace(25 + 18 + 18);
      sectionLabel('Datos de la propiedad');
      let filaIdx = 0;
      while (filaIdx < filasRender.length) {
        const rowH = 18;
        const maxRows = Math.max(1, Math.floor((PAGE_BOTTOM - y - 18) / rowH));
        const chunk = filasRender.slice(filaIdx, filaIdx + maxRows);
        const cardH = chunk.length * rowH + 18;

        doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
        doc.setFillColor(253, 252, 255);
        doc.roundedRect(margin, y, contentW, cardH, 7, 7, 'FD');
        // Acento lateral dorado + filas separadas por líneas muy suaves.
        doc.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
        doc.roundedRect(margin, y, 4, cardH, 2, 2, 'F');

        let rowY = y + 17;
        chunk.forEach((fila, i) => {
          if (i > 0) {
            doc.setDrawColor(ROW_LINE[0], ROW_LINE[1], ROW_LINE[2]);
            doc.setLineWidth(0.4);
            doc.line(margin + 18, rowY - 13, margin + contentW - 18, rowY - 13);
          }
          if (fila.label) {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(INK[0], INK[1], INK[2]);
            doc.text(fila.label, margin + 18, rowY);
          }
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
          doc.text(fila.value, VALUE_X, rowY);
          rowY += rowH;
        });
        doc.setLineWidth(0.2);

        filaIdx += chunk.length;
        y += cardH + 18;
        if (filaIdx < filasRender.length) {
          addPage();
          sectionLabel('Datos de la propiedad (continuación)');
        }
      }
    }

    // ── Descripción completa, con panel de contraste y paginación ──────
    if (prop.description) {
      ensureSpace(130);
      // Cabecera sólida: separa la descripción del resto de la ficha.
      doc.setFillColor(INK[0], INK[1], INK[2]);
      doc.roundedRect(margin, y, contentW, 30, 7, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      doc.text('Descripción', margin + 18, y + 19.5);
      doc.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
      doc.roundedRect(pageW - margin - 42, y + 13.5, 24, 3, 1.5, 1.5, 'F');
      y += 38;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      const descLines = wrapText(doc, prop.description, contentW - 40);
      const descLineH = 15.5;
      const panelPad = 18;
      let descIdx = 0;
      while (descIdx < descLines.length) {
        if (descIdx > 0) {
          ensureSpace(40);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9.5);
          doc.setTextColor(INK[0], INK[1], INK[2]);
          doc.text('Descripción (continuación)', margin, y + 10);
          y += 22;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(11);
        }

        const availableH = PAGE_BOTTOM - y - panelPad * 2;
        const maxLines = Math.max(1, Math.floor(availableH / descLineH));
        const chunk = descLines.slice(descIdx, descIdx + maxLines);
        const panelH = panelPad * 2 + chunk.length * descLineH;

        // Fondo lavanda + borde definido: el texto ya no se pierde en blanco.
        doc.setFillColor(PANEL_BG[0], PANEL_BG[1], PANEL_BG[2]);
        doc.setDrawColor(PANEL_BORDER[0], PANEL_BORDER[1], PANEL_BORDER[2]);
        doc.setLineWidth(0.8);
        doc.roundedRect(margin, y, contentW, panelH, 8, 8, 'FD');
        doc.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
        doc.roundedRect(margin, y, 4, panelH, 2, 2, 'F');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
        let lineY = y + panelPad + 11;
        chunk.forEach((line) => {
          if (line) doc.text(line, margin + 20, lineY);
          lineY += descLineH;
        });

        descIdx += chunk.length;
        y += panelH + 12;
        if (descIdx < descLines.length) addPage();
      }
      y += 6;
    }

    // ── Galería: TODAS las fotos adicionales en mosaico de 2 columnas ──
    const extras = photos.slice(1);
    if (extras.length) {
      ensureSpace(25 + 20 + 150);
      sectionLabel(`Galería de fotos (${extras.length})`);
      const tileW = (contentW - 14) / 2;
      const tileH = 150;
      for (let i = 0; i < extras.length; i += 2) {
        if (y + tileH + 12 > PAGE_BOTTOM) {
          addPage();
          sectionLabel('Galería de fotos (continuación)');
        }
        const row = extras.slice(i, i + 2);
        row.forEach((img, col) => {
          const tx = margin + col * (tileW + 14);
          // Marco claro detrás de cada foto para que el mosaico quede parejo.
          doc.setFillColor(248, 247, 252);
          doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
          doc.setLineWidth(0.5);
          doc.roundedRect(tx, y, tileW, tileH, 6, 6, 'FD');

          let dims;
          try { dims = doc.getImageProperties(img); } catch (e) { dims = { width: tileW, height: tileH }; }
          const ratio = Math.min((tileW - 12) / dims.width, (tileH - 12) / dims.height);
          const w = dims.width * ratio;
          const h = dims.height * ratio;
          const ix = tx + (tileW - w) / 2;
          const iy = y + (tileH - h) / 2;
          try {
            doc.addImage(img, 'JPEG', ix, iy, w, h);
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.4);
            doc.rect(ix, iy, w, h, 'S');
          } catch (e) { /* se omite la foto que falle */ }
        });
        y += tileH + 12;
      }
      y += 4;
      doc.setLineWidth(0.2);
    }

    // ── Contacto del asesor que comparte (usuario activo) + QR ─────────
    if (asesorNombre || asesorTel || asesorEmail || (window.PublicQR && prop._id)) {
      const qrWanted = !!(window.PublicQR && prop._id);
      const boxH = qrWanted ? 132 : 112;
      ensureSpace(25 + boxH + 12);
      sectionLabel('Contacto para esta propiedad');

      doc.setFillColor(250, 248, 254);
      doc.setDrawColor(PANEL_BORDER[0], PANEL_BORDER[1], PANEL_BORDER[2]);
      doc.setLineWidth(0.8);
      doc.roundedRect(margin, y, contentW, boxH, 8, 8, 'FD');
      doc.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
      doc.roundedRect(margin, y, 4, boxH, 2, 2, 'F');

      const qrSize = 72;
      const textW = qrWanted ? contentW - qrSize - 64 : contentW - 40;
      let contactoY = y + 28;

      if (asesorNombre) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12.5);
        doc.setTextColor(INK[0], INK[1], INK[2]);
        doc.text(asesorNombre, margin + 18, contactoY);
        contactoY += 20;
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
      if (asesorTel) {
        wrapText(doc, `WhatsApp / Teléfono: ${asesorTel}`, textW).forEach((line) => {
          doc.text(line, margin + 18, contactoY);
          contactoY += 15;
        });
        contactoY += 2;
      }
      if (asesorEmail) {
        wrapText(doc, `Correo electrónico: ${asesorEmail}`, textW).forEach((line) => {
          doc.text(line, margin + 18, contactoY);
          contactoY += 15;
        });
        contactoY += 2;
      }
      doc.setFontSize(9);
      doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
      doc.text('Atendido por asesor de INMOBLES', margin + 18, contactoY);

      // QR con la ficha pública (si tenemos el QR y el id de la propiedad).
      if (qrWanted) {
        try {
          const qrTarget = `https://inmobles.com/propiedades.html?propId=${encodeURIComponent(prop._id)}`;
          const qrData = await window.PublicQR.dataUrl(qrTarget, 240);
          if (qrData) {
            const qx = pageW - margin - qrSize - 16;
            const qy = y + 18;
            doc.setFillColor(255, 255, 255);
            doc.roundedRect(qx - 4, qy - 4, qrSize + 8, qrSize + 30, 6, 6, 'F');
            doc.addImage(qrData, 'PNG', qx, qy, qrSize, qrSize);
            doc.setFontSize(7.8);
            doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
            doc.text('Escanea para ver', qx + qrSize / 2, qy + qrSize + 12, { align: 'center' });
            doc.text('más detalles', qx + qrSize / 2, qy + qrSize + 22, { align: 'center' });
          }
        } catch (e) { /* el QR es opcional */ }
      }
      doc.setLineWidth(0.2);
      y += boxH + 12;
    }

    // ── Pie de página (en todas las páginas) ───────────────────────────
    const pages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pages; p += 1) {
      doc.setPage(p);
      doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
      doc.line(margin, pageH - 28, pageW - margin, pageH - 28);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
      doc.text(
        `INMOBLES | Generado desde el CRM · ${new Date().toLocaleDateString('es-MX')}${asesorNombre ? ` · ${asesorNombre}` : ''}`,
        margin,
        pageH - 16
      );
      doc.text(`${p} / ${pages}`, pageW - margin, pageH - 16, { align: 'right' });
    }

    const slug = `${tipo}${operacion ? `-${operacion}` : ''}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const filename = `${slug || 'propiedad'}-${prop.folio ? String(prop.folio).toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'pdf'}.pdf`;

    return { blob: doc.output('blob'), filename, photosUsed: photos.length, photosTotal: rawPhotos.length };
  }

  // Comparte el PDF: navigator.share (celular/escritorio) y, si el navegador
  // no permite compartir archivos, lo descarga para que el asesor elija el
  // canal (WhatsApp, correo, etc.).
  async function share(pdf, phone = '', previewText = '') {
    let file = null;
    try {
      file = pdf && pdf.blob
        ? new File([pdf.blob], pdf.filename || 'propiedad.pdf', { type: 'application/pdf' })
        : null;
    } catch (e) {
      // Navegadores antiguos sin constructor File: se usa la descarga directa.
      file = null;
    }

    // Algunos navegadores lanzan al consultar canShare; se protege para que
    // siempre se caiga al respaldo de descarga en vez de fallar.
    let canShareFiles = false;
    try {
      canShareFiles = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
    } catch (e) {
      canShareFiles = false;
    }

    if (canShareFiles) {
      try {
        await navigator.share({ files: [file], text: previewText || '' });
        return 'shared';
      } catch (error) {
        if (error && error.name === 'AbortError') return 'cancelled';
        // Otro fallo → cae al respaldo de abajo.
      }
    }

    // Respaldo universal: DESCARGAR el PDF. Sin esto el botón decía "PDF
    // generado" pero no entregaba ningún archivo (algunos navegadores de
    // escritorio no soportan compartir archivos por navigator.share).
    // El asesor decide después por dónde enviarlo (WhatsApp, correo, etc.).
    const blob = pdf && pdf.blob ? pdf.blob : null;
    if (!blob) return 'failed';
    const filename = (pdf && pdf.filename) || 'propiedad.pdf';
    try {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Se libera el object URL después de que el navegador inició la descarga.
      setTimeout(() => {
        try { URL.revokeObjectURL(url); } catch (e) { /* noop */ }
      }, 4000);
      return 'downloaded';
    } catch (e) {
      return 'failed';
    }
  }

  return { build, share };
})();
