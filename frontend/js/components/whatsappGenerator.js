'use strict';

// Compartir una propiedad. Abre un modal para elegir el cliente/teléfono
// (opcional) y genera un PDF real con:
//   · Portada destacada (primera foto del editor de fotos).
//   · Descripción completa respetando los saltos de línea.
//   · Ubicación y datos clave de la propiedad.
//   · Datos de contacto del asesor que COMPARTE (usuario activo del CRM),
//     nunca los del creador original de la ficha.
//
// Flujo: ver propiedad → Compartir → Crear PDF → el asesor elige dónde
// compartirlo (menú del sistema, descarga directa o chat de WhatsApp).
// El mensaje de texto ya NO incluye el "valor ticket": ese dato es interno.
window.WhatsAppGenerator = (() => {
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

  function digits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function descripcion(prop) {
    if (!prop) return 'La propiedad';
    const type = TYPE_LABELS[prop.type] || prop.type || 'Propiedad';
    const op = prop.operationType ? ` en ${prop.operationType}` : '';
    const place = [prop.zone, prop.city, prop.state].filter(Boolean).join(', ');
    return `${type}${op}${place ? ` en ${place}` : ''}`;
  }

  function caracteristicas(prop) {
    const c = prop && prop.characteristics;
    if (!c) return [];
    if (Array.isArray(c)) {
      return c
        .map((item) => {
          if (item && typeof item === 'object') {
            return item.name && item.value ? `${item.name}: ${item.value}` : item.value || item.name || '';
          }
          return String(item);
        })
        .filter(Boolean);
    }
    return [String(c)];
  }

  // Texto corto que acompaña al PDF en el chat (sin valor ticket: dato interno).
  function textoMensaje(prop, asesor) {
    const lines = [
      'Hola, te comparto esta propiedad que creo que te puede interesar:',
      '',
      `${descripcion(prop)}`,
    ];
    if (prop && prop.price) lines.push(`Precio: ${window.Format ? Format.currency(prop.price) : prop.price}`);
    const chars = caracteristicas(prop);
    if (chars.length) lines.push(`Características: ${chars.join(', ')}`);
    const place = [prop.address, prop.zone, prop.city, prop.state].filter(Boolean).join(', ');
    if (place) lines.push(`Ubicación: ${place}`);
    lines.push('', 'Te envío el detalle en el archivo adjunto 📄');
    if (asesor && (asesor.name || asesor.phone)) {
      lines.push('');
      lines.push('Para más información puedes contactarme:');
      if (asesor.name) lines.push(`Asesor: ${asesor.name}`);
      if (asesor.phone) lines.push(`Tel / WhatsApp: ${asesor.phone}`);
      if (asesor.email) lines.push(`Correo: ${asesor.email}`);
    }
    return lines.join('\n');
  }

  function currentUser() {
    return (window.ApiClient && ApiClient.getStoredUser()) || {};
  }

  // Clientes con teléfono, cargados bajo demanda si la página no los pasó.
  async function loadClients(clients) {
    if (Array.isArray(clients) && clients.length) return clients;
    try {
      const res = await API.clients.list({ limit: 100 });
      return (res && res.data) || [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Abre el modal de compartir. Recibe:
   *   · property  — objeto Property (o item de inventario poblado)
   *   · clients   — lista opcional de clientes (si no, se carga)
   *   · asesor    — opcional {name, phone, email}; por defecto el usuario ACTIVO
   */
  async function open({ property, clients = [], asesor = null }) {
    const prop = property || {};
    // El contacto que viaja en el PDF y el mensaje es SIEMPRE quien comparte.
    const me = currentUser();
    const contact = asesor || {
      name: me.name || '',
      phone: me.phone || '',
      email: me.email || '',
      // ID del usuario del CRM que comparte: se imprime en el PDF para saber
      // quién envió la ficha.
      id: me._id || me.id || '',
    };

    const list = await loadClients(clients);
    const conTelefono = (list || []).filter((c) => c && digits(c.phone));

    const clientOptions = conTelefono.length
      ? conTelefono
        .map((c) => `<option value="${UI.escapeHtml(digits(c.phone))}">${UI.escapeHtml(c.name)} — ${UI.escapeHtml(c.phone)}</option>`)
        .join('')
      : '<option value="">No hay clientes con teléfono registrado</option>';

    const body = `
      <div style="display:grid;gap:14px;">
        <div class="stage-notice">
          📄 Se generará un <strong>PDF con fotos, descripción y tus datos de contacto</strong>.
          Al crearlo podrás elegir por dónde compartirlo (WhatsApp, correo u otra app).
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;">Selecciona un cliente (opcional)</label>
          <select class="form-control" data-wa-client>
            <option value="">— Sin cliente / captura el número —</option>
            ${clientOptions}
          </select>
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;">Número de WhatsApp (opcional)</label>
          <input class="form-control" data-wa-phone type="tel" placeholder="Ej. 555 123 4567" autocomplete="off">
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;">Mensaje que acompaña al PDF</label>
          <textarea class="form-control" data-wa-text rows="7" readonly></textarea>
        </div>
        <div data-wa-result style="display:none;gap:10px;">
          <div class="stage-notice" data-wa-result-info></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-primary" type="button" data-wa-share>Compartir PDF</button>
            <button class="btn btn-secondary" type="button" data-wa-download>Descargar PDF</button>
            <a class="btn btn-secondary" data-wa-preview target="_blank" rel="noopener">Abrir PDF</a>
            <button class="btn btn-success" type="button" data-wa-send>Enviar por WhatsApp</button>
          </div>
          <small class="text-muted" style="font-size:12px;">
            En celular, "Compartir PDF" abre el menú del sistema y elige la app (WhatsApp, correo, etc.).
            En computadora el PDF se descarga para que lo adjuntes donde quieras.
          </small>
        </div>
      </div>
    `;

    const modal = UI.openModal({
      title: `Compartir propiedad — ${descripcion(prop)}`,
      body,
      footer: `
        <button class="btn btn-secondary" type="button" data-wa-cancel>Cancelar</button>
        <button class="btn btn-primary" type="button" data-wa-pdf>Crear PDF</button>
      `,
      size: 680,
    });

    const overlay = modal.bodyEl ? modal.bodyEl.closest('#modal-overlay') : null;
    if (!overlay) return;

    const textArea = overlay.querySelector('[data-wa-text]');
    const phoneInput = overlay.querySelector('[data-wa-phone]');
    const clientSel = overlay.querySelector('[data-wa-client]');
    const pdfBtn = overlay.querySelector('[data-wa-pdf]');
    const resultBox = overlay.querySelector('[data-wa-result]');
    const resultInfo = overlay.querySelector('[data-wa-result-info]');
    const shareBtn = overlay.querySelector('[data-wa-share]');
    const downloadBtn = overlay.querySelector('[data-wa-download]');
    const previewLink = overlay.querySelector('[data-wa-preview]');
    const sendBtn = overlay.querySelector('[data-wa-send]');
    const cancelBtn = overlay.querySelector('[data-wa-cancel]');

    let lastPdf = null;
    let previewUrl = null;

    const phoneNumber = () => {
      const raw = (clientSel && clientSel.value) || (phoneInput && phoneInput.value) || '';
      return (window.Format && Format.waNumber ? Format.waNumber(raw) : digits(raw)) || '';
    };

    const cleanup = () => {
      if (previewUrl) {
        try { URL.revokeObjectURL(previewUrl); } catch (e) { /* noop */ }
        previewUrl = null;
      }
    };

    const refresh = () => {
      if (textArea) textArea.value = textoMensaje(prop, contact);
    };

    const showResult = (pdf) => {
      lastPdf = pdf;
      cleanup();
      previewUrl = URL.createObjectURL(pdf.blob);
      if (previewLink) previewLink.href = previewUrl;
      if (resultBox) {
        resultBox.style.display = 'grid';
        try { resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) { /* noop */ }
      }
      const used = pdf.photosUsed || 0;
      const total = pdf.photosTotal || 0;
      if (resultInfo) {
        const fotos = total > 0 && used === 0
          ? ' Sin fotos: no se pudieron cargar (si son HEIC, súbelas en JPG/PNG).'
          : used > 0
            ? ` Con ${used} foto${used === 1 ? '' : 's'}.`
            : '';
        resultInfo.innerHTML = `✅ <strong>PDF listo:</strong> ${UI.escapeHtml(pdf.filename || 'propiedad.pdf')}${UI.escapeHtml(fotos)}`;
      }
    };

    // Descarga directa (sin pasar por el menú del sistema).
    const downloadPdf = () => {
      if (!lastPdf || !lastPdf.blob) return;
      const url = URL.createObjectURL(lastPdf.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = lastPdf.filename || 'propiedad.pdf';
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => {
        try { URL.revokeObjectURL(url); } catch (e) { /* noop */ }
      }, 4000);
      UI.toast('PDF descargado. Adjúntalo en WhatsApp, correo u otra app.', 'success');
    };

    // Comparte con el menú del sistema; si el navegador no puede, descarga.
    const sharePdf = async () => {
      if (!lastPdf) return;
      const msg = textoMensaje(prop, contact);
      const result = await PropertyPdf.share(lastPdf, phoneNumber(), msg);
      if (result === 'shared') {
        UI.toast('PDF compartido.', 'success');
        cleanup();
        UI.closeModal();
      } else if (result === 'cancelled') {
        UI.toast('No se compartió. Puedes intentarlo de nuevo o descargar el PDF.', 'info');
      } else if (result === 'downloaded') {
        UI.toast('PDF descargado. Elige WhatsApp, correo u otra app para enviarlo.', 'success');
      } else {
        UI.toast('No se pudo compartir el PDF. Usa "Descargar PDF".', 'error');
      }
    };

    const sendWhatsApp = () => {
      const num = phoneNumber();
      if (!num) {
        UI.toast('Selecciona un cliente o captura un número de WhatsApp', 'warning');
        return;
      }
      const msg = textoMensaje(prop, contact);
      try {
        window.open(`https://wa.me/${digits(num)}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
      } catch (e) {
        UI.toast('No se pudo abrir WhatsApp. Revisa si el navegador bloqueó la ventana.', 'error');
      }
    };

    if (clientSel) clientSel.addEventListener('change', refresh);
    if (phoneInput) phoneInput.addEventListener('input', refresh);
    if (cancelBtn) cancelBtn.addEventListener('click', () => { cleanup(); UI.closeModal(); });
    if (shareBtn) shareBtn.addEventListener('click', sharePdf);
    if (downloadBtn) downloadBtn.addEventListener('click', downloadPdf);
    if (sendBtn) sendBtn.addEventListener('click', sendWhatsApp);
    refresh();

    if (pdfBtn) {
      pdfBtn.addEventListener('click', async () => {
        pdfBtn.disabled = true;
        pdfBtn.textContent = 'Generando PDF…';
        try {
          const pdf = await PropertyPdf.build({ property: prop, asesor: contact });
          showResult(pdf);
          UI.toast('PDF creado. Elige cómo compartirlo.', 'success');
        } catch (error) {
          UI.toast(error.message || 'No se pudo generar el PDF', 'error');
        } finally {
          pdfBtn.disabled = false;
          pdfBtn.textContent = 'Crear PDF de nuevo';
        }
      });
    }
  }

  return { open };
})();
