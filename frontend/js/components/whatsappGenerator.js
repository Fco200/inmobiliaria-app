'use strict';

// Compartir propiedad por WhatsApp. Abre un modal para elegir el teléfono
// (cliente de la cartera o captura manual) y genera un PDF con:
//   · Portada destacada (primera foto del editor de fotos).
//   · Descripción completa respetando los saltos de línea.
//   · Ubicación y datos clave de la propiedad.
//   · Datos de contacto del asesor que COMPARTEN (usuario activo del CRM),
//     nunca los del creador original de la ficha.
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
      `Hola, te comparto esta propiedad que creo que te puede interesar:`,
      ``,
      `${descripcion(prop)}`,
    ];
    if (prop && prop.price) lines.push(`Precio: ${window.Format ? Format.currency(prop.price) : prop.price}`);
    const chars = caracteristicas(prop);
    if (chars.length) lines.push(`Características: ${chars.join(', ')}`);
    const place = [prop.address, prop.zone, prop.city, prop.state].filter(Boolean).join(', ');
    if (place) lines.push(`Ubicación: ${place}`);
    lines.push(``, `Te envío el detalle en el archivo adjunto 📄`);
    if (asesor && (asesor.name || asesor.phone)) {
      lines.push(``);
      lines.push(`Para más información puedes contactarme:`);
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
    const contactName = contact.name || '';
    const contactPhone = contact.phone || '';

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
          📄 Se generará un <strong>PDF con fotos, descripción y tus datos de contacto</strong>
          para adjuntarlo al mensaje de WhatsApp.
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;">Selecciona un cliente</label>
          <select class="form-control" data-wa-client>
            <option value="">— Elegir cliente —</option>
            ${clientOptions}
          </select>
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;">O captura el número (WhatsApp)</label>
          <input class="form-control" data-wa-phone type="tel" placeholder="Ej. 555 123 4567" autocomplete="off">
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;">Mensaje que acompaña al PDF</label>
          <textarea class="form-control" data-wa-text rows="7" readonly></textarea>
        </div>
      </div>
    `;

    const modal = UI.openModal({
      title: `WhatsApp — ${descripcion(prop)}`,
      body,
      footer: `
        <button class="btn btn-secondary" type="button" data-wa-cancel>Cancelar</button>
        <button class="btn btn-primary" type="button" data-wa-pdf disabled>Generar PDF y compartir</button>
      `,
    });

    const overlay = modal.bodyEl ? modal.bodyEl.closest('#modal-overlay') : null;
    if (!overlay) return;

    const textArea = overlay.querySelector('[data-wa-text]');
    const phoneInput = overlay.querySelector('[data-wa-phone]');
    const clientSel = overlay.querySelector('[data-wa-client]');
    const pdfBtn = overlay.querySelector('[data-wa-pdf]');

    const refresh = () => {
      const num = Format.waNumber(clientSel ? clientSel.value : '') || Format.waNumber(phoneInput ? phoneInput.value : '');
      const text = textoMensaje(prop, contact);
      if (textArea) textArea.value = text;
      if (pdfBtn) {
        if (num) {
          pdfBtn.disabled = false;
          pdfBtn.style.pointerEvents = '';
          pdfBtn.style.opacity = '1';
        } else {
          pdfBtn.disabled = true;
          pdfBtn.style.pointerEvents = 'none';
          pdfBtn.style.opacity = '.5';
        }
      }
    };

    if (clientSel) clientSel.addEventListener('change', refresh);
    if (phoneInput) phoneInput.addEventListener('input', refresh);
    if (textArea) textArea.value = textoMensaje(prop, contact);
    refresh();

    const closeBtn = overlay.querySelector('[data-wa-cancel]');
    if (closeBtn) closeBtn.addEventListener('click', () => UI.closeModal());

    if (pdfBtn) {
      pdfBtn.addEventListener('click', async () => {
        const num = Format.waNumber(clientSel ? clientSel.value : '') || Format.waNumber(phoneInput ? phoneInput.value : '');
        if (!num) {
          UI.toast('Selecciona un cliente o captura un número de WhatsApp', 'warning');
          return;
        }
        pdfBtn.disabled = true;
        const original = pdfBtn.textContent;
        pdfBtn.textContent = 'Generando PDF…';
        try {
          const pdf = await PropertyPdf.build({ property: prop, asesor: contact });
          const result = await PropertyPdf.share(pdf, num, textoMensaje(prop, contact));
          // Aviso según las fotos que SÍ entraron al PDF: si había fotos y
          // ninguna cargó (típico con HEIC de iPhone), se avisa para que el
          // asesor las suba en JPG/PNG y vuelva a compartir.
          const used = pdf.photosUsed || 0;
          const total = pdf.photosTotal || 0;
          const faltaFotos = total > 0 && used === 0;
          if (result === 'shared') {
            UI.closeModal();
            UI.toast(
              faltaFotos
                ? 'PDF compartido, pero sin fotos: no se pudieron cargar (si son HEIC, súbelas en JPG/PNG).'
                : used
                  ? `PDF compartido con ${used} foto${used === 1 ? '' : 's'} por WhatsApp`
                  : 'PDF compartido por WhatsApp',
              faltaFotos ? 'warning' : 'success'
            );
          } else if (result === 'downloaded') {
            UI.toast(
              faltaFotos
                ? 'PDF descargado sin fotos (formato no compatible). Adjúntalo al WhatsApp y súbelas en JPG/PNG.'
                : 'PDF descargado. Adjúntalo al mensaje de WhatsApp que se abrió.',
              faltaFotos ? 'warning' : 'success'
            );
          }
        } catch (error) {
          UI.toast(error.message || 'No se pudo generar el PDF', 'error');
        } finally {
          pdfBtn.disabled = false;
          pdfBtn.textContent = original;
          refresh();
        }
      });
    }
  }

  return { open };
})();
