'use strict';

// Generador de mensajes de WhatsApp desde una propiedad. Abre un modal donde
// se elige un cliente (con su teléfono) o se captura uno manual, y arma el
// enlace wa.me con los datos de la propiedad (título, ubicación, precio,
// características y contacto del asesor responsable).
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

  function textoMensaje(prop, asesor) {
    const lines = [
      `Hola, te comparto esta propiedad que creo que te puede interesar:`,
      ``,
      `${descripcion(prop)}`,
    ];
    if (prop && prop.price) lines.push(`Precio: ${window.Format ? Format.currency(prop.price) : prop.price}`);
    const chars = caracteristicas(prop);
    if (chars.length) lines.push(`Características: ${chars.join(', ')}`);
    if (prop && prop.ticketValue) lines.push(`Valor de ticket: ${window.Format ? Format.currency(prop.ticketValue) : prop.ticketValue}`);
    if (asesor && (asesor.name || asesor.phone)) {
      lines.push(``);
      lines.push(`Para más información puedes contactarme:`);
      if (asesor.name) lines.push(`Asesor: ${asesor.name}`);
    }
    return lines.join('\n');
  }

  // `asis` = usuario del CRM (responsable). `asesorContacto` = objeto opcional
  // del asesor con name/phone/email si el inmueble tiene un responsable.
  function open({ property, clients = [], asesor = null }) {
    const prop = property || {};
    const contact = asesor || (prop.responsibleUser && typeof prop.responsibleUser === 'object' ? prop.responsibleUser : null);
    const contactName = contact ? contact.name : (asesor ? asesor.name : '');
    const contactPhone = contact ? contact.phone : (prop.responsibleUser && typeof prop.responsibleUser === 'string' ? '' : '');

    // Clientes que sí tienen teléfono (los que no, no sirven para WhatsApp).
    const conTelefono = (clients || []).filter((c) => c && digits(c.phone));

    const clientOptions = conTelefono.length
      ? conTelefono
          .map((c) => `<option value="${UI.escapeHtml(digits(c.phone))}">${UI.escapeHtml(c.name)} — ${UI.escapeHtml(c.phone)}</option>`)
          .join('')
      : '<option value="">No hay clientes con teléfono registrado</option>';

    const body = `
      <div style="display:grid;gap:14px;">
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
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;">Mensaje a enviar</label>
          <textarea class="form-control" data-wa-text rows="6" readonly></textarea>
        </div>
      </div>
    `;

    const modal = UI.openModal({
      title: `WhatsApp — ${descripcion(prop)}`,
      body,
      footer: `
        <button class="btn btn-secondary" type="button" data-wa-cancel>Cancelar</button>
        <a class="btn btn-wa" href="#" target="_blank" rel="noopener" data-wa-open>Enviar por WhatsApp</a>
      `,
    });

    const overlay = modal.bodyEl ? modal.bodyEl.closest('#modal-overlay') : null;
    if (!overlay) return;

    const textArea = overlay.querySelector('[data-wa-text]');
    const phoneInput = overlay.querySelector('[data-wa-phone]');
    const clientSel = overlay.querySelector('[data-wa-client]');
    const openLink = overlay.querySelector('[data-wa-open]');

    const urlBase = Format.waNumber(contactPhone)
      ? `https://wa.me/${Format.waNumber(contactPhone)}`
      : (window.AppConfig && window.AppConfig.resolveUrl) ? '' : '';

    const refresh = () => {
      const num = Format.waNumber(clientSel ? clientSel.value : '') || Format.waNumber(phoneInput ? phoneInput.value : '');
      const text = textoMensaje(prop, contact || (asesor ? asesor : null));
      if (textArea) textArea.value = text;
      if (openLink) {
        if (num) {
          openLink.href = `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
          openLink.style.pointerEvents = '';
          openLink.style.opacity = '1';
          openLink.style.display = '';
        } else {
          openLink.removeAttribute('href');
          openLink.style.pointerEvents = 'none';
          openLink.style.opacity = '.5';
        }
      }
    };

    if (clientSel) clientSel.addEventListener('change', refresh);
    if (phoneInput) phoneInput.addEventListener('input', refresh);

    const closeBtn = overlay.querySelector('[data-wa-cancel]');
    if (closeBtn) closeBtn.addEventListener('click', () => UI.closeModal());

    if (textArea) textArea.value = textoMensaje(prop, contact || (asesor ? asesor : null));
    refresh();
  }

  return { open };
})();