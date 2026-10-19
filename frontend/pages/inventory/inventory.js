'use strict';

window.Pages = window.Pages || {};

// Módulo "Propiedades": es el INVENTARIO GENERAL del equipo (antes "Mis
// Propiedades"). Muestra solo las propiedades que los asesores COMPARTIERON
// desde "Captar Propiedades", incluidas las externas de otras inmobiliarias.
//   - Quien capta decide ahí mismo si comparte la propiedad al inventario.
//   - Asesores y personal: solo consultan (detalle, citas, negocios y
//     WhatsApp) y crean apartir de ahí. No editan ni eliminan la ficha.
//   - Administración/gerencia: además administran (editar, asignar, quitar).
// No hay interruptor de publicación en este módulo.
window.Pages.inventory = {
  title: 'Propiedades',

  async render(container) {
    // Tipos de cita en el orden del formulario (compartido con Citas).
    const TIPOS_CITA = [
      ['visita_propiedad', 'Visita a la propiedad'],
      ['oficina', 'Oficina'],
      ['promesa', 'Promesa'],
      ['avaluo', 'Avalúo'],
      ['seguimiento', 'Seguimiento'],
      ['firma_notario', 'Firma Notario'],
      ['entrega', 'Entrega'],
      ['comisiones', 'Comisiones'],
      ['otro', 'Otro (especificar)'],
    ];
    const TIPOS_INMUEBLE = ['casa', 'departamento', 'local', 'bodega', 'rancho', 'terreno', 'playa', 'otro'];
    const ESTADOS_PROPIEDAD = ['disponible', 'en_proceso', 'apartada', 'vendida', 'rentada', 'inactiva'];

    // Único listado: el inventario general del equipo.
    const state = { page: 1, q: '', agent: '' };

    const stored = window.ApiClient.getStoredUser();
    const role = stored && stored.role ? (stored.role.code || stored.role) : '';
    const isBoss = role === 'admin' || role === 'gerencia';

    let me = null;
    let users = [];
    let clients = [];
    try {
      const [m, u, c] = await Promise.all([
        API.auth.me().catch(() => null),
        API.users.list({ limit: 200 }).catch(() => ({ data: [] })),
        API.clients.list({ limit: 100 }).catch(() => ({ data: [] })),
      ]);
      me = m;
      users = u.data;
      clients = c.data;
    } catch (error) {
      me = null;
      users = [];
      clients = [];
    }

    // Asesores y jefes que pueden verse como responsables.
    const agents = users.filter((u) => u && u.role && ['admin', 'gerencia', 'asesor'].includes(u.role.code || u.role));
    const myId = (me && me._id) || (stored && stored._id) || '';

    const propertyLabel = (prop) => {
      if (!prop) return '—';
      return [prop.zone, prop.city].filter(Boolean).join(' ').trim() || prop.address || 'Propiedad';
    };

    // ---- Detalle de la propiedad (con mercado e historial) ----

    function openDetailModal(item) {
      const prop = item.property;
      // Inventario general de consulta: asesores y personal solo ven el
      // detalle, agendan citas, crean negocios y comparten. Editar fotos, notas
      // o la ficha queda reservado a administración/gerencia.
      const puedeModificar = isBoss;
      const canEditPhotos = isBoss;

      const modal = UI.openModal({
        title: `Inventario — ${propertyLabel(prop)}`,
        body: '<div class="loading">Cargando...</div>',
        size: 860,
        footer: `
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:space-between;width:100%;">
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn btn-primary" type="button" data-appointment>Agendar cita</button>
              <button class="btn btn-secondary" type="button" data-business>Crear negocio</button>
              <button class="btn btn-success" type="button" data-whatsapp>WhatsApp</button>
              ${puedeModificar ? '<button class="btn btn-secondary" type="button" data-obs>Observaciones</button>' : ''}
            </div>
            <button class="btn btn-secondary" type="button" data-close>Cerrar</button>
          </div>`,
      });

      const overlay = modal.bodyEl ? modal.bodyEl.closest('#modal-overlay') : null;
      if (overlay) {
        const closeBtnEl = overlay.querySelector('[data-close]');
        if (closeBtnEl) closeBtnEl.addEventListener('click', () => UI.closeModal());
        const apptBtn = overlay.querySelector('[data-appointment]');
        if (apptBtn) apptBtn.addEventListener('click', () => { UI.closeModal(); openAppointmentModal(item); });
        const bizBtn = overlay.querySelector('[data-business]');
        if (bizBtn) bizBtn.addEventListener('click', () => { UI.closeModal(); openBusinessModal(item); });
        const obsBtn = overlay.querySelector('[data-obs]');
        if (obsBtn) obsBtn.addEventListener('click', () => { UI.closeModal(); openObservationsModal(item); });
        const waBtn = overlay.querySelector('[data-whatsapp]');
        if (waBtn) waBtn.addEventListener('click', () => {
          WhatsAppGenerator.open({
            property: prop,
            clients,
            asesor: me || (item.assignedAgent && typeof item.assignedAgent === 'object' ? item.assignedAgent : null),
          });
        });
      }

      const paint = async () => {
        let market = {};
        try { market = await API.properties.market(prop._id); } catch (error) { market = {}; }
        // Negocios abiertos de esta propiedad: se muestran sin importar quién
        // sea el dueño, para avisar que un compañero ya la está trabajando.
        let negocios = [];
        try {
          const resNeg = await API.businesses.byProperty(prop._id);
          negocios = (resNeg && resNeg.data) || [];
        } catch (error) { negocios = []; }
        const negociosHtml = negocios.length
          ? `<div class="alert alert-info" style="margin:0 0 14px;align-items:flex-start;display:flex;gap:10px;">
              <span style="font-size:18px;">&#9888;&#65039;</span>
              <div>
                <strong>Esta propiedad ya tiene ${negocios.length === 1 ? 'un negocio abierto' : `${negocios.length} negocios abiertos`}.</strong>
                <ul style="margin:6px 0 0;padding-left:18px;font-size:13px;">
                  ${negocios.map((b) => {
                    const asesor = b.mainAdvisor && b.mainAdvisor.name ? b.mainAdvisor.name : 'Sin asesor';
                    const etapa = String(b.currentStage || '').replace(/_/g, ' ');
                    return `<li>${UI.escapeHtml(b.name || 'Negocio')} — ${UI.escapeHtml(asesor)}${etapa ? ` (${UI.escapeHtml(etapa)})` : ''}</li>`;
                  }).join('')}
                </ul>
              </div>
            </div>`
          : '';
        const mk = market || {};
        const history = prop.priceHistory || [];
        const current = Number(prop.price) || 0;
        const position = current && mk.min != null && mk.max > mk.min
          ? Math.max(2, Math.min(100, ((current - mk.min) / (mk.max - mk.min)) * 100))
          : 50;
        const photos = (prop.photos || []).filter(Boolean);
        const characteristics = (prop.characteristics || [])
          .map((c) => `<li><strong>${UI.escapeHtml(c.name)}:</strong> ${UI.escapeHtml(c.value)}</li>`)
          .join('');

        modal.bodyEl.innerHTML = `
          ${negociosHtml}
          <div class="grid grid-2" style="align-items:start;">
            <div>
              ${photos.length
                ? `<div class="detail-photos">
                    ${photos.map((p) => `
                      <div class="detail-photo">
                        <img src="${window.AppConfig.resolveUrl(p)}" alt="" loading="lazy" data-full="${UI.escapeHtml(p)}">
                        ${canEditPhotos ? `<button type="button" class="detail-photo-x" data-photo-remove="${UI.escapeHtml(p)}" title="Quitar foto">&times;</button>` : ''}
                      </div>`).join('')}
                  </div>`
                : '<p class="text-muted" style="font-size:13px;">Sin fotos todavía.</p>'}
              <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
                ${photos.length > 1 ? `<button class="btn btn-secondary btn-sm" type="button" data-gallery>Ver todas (${photos.length})</button>` : ''}
                ${canEditPhotos ? `<label class="btn btn-secondary btn-sm" style="cursor:pointer;">+ Añadir fotos<input type="file" accept="image/*" multiple style="display:none" data-photos-input></label>` : ''}
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
                ${UI.badge(String(prop.type || '').replace(/_/g, ' '), 'info')}
                ${UI.badge(String(prop.operationType || ''), 'primary')}
                ${prop.status ? UI.badge(String(prop.status).replace(/_/g, ' '), 'warning') : ''}
                ${prop.isExternal ? UI.badge('Externa', 'warning') : ''}
              </div>
              ${prop.isExternal && prop.externalAdvisor ? `<p class="text-muted" style="font-size:13px;margin:0 0 6px;">Propiedad externa ofrecida por: <strong>${UI.escapeHtml(prop.externalAdvisor)}</strong></p>` : ''}
              <p class="text-muted" style="margin:0 0 4px;">${UI.escapeHtml([prop.address, prop.zone, prop.city, prop.state].filter(Boolean).join(', ') || 'Sin ubicación')}</p>
              <p style="font-size:20px;font-weight:700;margin:6px 0;">${Format.currency(current)}</p>
              <p class="text-muted" style="font-size:13px;margin:0 0 8px;">Valor de ticket: ${Format.currency(prop.ticketValue || 0)}</p>
              ${prop.description ? `<p class="preserve-lines" style="font-size:13px;">${UI.escapeHtml(prop.description)}</p>` : ''}
              ${characteristics ? `<ul style="font-size:13px;margin:8px 0;padding-left:18px;">${characteristics}</ul>` : ''}
              <p class="text-muted" style="font-size:13px;margin:8px 0 0;">
                Asesor asignado: <strong>${UI.escapeHtml(item.assignedAgent ? item.assignedAgent.name : 'Sin asignar')}</strong>
              </p>
            </div>
            <div class="card" style="padding:14px;">
              <h4 style="margin:0 0 8px;">Precio y mercado</h4>
              ${mk.count
                ? `
                  <p class="text-muted" style="font-size:12px;margin:0 0 10px;">Basado en ${mk.count} ${mk.count === 1 ? 'inmueble similar' : 'inmuebles similares'}.</p>
                  <div class="grid grid-2">
                    <div class="stat-card" style="padding:8px;"><div class="stat-label">Promedio</div><div class="stat-value" style="font-size:15px;">${Format.currency(mk.avg)}</div></div>
                    <div class="stat-card" style="padding:8px;"><div class="stat-label">Mínimo</div><div class="stat-value" style="font-size:15px;">${Format.currency(mk.min)}</div></div>
                    <div class="stat-card" style="padding:8px;"><div class="stat-label">Máximo</div><div class="stat-value" style="font-size:15px;">${Format.currency(mk.max)}</div></div>
                    <div class="stat-card" style="padding:8px;"><div class="stat-label">Este inmueble</div><div class="stat-value" style="font-size:15px;">${Format.currency(current)}</div></div>
                  </div>
                  <div class="progress" style="margin-top:12px;"><div class="progress-bar" style="width:${position}%;"></div></div>`
                : '<p class="text-muted" style="font-size:13px;">No hay inmuebles similares para comparar todavía.</p>'}
              <h4 style="margin:16px 0 8px;">Historial de precios</h4>
              ${history.length
                ? `<div class="table-wrapper"><table class="table"><thead><tr><th>Fecha</th><th>Precio</th></tr></thead><tbody>${history.map((h) => `<tr><td>${Format.date(h.date)}</td><td>${Format.currency(h.price)}</td></tr>`).join('')}</tbody></table></div>`
                : '<p class="text-muted" style="font-size:13px;">Sin cambios de precio registrados.</p>'}
            </div>
          </div>`;

        // Ampliar una foto usa el visor interno: nunca se abre otra pestaña.
        modal.bodyEl.querySelectorAll('[data-full]').forEach((img) => {
          img.addEventListener('click', () => UI.showImages([img.getAttribute('src')], `Foto — ${propertyLabel(prop)}`));
        });
        const galleryBtn = modal.bodyEl.querySelector('[data-gallery]');
        if (galleryBtn) {
          galleryBtn.addEventListener('click', () => UI.showImages(photos, `Fotos — ${propertyLabel(prop)}`));
        }
        const photosInput = modal.bodyEl.querySelector('[data-photos-input]');
        if (photosInput) {
          photosInput.addEventListener('change', async () => {
            if (!photosInput.files || !photosInput.files.length) return;
            try {
              await API.properties.uploadPhotos(prop._id, photosInput.files);
              UI.toast('Fotos agregadas', 'success');
              paint();
            } catch (photoError) {
              UI.toast(photoError.message, 'error');
            }
          });
        }
        modal.bodyEl.querySelectorAll('[data-photo-remove]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const url = btn.getAttribute('data-photo-remove');
            UI.confirm('¿Quitar esta foto?').then(async (ok) => {
              if (!ok) return;
              try {
                await API.properties.update(prop._id, {
                  photos: (prop.photos || []).filter((p) => p !== url),
                });
                UI.toast('Foto eliminada', 'success');
                paint();
              } catch (photoError) {
                UI.toast(photoError.message, 'error');
              }
            });
          });
        });
      };
      paint().catch((error) => {
        modal.bodyEl.innerHTML = UI.errorAlert(error.message);
      });
    }

    // ---- Agendar cita desde el inventario ----

    function openAppointmentModal(item) {
      const prop = item.property;
      const clientOptions = clients.length
        ? `<option value="">— Selecciona un cliente —</option>` + clients.map((c) => `<option value="${c._id}">${UI.escapeHtml(c.name)}</option>`).join('')
        : `<option value="">No hay clientes registrados</option>`;
      const modal = UI.openModal({
        title: `Agendar cita — ${propertyLabel(prop)}`,
        body: `
          <div class="form-group">
            <label>Cliente</label>
            <select class="form-control" data-client required>${clientOptions}</select>
          </div>
          <div class="form-group">
            <label>Fecha y hora</label>
            <input class="form-control" type="datetime-local" data-date required>
          </div>
          <div class="form-group">
            <label>Tipo de cita</label>
            <select class="form-control" data-type>
              ${TIPOS_CITA.map(([v, l]) => `<option value="${v}" ${v === 'visita_propiedad' ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Notas</label>
            <textarea class="form-control" data-notes rows="2" placeholder="Comentarios de la visita"></textarea>
          </div>
        `,
        footer: `
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary" type="button" data-ok>Agendar</button>`,
      });
      const overlay = modal.bodyEl ? modal.bodyEl.closest('#modal-overlay') : null;
      if (!overlay) return;
      const cancelBtn = overlay.querySelector('[data-cancel]');
      if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());
      const okBtn = overlay.querySelector('[data-ok]');
      if (okBtn) okBtn.addEventListener('click', async () => {
        const client = overlay.querySelector('[data-client]').value;
        const date = overlay.querySelector('[data-date]').value;
        if (!client) return UI.toast('Selecciona un cliente', 'warning');
        if (!date) return UI.toast('Indica la fecha y hora', 'warning');
        try {
          const typeEl = overlay.querySelector('[data-type]');
          const notesEl = overlay.querySelector('[data-notes]');
          const type = typeEl ? typeEl.value : 'visita_propiedad';
          const specify = UI.otrosText ? UI.otrosText(typeEl) : '';
          if (type === 'otro' && !String(specify).trim()) return UI.toast('Especifica el tipo de cita', 'warning');
          await API.appointments.create({
            user: myId,
            client,
            property: prop._id,
            date: new Date(date).toISOString(),
            type,
            typeOther: type === 'otro' ? String(specify).trim() : '',
            notes: notesEl.value || '',
          });
          UI.toast('Cita agendada', 'success');
          UI.closeModal();
        } catch (error) {
          UI.toast(error.message, 'error');
        }
      });
    }

    // ---- Crear negocio desde el inventario ----

    function openBusinessModal(item) {
      const prop = item.property;
      const clientOptions = clients.length
        ? `<option value="">— Selecciona el cliente comprador —</option>` + clients.map((c) => `<option value="${c._id}">${UI.escapeHtml(c.name)}</option>`).join('')
        : `<option value="">No hay clientes registrados</option>`;
      const modal = UI.openModal({
        title: `Nuevo negocio — ${propertyLabel(prop)}`,
        body: `
          <div class="form-group">
            <label>Nombre del negocio</label>
            <input class="form-control" data-name value="Venta ${UI.escapeHtml(String(prop.type || ''))} ${UI.escapeHtml(String(prop.zone || ''))} ${UI.escapeHtml(String(prop.city || ''))}">
          </div>
          <div class="form-group">
            <label>Cliente comprador</label>
            <select class="form-control" data-client required>${clientOptions}</select>
          </div>
          <div class="form-group">
            <label>Valor de la operación</label>
            <input class="form-control" type="number" min="0" step="0.01" data-value value="${Number(prop.price) || 0}">
          </div>
          <div class="form-group">
            <label>Propuesta inicial (oferta)</label>
            <input class="form-control" type="number" min="0" step="0.01" data-offer value="${Number(prop.price) || 0}">
          </div>
          <div class="form-group">
            <label>Notas</label>
            <textarea class="form-control" data-notes rows="2" placeholder="Detalles de la negociación"></textarea>
          </div>
        `,
        footer: `
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary" type="button" data-ok>Crear negocio</button>`,
      });
      const overlay = modal.bodyEl ? modal.bodyEl.closest('#modal-overlay') : null;
      if (!overlay) return;
      const cancelBtn = overlay.querySelector('[data-cancel]');
      if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());
      const okBtn = overlay.querySelector('[data-ok]');
      if (okBtn) okBtn.addEventListener('click', async () => {
        const buyerClient = overlay.querySelector('[data-client]').value;
        const name = overlay.querySelector('[data-name]').value.trim();
        if (!buyerClient) return UI.toast('Selecciona el cliente comprador', 'warning');
        if (!name) return UI.toast('Escribe el nombre del negocio', 'warning');
        try {
          await API.businesses.create({
            name,
            buyerClient,
            property: prop._id,
            mainAdvisor: myId,
            valueOperation: Number(overlay.querySelector('[data-value]').value) || 0,
            negotiation: {
              offer: Number(overlay.querySelector('[data-offer]').value) || 0,
              notes: overlay.querySelector('[data-notes]').value || '',
            },
          });
          UI.toast('Negocio creado', 'success');
          UI.closeModal();
        } catch (error) {
          UI.toast(error.message, 'error');
        }
      });
    }

    // ---- Observaciones ----

    function openObservationsModal(item) {
      const modal = UI.openModal({
        title: `Observaciones — ${propertyLabel(item.property)}`,
        body: `
          <div class="form-group">
            <label>Notas internas de trabajo</label>
            <textarea class="form-control" data-obs rows="4">${UI.escapeHtml(item.observations || '')}</textarea>
          </div>
        `,
        footer: `
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary" type="button" data-ok>Guardar</button>`,
      });
      const overlay = modal.bodyEl ? modal.bodyEl.closest('#modal-overlay') : null;
      if (!overlay) return;
      const cancelBtn = overlay.querySelector('[data-cancel]');
      if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());
      const okBtn = overlay.querySelector('[data-ok]');
      if (okBtn) okBtn.addEventListener('click', async () => {
        try {
          await API.inventory.update(item._id, { observations: overlay.querySelector('[data-obs]').value });
          UI.toast('Observaciones guardadas', 'success');
          UI.closeModal();
          load();
        } catch (error) {
          UI.toast(error.message, 'error');
        }
      });
    }

    // ---- Editar propiedad ----

    function openEditModal(item) {
      const prop = item.property || {};
      const opts = (list, current) => list.map((v) => `<option value="${v}" ${String(current) === v ? 'selected' : ''}>${v}</option>`).join('');
      const agentOptions = agents.map((u) => `<option value="${u._id}" ${prop.responsibleUser && String(prop.responsibleUser._id || prop.responsibleUser) === String(u._id) ? 'selected' : ''}>${UI.escapeHtml(u.name)}</option>`).join('');
      const modal = UI.openModal({
        title: `Editar propiedad — ${propertyLabel(prop)}`,
        body: `
          <div class="grid grid-2">
            <div class="form-group">
              <label>Tipo</label>
              <select class="form-control" data-type>${opts(TIPOS_INMUEBLE, prop.type)}</select>
            </div>
            <div class="form-group">
              <label>Operación</label>
              <select class="form-control" data-operation>${opts(['venta', 'renta'], prop.operationType)}</select>
            </div>
            <div class="form-group">
              <label>Precio</label>
              <input class="form-control" type="number" min="0" step="0.01" data-price value="${Number(prop.price) || 0}">
            </div>
            <div class="form-group">
              <label>Valor del ticket</label>
              <input class="form-control" type="number" min="0" step="0.01" data-ticket value="${Number(prop.ticketValue) || 0}">
            </div>
            <div class="form-group">
              <label>Estado</label>
              <select class="form-control" data-status>${opts(ESTADOS_PROPIEDAD, prop.status)}</select>
            </div>
            ${isBoss ? `<div class="form-group">
              <label>Responsable</label>
              <select class="form-control" data-responsible>
                <option value="">— Sin responsable —</option>
                ${agentOptions}
              </select>
            </div>` : ''}
            ${isBoss ? `<div class="form-group" style="display:flex;align-items:center;gap:8px;">
              <input type="checkbox" id="edit-external" data-external ${prop.isExternal ? 'checked' : ''}>
              <label for="edit-external" style="margin:0;">Propiedad externa (ajena al equipo)</label>
            </div>
            <div class="form-group" data-external-wrap style="${prop.isExternal ? '' : 'display:none;'}">
              <label>Asesor / inmobiliaria externa</label>
              <input class="form-control" data-external-advisor value="${UI.escapeHtml(prop.externalAdvisor || '')}" placeholder="Ej. Inmobiliaria Centro…">
            </div>` : ''}
            <div class="form-group">
              <label>Calle / dirección</label>
              <input class="form-control" data-address value="${UI.escapeHtml(prop.address || '')}">
            </div>
            <div class="form-group">
              <label>Colonia</label>
              <input class="form-control" data-zone value="${UI.escapeHtml(prop.zone || '')}">
            </div>
            <div class="form-group">
              <label>Ciudad</label>
              <input class="form-control" data-city value="${UI.escapeHtml(prop.city || '')}">
            </div>
            <div class="form-group" style="grid-column:1/-1;">
              <label>Fotografías</label>
              <div data-photos-manager></div>
            </div>
            <div class="form-group" style="grid-column:1/-1;">
              <label>Descripción</label>
              <textarea class="form-control" data-description rows="3">${UI.escapeHtml(prop.description || '')}</textarea>
            </div>
          </div>
        `,
        footer: `
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary" type="button" data-ok>Guardar</button>`,
      });
      const overlay = modal.bodyEl ? modal.bodyEl.closest('#modal-overlay') : null;
      if (!overlay) return;
      const cancelBtn = overlay.querySelector('[data-cancel]');
      if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());

      // Propiedad externa: mostrar/ocultar el campo del asesor externo.
      const externalEl = overlay.querySelector('[data-external]');
      const externalWrap = overlay.querySelector('[data-external-wrap]');
      if (externalEl && externalWrap) {
        externalEl.addEventListener('change', () => {
          externalWrap.style.display = externalEl.checked ? '' : 'none';
        });
      }

      // Editor visual de fotografías (agregar / quitar / reordenar).
      const pmMount = overlay.querySelector('[data-photos-manager]');
      const photoManager = (window.PhotoManager && pmMount)
        ? window.PhotoManager.create({ photos: Array.isArray(prop.photos) ? prop.photos : [] })
        : null;
      if (photoManager) pmMount.appendChild(photoManager.el);

      const okBtn = overlay.querySelector('[data-ok]');
      if (okBtn) okBtn.addEventListener('click', async () => {
        if (okBtn.disabled) return;
        okBtn.disabled = true;
        try {
          const body = {
            type: overlay.querySelector('[data-type]').value,
            operationType: overlay.querySelector('[data-operation]').value,
            price: Number(overlay.querySelector('[data-price]').value) || 0,
            ticketValue: Number(overlay.querySelector('[data-ticket]').value) || 0,
            status: overlay.querySelector('[data-status]').value,
            address: overlay.querySelector('[data-address]').value.trim(),
            zone: overlay.querySelector('[data-zone]').value.trim(),
            city: overlay.querySelector('[data-city]').value.trim(),
            description: overlay.querySelector('[data-description]').value.trim(),
          };
          const responsibleEl = overlay.querySelector('[data-responsible]');
          if (responsibleEl) body.responsibleUser = responsibleEl.value || null;
          const extEl = overlay.querySelector('[data-external]');
          if (extEl) {
            body.isExternal = extEl.checked;
            body.externalAdvisor = extEl.checked
              ? String(overlay.querySelector('[data-external-advisor]').value || '').trim()
              : '';
          }
          if (photoManager) body.photos = photoManager.getPhotos();
          await API.properties.update(prop._id, body);

          // Sube las fotos nuevas una por una para no perder el resto si una falla.
          const files = photoManager ? photoManager.getFiles() : [];
          if (files.length) {
            UI.toast(`Subiendo ${files.length} ${files.length === 1 ? 'fotografía' : 'fotografías'}...`, 'info');
            let failed = 0;
            for (const file of files) {
              try { await API.properties.uploadPhotos(prop._id, [file]); }
              catch (photoError) { failed += 1; }
            }
            if (failed) UI.toast(`No se subieron ${failed} ${failed === 1 ? 'imagen' : 'imágenes'}.`, 'warning');
          }

          UI.toast('Propiedad actualizada', 'success');
          UI.closeModal();
          load();
        } catch (error) {
          UI.toast(error.message, 'error');
          okBtn.disabled = false;
        }
      });
    }

    // ---- Asignar asesor (solo jefes) ----

    function openAssignModal(item) {
      const options = agents.map((u) => `<option value="${u._id}" ${String(item.assignedAgent && item.assignedAgent._id) === String(u._id) ? 'selected' : ''}>${UI.escapeHtml(u.name)}</option>`).join('');
      const modal = UI.openModal({
        title: `Asignar asesor — ${propertyLabel(item.property)}`,
        body: `
          <div class="form-group">
            <label>Asesor responsable</label>
            <select class="form-control" data-agent>
              <option value="">— Sin asesor —</option>
              ${options}
            </select>
          </div>
        `,
        footer: `
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary" type="button" data-ok>Guardar</button>`,
      });
      const overlay = modal.bodyEl ? modal.bodyEl.closest('#modal-overlay') : null;
      if (!overlay) return;
      const cancelBtn = overlay.querySelector('[data-cancel]');
      if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());
      const okBtn = overlay.querySelector('[data-ok]');
      if (okBtn) okBtn.addEventListener('click', async () => {
        try {
          await API.inventory.update(item._id, { assignedAgent: overlay.querySelector('[data-agent]').value || null });
          UI.toast('Asesor asignado', 'success');
          UI.closeModal();
          load();
        } catch (error) {
          UI.toast(error.message, 'error');
        }
      });
    }

    // ---- Encabezado ----

    function renderHeader(meta) {
      const el = document.createElement('div');
      el.className = 'page-header';
      el.innerHTML = `
        <div>
          <h2>Propiedades</h2>
          <p class="text-muted" style="margin:4px 0 0;">
            Inventario general del equipo: aquí aparecen las propiedades que los asesores comparten desde "Captar Propiedades", incluidas las externas de otras inmobiliarias o asesores.
            ${isBoss
              ? 'Edita, asigna o quita propiedades desde aquí.'
              : 'Abre cualquiera para ver el detalle, agendar una cita, crear un negocio o compartir por WhatsApp. La ficha de la propiedad no se modifica desde este módulo.'}
          </p>
          ${meta ? `<div class="home-stats" style="margin-top:14px;">
            <div class="home-stat"><span class="home-stat-icon">&#128230;</span><div><strong>${meta.total}</strong><small>Propiedades</small></div></div>
            <div class="home-stat"><span class="home-stat-icon">&#129333;</span><div><strong>${agents.length}</strong><small>Asesores</small></div></div>
          </div>` : ''}
        </div>
      `;
      return el;
    }

    function renderToolbar() {
      const el = document.createElement('div');
      el.style.cssText = 'display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center;';
      el.innerHTML = `
        <input class="form-control" data-q type="search" placeholder="Buscar por ubicación, tipo o folio..." value="${UI.escapeHtml(state.q)}" style="max-width:260px;">
        <select class="form-control" data-agent-filter style="max-width:220px;">
          <option value="">Todos los asesores</option>
          ${agents.map((u) => `<option value="${u._id}" ${state.agent === u._id ? 'selected' : ''}>${UI.escapeHtml(u.name)}</option>`).join('')}
        </select>
        <button class="btn btn-primary" type="button" data-search>Buscar</button>
        <button class="btn btn-secondary" type="button" data-clear>Limpiar</button>
      `;
      const run = () => {
        state.q = (el.querySelector('[data-q]').value || '').trim();
        state.agent = el.querySelector('[data-agent-filter]').value;
        state.page = 1;
        load();
      };
      el.querySelector('[data-search]').addEventListener('click', run);
      el.querySelector('[data-q]').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
      el.querySelector('[data-clear]').addEventListener('click', () => {
        state.q = ''; state.agent = ''; state.page = 1; load();
      });
      return el;
    }

    // ---- Tabla ----

    function renderTable(items) {
      const wrap = document.createElement('div');
      wrap.className = 'table-wrapper card';
      if (!items.length) {
        wrap.innerHTML = isBoss
          ? '<div class="empty-state"><p>El inventario general está vacío.</p><p class="text-muted">Cuando los asesores compartan propiedades desde "Captar Propiedades", aparecerán aquí.</p></div>'
          : '<div class="empty-state"><p>Aún no hay propiedades en el inventario general.</p><p class="text-muted">Aparecerán aquí cuando un asesor las comparta desde "Captar Propiedades".</p></div>';
        return wrap;
      }

      // Inventario general de consulta: el asesor solo ve el detalle, agenda
      // citas, crea negocios y comparte. Editar, asignar, notas y eliminar
      // quedan reservados a administración/gerencia.
      const puedeAdministrar = isBoss;

      const rows = items.map((item, index) => {
        const prop = item.property;
        const agentName = item.assignedAgent ? (item.assignedAgent.name || 'Usuario') : 'Sin asignar';
        return `
          <tr>
            <td>
              ${(() => {
                const hasPhoto = Boolean(prop && prop.photos && prop.photos.length);
                const src = hasPhoto ? window.AppConfig.resolveUrl(prop.photos[0]) : window.AppConfig.FALLBACK_IMG;
                return `<img ${hasPhoto ? `data-thumb-id="${UI.escapeHtml(String(item._id))}"` : ''} src="${src.replace(/"/g, '&quot;')}" alt="${hasPhoto ? '' : 'Sin foto'}" style="width:56px;height:42px;object-fit:cover;border-radius:6px;${hasPhoto ? 'cursor:zoom-in;' : ''}" loading="lazy" ${window.AppConfig.imgFallback}>`;
              })()}
            </td>
            <td><strong>${UI.escapeHtml(propertyLabel(prop))}</strong>${prop && prop.folio ? `<div class="text-muted" style="font-size:11px;">${UI.escapeHtml(prop.folio)}</div>` : ''}${prop && prop.isExternal ? ` ${UI.badge('Externa', 'warning')}${prop.externalAdvisor ? `<div class="text-muted" style="font-size:11px;">${UI.escapeHtml(prop.externalAdvisor)}</div>` : ''}` : ''}</td>
            <td>${prop ? UI.badge(String(prop.type || '').replace(/_/g, ' '), 'info') : '—'}</td>
            <td>${prop ? UI.badge(String(prop.operationType || ''), 'primary') : '—'}</td>
            <td>${prop ? Format.currency(prop.price) : '—'}</td>
            <td>${UI.escapeHtml(agentName)}</td>
            <td>
              <button class="btn btn-secondary btn-sm" data-action data-index="${index}" data-kind="view">Ver</button>
              ${puedeAdministrar ? `<button class="btn btn-secondary btn-sm" data-action data-index="${index}" data-kind="edit" style="margin-left:6px;">Editar</button>` : ''}
              ${puedeAdministrar && item.observations ? `<button class="btn btn-secondary btn-sm" data-action data-index="${index}" data-kind="obs" style="margin-left:6px;" title="Ver/editar notas">Notas</button>` : ''}
              <button class="btn btn-primary btn-sm" data-action data-index="${index}" data-kind="appointment" style="margin-left:6px;">Cita</button>
              <button class="btn btn-success btn-sm" data-action data-index="${index}" data-kind="business" style="margin-left:6px;">Negocio</button>
              ${isBoss ? `<button class="btn btn-secondary btn-sm" data-action data-index="${index}" data-kind="assign" style="margin-left:6px;">Asignar</button>` : ''}
              ${isBoss ? `<button class="btn btn-danger btn-sm" data-action data-index="${index}" data-kind="remove" style="margin-left:6px;">Quitar</button>` : ''}
            </td>
          </tr>`;
      }).join('');

      wrap.innerHTML = `
        <table class="table">
          <thead><tr>
            <th>Foto</th><th>Ubicación</th><th>Tipo</th><th>Operación</th><th>Precio</th><th>Asesor</th><th>Acciones</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `;

      wrap.querySelectorAll('[data-thumb-id]').forEach((thumb) => {
        thumb.addEventListener('click', () => {
          const item = items.find((i) => String(i._id) === thumb.dataset.thumbId);
          if (item) UI.showImages((item.property && item.property.photos) || [], 'Fotos de la propiedad');
        });
      });

      wrap.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const item = items[Number(btn.dataset.index)];
          if (!item) return;
          const kind = btn.dataset.kind;
          if (kind === 'view') openDetailModal(item);
          else if (kind === 'edit') openEditModal(item);
          else if (kind === 'obs') openObservationsModal(item);
          else if (kind === 'appointment') openAppointmentModal(item);
          else if (kind === 'business') openBusinessModal(item);
          else if (kind === 'assign') openAssignModal(item);
          else if (kind === 'remove') {
            UI.confirm('¿Quitar esta propiedad del inventario?').then((ok) => {
              if (!ok) return;
              API.inventory.remove(item._id)
                .then(() => { UI.toast('Quitada del inventario', 'success'); load(); })
                .catch((error) => UI.toast(error.message, 'error'));
            });
          }
        });
      });

      return wrap;
    }

    async function load() {
      container.innerHTML = '';
      let meta = null;
      container.appendChild(renderHeader(meta));
      container.appendChild(renderToolbar());

      const loading = document.createElement('div');
      loading.className = 'loading';
      loading.textContent = 'Cargando inventario...';
      container.appendChild(loading);

      try {
        const params = { page: state.page, limit: 15 };
        if (state.q) params.q = state.q;
        if (state.agent) params.assignedAgent = state.agent;
        const result = await API.inventory.general(params);
        meta = result.meta;
        loading.remove();
        container.innerHTML = '';
        container.appendChild(renderHeader(meta));
        container.appendChild(renderToolbar());
        container.appendChild(renderTable(result.data || []));
        if (meta && meta.pages > 1) {
          container.appendChild(UI.pagination(meta, (page) => { state.page = page; load(); }));
        }
      } catch (error) {
        loading.remove();
        const alertEl = document.createElement('div');
        alertEl.innerHTML = UI.errorAlert(error.message);
        container.appendChild(alertEl.firstChild || alertEl);
      }
    }

    load();
  },
};
