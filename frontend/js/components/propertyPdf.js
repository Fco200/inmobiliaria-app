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
//   PropertyPdf.share(pdf, 'casa-norte.pdf'); // navigator.share con fallback
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

  const OP_LABELS = { venta: 'Venta', renta: 'Renta' };

  const STATUS_LABELS = {
    disponible: 'Disponible',
    en_proceso: 'En proceso',
    apartada: 'Apartada',
    vendida: 'Vendida',
    rentada: 'Rentada',
    inactiva: 'Inactiva',
  };

  // Paleta de marca (morado INMOBLES + dorado).
  const INK = [45, 16, 72];
  const GOLD = [185, 145, 47];
  const SLATE = [71, 85, 105];

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

  // Logo de la inmobiliaria para el encabezado del PDF. Se carga una sola vez
  // (se cachea) y se convierte a PNG data-URL para conservar la transparencia.
  // Si no está disponible, el PDF se genera igual sin logo.
  let logoCache;
  function loadLogo() {
    if (logoCache !== undefined) return Promise.resolve(logoCache);
    return new Promise((resolve) => {
      let url = 'icons/logoinmobles.png';
      try { url = new URL('icons/logoinmobles.png', document.baseURI).href; } catch (e) { /* relativo */ }
      const img = new Image();
      const timer = setTimeout(() => { logoCache = null; resolve(null); }, 8000);
      img.onload = () => {
        clearTimeout(timer);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || 300;
          canvas.height = img.naturalHeight || 300;
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          logoCache = { data: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
          resolve(logoCache);
        } catch (e) { logoCache = null; resolve(null); }
      };
      img.onerror = () => { clearTimeout(timer); logoCache = null; resolve(null); };
      img.src = url;
    });
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
    const out = [];
    String(text || '').split(/\r?\n/).forEach((rawLine) => {
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
    doc.setFillColor(INK[0], INK[1], INK[2]);
    doc.rect(0, 0, pageW, 54, 'F');
    // Franja dorada inferior del encabezado.
    doc.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.rect(0, 50, pageW, 4, 'F');

    let titleX = margin;
    if (logo) {
      const logoH = 30;
      const logoW = Math.min(130, logo.width * (logoH / logo.height));
      try {
        doc.addImage(logo.data, 'PNG', margin, 11, logoW, logoH);
        titleX = margin + logoW + 14;
      } catch (e) { /* sin logo: el encabezado queda igual */ }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Ficha de propiedad', titleX, 32);
    if (rightText) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.text(String(rightText), pageW - margin, 32, { align: 'right' });
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
    // ID del usuario del CRM que comparte: es la trazabilidad que pidió el
    // negocio (sabe quién mandó la ficha).
    const asesorId = (asesor && (asesor.id || asesor._id)) || user._id || user.id || '';

    const logo = await loadLogo();

    // ── Encabezado de marca (logo + título + folio) ────────────────────
    paintHeader(doc, pageW, margin, logo, prop.folio ? `Folio ${prop.folio}` : '');

    let y = 66;

    // ── Portada destacada (la primera foto) ────────────────────────────
    if (photos.length) {
      const areaH = 250;
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
      doc.setTextColor(255, 255, 255);
      doc.text('PORTADA', imgX + 8, imgY + 11);
      doc.setLineWidth(0.2);
      y += 6 + h + 16;
    } else {
      y += 12;
    }

    // ── Título y ubicación ─────────────────────────────────────────────
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    const tipo = TYPE_LABELS[prop.type] || 'Propiedad';
    const operacion = OP_LABELS[prop.operationType] || '';
    const titulo = operacion ? `${tipo} en ${operacion}` : tipo;
    doc.text(titulo, margin, y + 14);
    y += 24;

    const place = [prop.address, prop.zone, prop.city, prop.state].filter(Boolean).join(', ');
    if (place) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
      wrapText(doc, place, contentW).forEach((line) => {
        doc.text(line, margin, y + 10);
        y += 14;
      });
      y += 6;
    }

    // ── Datos clave (recuadro de dos columnas etiqueta/valor) ──────────
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.setFontSize(11);

    // Primero se calculan las filas para saber la altura del recuadro; el
    // fondo se pinta ANTES del texto (si no, lo taparía).
    const filas = [];
    if (prop.folio) filas.push({ label: 'Folio', value: prop.folio });
    if (prop.price) filas.push({ label: 'Precio', value: currency(prop.price) });
    if (prop.ticketValue) filas.push({ label: 'Valor ticket', value: currency(prop.ticketValue) });
    if (prop.operationType) filas.push({ label: 'Operación', value: OP_LABELS[prop.operationType] || prop.operationType });
    if (prop.type) filas.push({ label: 'Tipo', value: tipo });
    if (prop.status) filas.push({ label: 'Estado', value: STATUS_LABELS[prop.status] || String(prop.status).replace(/_/g, ' ') });
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

    const filasRender = [];
    filas.forEach((f) => {
      const lines = wrapText(doc, f.value, contentW - 150);
      lines.forEach((line, i) => {
        filasRender.push({ label: i === 0 ? f.label : '', value: line });
      });
    });

    const datosTop = y + 6;
    const datosH = filasRender.length * 18 + 16;
    // Si el recuadro no cabe, se pasa a una página nueva antes de pintarlo.
    if (datosTop + datosH > pageH - 60) {
      doc.addPage();
      paintHeader(doc, pageW, margin, logo, prop.folio ? `Folio ${prop.folio}` : '');
      y = 66;
    }
    const datosTop2 = y + 6;
    doc.roundedRect(margin, datosTop2, contentW, datosH, 6, 6, 'FD');

    let datosY = datosTop2 + 22;
    filasRender.forEach((fila2) => {
      if (fila2.label) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(INK[0], INK[1], INK[2]);
        doc.text(`${fila2.label}:`, margin + 12, datosY);
      }
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      doc.text(fila2.value, margin + 130, datosY);
      datosY += 18;
    });
    y = datosTop2 + datosH + 18;

    // ── Descripción completa, con saltos de línea del original ─────────
    if (prop.description) {
      if (y > pageH - 160) {
        doc.addPage();
        paintHeader(doc, pageW, margin, logo, prop.folio ? `Folio ${prop.folio}` : '');
        y = 66;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      doc.text('Descripción', margin, y + 10);
      y += 22;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(51, 65, 85);
      const descLines = wrapText(doc, prop.description, contentW);
      descLines.forEach((line) => {
        if (y > pageH - 60) {
          doc.addPage();
          y = margin + 10;
        }
        doc.text(line, margin, y + 8);
        y += 13;
      });
      y += 10;
    }

    // ── Galería: TODAS las fotos adicionales en 2 columnas ─────────────
    const extras = photos.slice(1);
    if (extras.length) {
      if (y + 120 > pageH - 60) {
        doc.addPage();
        paintHeader(doc, pageW, margin, logo, prop.folio ? `Folio ${prop.folio}` : '');
        y = 66;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      doc.text(`Galería de fotos (${extras.length})`, margin, y + 10);
      y += 20;
      const tileW = (contentW - 12) / 2;
      const tileH = 150;
      extras.forEach((img, i) => {
        const col = i % 2;
        if (col === 0 && i > 0) y += tileH + 10;
        if (y + tileH > pageH - 60) {
          doc.addPage();
          paintHeader(doc, pageW, margin, logo, prop.folio ? `Folio ${prop.folio}` : '');
          y = 66;
        }
        let dims;
        try { dims = doc.getImageProperties(img); } catch (e) { dims = { width: tileW, height: tileH }; }
        const ratio = Math.min(tileW / dims.width, tileH / dims.height);
        const w = dims.width * ratio;
        const h = dims.height * ratio;
        const x = margin + col * (tileW + 12) + (tileW - w) / 2;
        try {
          doc.addImage(img, 'JPEG', x, y, w, h);
          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.5);
          doc.rect(x, y, w, h, 'S');
        } catch (e) { /* se omite la foto que falle */ }
      });
      y += tileH + 18;
    }

    // ── Contacto del asesor que comparte (usuario activo) + QR ─────────
    if (asesorNombre || asesorTel || asesorEmail || asesorId
        || (window.PublicQR && prop._id)) {
      const boxH = 108;
      if (y > pageH - (boxH + 40)) {
        doc.addPage();
        paintHeader(doc, pageW, margin, logo, prop.folio ? `Folio ${prop.folio}` : '');
        y = 66;
      }
      doc.setFillColor(240, 253, 244);
      doc.setDrawColor(34, 197, 94);
      doc.roundedRect(margin, y, contentW, boxH, 6, 6, 'FD');
      doc.setTextColor(20, 83, 45);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Para más información contáctame', margin + 14, y + 22);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      let contactoY = y + 42;
      if (asesorNombre) { doc.text(`Asesor: ${asesorNombre}`, margin + 14, contactoY); contactoY += 16; }
      if (asesorTel) { doc.text(`WhatsApp / Tel: ${asesorTel}`, margin + 14, contactoY); contactoY += 16; }
      if (asesorEmail) { doc.text(`Correo: ${asesorEmail}`, margin + 14, contactoY); contactoY += 16; }
      if (asesorId) {
        doc.setFontSize(8.5);
        doc.setTextColor(21, 101, 52);
        doc.text(`ID de usuario CRM: ${asesorId}`, margin + 14, contactoY);
        doc.setFontSize(10.5);
      }

      // QR con la ficha pública (si tenemos el QR y el id de la propiedad).
      if (window.PublicQR && prop._id) {
        try {
          const qrTarget = `https://inmobles.com/propiedades.html?propId=${encodeURIComponent(prop._id)}`;
          const qrData = await window.PublicQR.dataUrl(qrTarget, 220);
          if (qrData) {
            const size = 72;
            const qx = pageW - margin - size - 16;
            const qy = y + 20;
            doc.addImage(qrData, 'PNG', qx, qy, size, size);
            doc.setFontSize(7.5);
            doc.setTextColor(21, 101, 52);
            doc.text('Escanea para ver', qx + size / 2, qy + size + 10, { align: 'center' });
            doc.text('la propiedad', qx + size / 2, qy + size + 19, { align: 'center' });
          }
        } catch (e) { /* el QR es opcional */ }
      }
      y += boxH + 10;
    }

    // ── Pie de página (en todas las páginas) ───────────────────────────
    const pages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pages; p += 1) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Generado desde el CRM · ${new Date().toLocaleDateString('es-MX')}${asesorNombre ? ` · ${asesorNombre}` : ''}`,
        margin,
        pageH - 18
      );
      doc.text(`${p} / ${pages}`, pageW - margin, pageH - 18, { align: 'right' });
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

  // Comparte el PDF: navigator.share (celular/escritorio) con fallback a
  // descarga directa + enlace wa.me sin adjunto.
  async function share(pdf, phone = '', previewText = '') {
    const file = pdf && pdf.blob
      ? new File([pdf.blob], pdf.filename || 'propiedad.pdf', { type: 'application/pdf' })
      : null;

    // Algunos navegadores lanzan al consultar canShare; se protege para que
    // siempre se caiga al respaldo (descarga + wa.me) en vez de fallar.
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

    // Respaldo: descargar el PDF y abrir WhatsApp con el mensaje de texto.
    if (file) {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = pdf.filename || 'propiedad.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
    if (phone && window.Format && Format.waNumber && Format.waNumber(phone)) {
      window.open(`https://wa.me/${Format.waNumber(phone)}?text=${encodeURIComponent(previewText || '')}`, '_blank', 'noopener');
    }
    return 'downloaded';
  }

  return { build, share };
})();
