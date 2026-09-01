'use strict';

window.Pages = window.Pages || {};

window.Pages['inventory-general'] = {
  title: 'Inventario General',

  async render(container) {
    const state = { page: 1, q: '', agent: '', published: '' };

    const stored = window.ApiClient.getStoredUser();
    const role = stored && stored.role ? (stored.role.code || stored.role) : '';
    const isBoss = role === 'admin' || role === 'gerencia';

    let users = [];
    try {
      const u = await API.users.list({ limit: 200 }).catch(() => ({ data: [] }));
      users = u.data;
    } catch (error) {
      users = [];
    }

    let clients = [];
    try {
      const c = await API.clients.list({ limit: 100 }).catch(() => ({ data: [] }));
      clients = c.data;
    } catch (error) {
      clients = [];
    }

    // Asesores y jefes que pueden verse como responsables en el inventario.
    const agents = users.filter((u) =>
      u && u.role && ['admin', 'gerencia', 'asesor'].includes(u.role.code || u.role)
    );

    const propertyLabel = (prop) => {
      if (!prop) return '—';
      return [prop.zone, prop.city].filter(Boolean).join(' ').trim() || prop.address || 'Propiedad';
    };

    // ---- Detalle ----

    function openDetailModal(item) {
      const prop = item.property;
      const modal = UI.openModal({
        title: `Inventario General — ${propertyLabel(prop)}`,
        body: '<div class="loading">Cargando...</div>',
        size: 860,
        footer: `
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:space-between;width:100%;">
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              ${!isBoss ? '<button class="btn btn-secondary" type="button" data-appointment>Agendar cita</button>' : ''}
              ${!isBoss ? '<button class="btn btn-secondary" type="button" data-business>Crear negocio</button>' : ''}
              <button class="btn btn-success" type="button" data-whatsapp>WhatsApp</button>
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
        const waBtn = overlay.querySelector('[data-whatsapp]');
        if (waBtn) waBtn.addEventListener('click', () => {
          WhatsAppGenerator.open({
            property: prop,
            clients,
            asesor: (item.assignedAgent && typeof item.assignedAgent === 'object') ? item.assignedAgent : null,
          });
        });
      }

      const paint = async () => {
        let market = {};
        try { market = await API.properties.market(prop._id); } catch (error) { market = {}; }
        const mk = market || {};
        const history = prop.priceHistory || [];
        const current = Number(prop.price) || 0;
        const position = current && mk.min != null && mk.max > mk.min
          ? Math.max(2, Math.min(100, ((current - mk.min) / (mk.max - mk.min)) * 100))
          : 50;
        const photos = (prop.photos || []).filter(Boolean);
        const canEditPhotos = isBoss ||
          String((prop.responsibleUser && (prop.responsibleUser._id || prop.responsibleUser)) || '') === String((stored && stored._id) || '');
        const characteristics = (prop.characteristics || [])
          .map((c) => `<li><strong>${UI.escapeHtml(c.name)}:</strong> ${UI.escapeHtml(c.value)}</li>`)
          .join('');

        modal.bodyEl.innerHTML = `
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
                ${item.isPublished ? UI.badge('Publicado', 'success') : UI.badge('Sin publicar', 'muted')}
                ${prop.status ? UI.badge(String(prop.status).replace(/_/g, ' '), 'warning') : ''}
              </div>
              <p class="text-muted" style="margin:0 0 4px;">${UI.escapeHtml([prop.address, prop.zone, prop.city, prop.state].filter(Boolean).join(', ') || 'Sin ubicación')}</p>
              <p style="font-size:20px;font-weight:700;margin:6px 0;">${Format.currency(current)}</p>
              <p class="text-muted" style="font-size:13px;margin:0 0 8px;">Valor de ticket: ${Format.currency(prop.ticketValue || 0)}</p>
              ${prop.description ? `<p style="font-size:13px;">${UI.escapeHtml(prop.description)}</p>` : ''}
              ${characteristics ? `<ul style="font-size:13px;margin:8px 0;padding-left:18px;">${characteristics}</ul>` : ''}
              <p class="text-muted" style="font-size:13px;margin:8px 0 0;">
                Asesor responsable: <strong>${UI.escapeHtml(item.assignedAgent ? item.assignedAgent.name : 'Sin asignar')}</strong>
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

        modal.bodyEl.querySelectorAll('[data-full]').forEach((img) => {
          img.addEventListener('click', () => window.open(img.getAttribute('src'), '_blank', 'noopener'));
        });
        const galleryBtn = modal.bodyEl.querySelector('[data-gallery]');
        if (galleryBtn) {
          galleryBtn.addEventListener('click', () => UI.showImages(photos, `Fotos — ${UI.escapeHtml(propertyLabel(prop))}`));
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

    // ---- Cita / Negocio desde el inventario general (para asesores) ----

    function openAppointmentModal(item) {
      const prop = item.property;
      const modal = UI.openModal({
        title: `Agendar cita — ${propertyLabel(prop)}`,
        body: `
          <div class="form-group">
            <label>Cliente</label>
            <select class="form-control" data-client></select>
          </div>
          <div class="form-group">
            <label>Fecha y hora</label>
            <input class="form-control" type="datetime-local" data-date required>
          </div>
          <div class="form-group">
            <label>Tipo de cita</label>
            <select class="form-control" data-type>
              <option value="visita_propiedad" selected>Visita a la propiedad</option>
              <option value="oficina">Oficina</option>
              <option value="firma">Firma</option>
              <option value="avaluo">Avalúo</option>
              <option value="seguimiento">Seguimiento</option>
              <option value="otro">Otro</option>
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
      if (overlay && modal.bodyEl) {
        modal.bodyEl.querySelector('[data-client]').innerHTML =
          '<option value="">Cargando clientes...</option>';
        API.clients.list({ limit: 100 })
          .then((res) => {
            const clients = res.data || [];
            modal.bodyEl.querySelector('[data-client]').innerHTML =
              '<option value="">— Selecciona un cliente —</option>' +
              clients.map((c) => `<option value="${c._id}">${UI.escapeHtml(c.name)}</option>`).join('');
          })
          .catch(() => {
            modal.bodyEl.querySelector('[data-client]').innerHTML = '<option value="">Sin clientes</option>';
          });
      }
      if (!overlay) return;
      overlay.querySelector('[data-cancel]').addEventListener('click', () => UI.closeModal());
      overlay.querySelector('[data-ok]').addEventListener('click', async () => {
        const client = overlay.querySelector('[data-client]').value;
        const date = overlay.querySelector('[data-date]').value;
        if (!client) return UI.toast('Selecciona un cliente', 'warning');
        if (!date) return UI.toast('Indica la fecha y hora', 'warning');
        try {
          await API.appointments.create({
            user: stored && stored._id,
            client,
            property: prop._id,
            date: new Date(date).toISOString(),
            type: overlay.querySelector('[data-type]').value,
            notes: overlay.querySelector('[data-notes]').value,
          });
          UI.toast('Cita agendada', 'success');
          UI.closeModal();
        } catch (error) {
          UI.toast(error.message, 'error');
        }
      });
    }

    function openBusinessModal(item) {
      const prop = item.property;
      const modal = UI.openModal({
        title: `Nuevo negocio — ${propertyLabel(prop)}`,
        body: `
          <div class="form-group">
            <label>Nombre del negocio</label>
            <input class="form-control" data-name>
          </div>
          <div class="form-group">
            <label>Cliente comprador</label>
            <select class="form-control" data-client><option value="">Cargando clientes...</option></select>
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
      if (modal.bodyEl) {
        API.clients.list({ limit: 100 })
          .then((res) => {
            const clients = res.data || [];
            modal.bodyEl.querySelector('[data-client]').innerHTML =
              '<option value="">— Selecciona el cliente comprador —</option>' +
              clients.map((c) => `<option value="${c._id}">${UI.escapeHtml(c.name)}</option>`).join('');
          })
          .catch(() => {});
      }
      if (!overlay) return;
      overlay.querySelector('[data-cancel]').addEventListener('click', () => UI.closeModal());
      overlay.querySelector('[data-ok]').addEventListener('click', async () => {
        const buyerClient = overlay.querySelector('[data-client]').value;
        const name = overlay.querySelector('[data-name]').value.trim();
        if (!buyerClient) return UI.toast('Selecciona el cliente comprador', 'warning');
        if (!name) return UI.toast('Escribe el nombre del negocio', 'warning');
        try {
          await API.businesses.create({
            name,
            buyerClient,
            property: prop._id,
            mainAdvisor: stored && stored._id,
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

    // ---- Asignar / Quitar (solo jefes) ----

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
          </div>`,
        footer: `
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary" type="button" data-ok>Guardar</button>`,
      });
      const overlay = modal.bodyEl ? modal.bodyEl.closest('#modal-overlay') : null;
      if (!overlay) return;
      overlay.querySelector('[data-cancel]').addEventListener('click', () => UI.closeModal());
      overlay.querySelector('[data-ok]').addEventListener('click', async () => {
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

    function openUploadModal() {
      const agentOptions = agents.map((u) => `<option value="${u._id}">${UI.escapeHtml(u.name)}</option>`).join('');
      const modal = UI.openModal({
        title: 'Subir propiedad al inventario general',
        size: 720,
        body: `
          <div class="form-grid">
            <div class="form-group">
              <label>Tipo de inmueble</label>
              <select class="form-control" data-type required>
                <option value="">— Selecciona —</option>
                <option value="casa">Casa</option>
                <option value="departamento">Departamento</option>
                <option value="local">Local</option>
                <option value="bodega">Bodega</option>
                <option value="rancho">Rancho</option>
                <option value="terreno">Terreno</option>
                <option value="playa">Playa</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div class="form-group">
              <label>Operación</label>
              <select class="form-control" data-operation required>
                <option value="">— Selecciona —</option>
                <option value="venta">Venta</option>
                <option value="renta">Renta</option>
              </select>
            </div>
            ${isBoss ? `
            <div class="form-group">
              <label>Asesor asignado</label>
              <select class="form-control" data-agent>
                <option value="">— Sin asignar —</option>
                ${agentOptions}
              </select>
            </div>` : ''}
            ${!isBoss ? '<p class="text-muted" style="font-size:13px;margin:0;">Se asignará a ti automáticamente y quedará <strong>sin publicar</strong> hasta que administración la revise.</p>' : ''}
            <div class="form-group">
              <label>Folio</label>
              <input class="form-control" type="text" placeholder="Se genera automáticamente" disabled>
            </div>
            <div class="form-group">
              <label>Dirección</label>
              <input class="form-control" data-address placeholder="Calle y número">
            </div>
            <div class="form-group">
              <label>Colonia / Zona</label>
              <input class="form-control" data-zone>
            </div>
            <div class="form-group">
              <label>Ciudad</label>
              <input class="form-control" data-city>
            </div>
            <div class="form-group">
              <label>Estado</label>
              <input class="form-control" data-state>
            </div>
            <div class="form-group">
              <label>Precio (MXN)</label>
              <input class="form-control" type="number" min="0" step="0.01" data-price>
            </div>
            <div class="form-group">
              <label>Valor de ticket (MXN)</label>
              <input class="form-control" type="number" min="0" step="0.01" data-ticket>
            </div>
          </div>
          <div class="form-group">
            <label>Descripción</label>
            <textarea class="form-control" data-description rows="3" placeholder="Detalles del inmueble"></textarea>
          </div>
          <div class="form-group">
            <label>Fotos (hasta 10, opcional)</label>
            <input class="form-control" type="file" accept="image/*" multiple data-photos>
            <p class="text-muted" style="font-size:12px;margin:4px 0 0;">Se subirán después de crear la propiedad.</p>
          </div>
          ${isBoss ? `
          <div class="form-group" style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="invgen-publish" data-publish>
            <label for="invgen-publish" style="margin:0;">Publicar de inmediato en el catálogo</label>
          </div>` : ''}
        `,
        footer: `
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary" type="button" data-ok>${isBoss ? 'Subir propiedad' : 'Subir mi propiedad'}</button>`,
      });
      const overlay = modal.bodyEl ? modal.bodyEl.closest('#modal-overlay') : null;
      if (!overlay) return;
      overlay.querySelector('[data-cancel]').addEventListener('click', () => UI.closeModal());
      overlay.querySelector('[data-ok]').addEventListener('click', async () => {
        const type = overlay.querySelector('[data-type]').value;
        const operationType = overlay.querySelector('[data-operation]').value;
        if (!type || !operationType) return UI.toast('Selecciona el tipo y la operación', 'warning');
        const btn = overlay.querySelector('[data-ok]');
        btn.disabled = true;
        btn.textContent = 'Subiendo...';
        try {
          const agentEl = overlay.querySelector('[data-agent]');
          const publishEl = overlay.querySelector('[data-publish]');
          const created = await API.inventory.uploadProperty({
            type,
            operationType,
            assignedAgent: agentEl ? agentEl.value || null : null,
            address: overlay.querySelector('[data-address]').value.trim(),
            zone: overlay.querySelector('[data-zone]').value.trim(),
            city: overlay.querySelector('[data-city]').value.trim(),
            state: overlay.querySelector('[data-state]').value.trim(),
            price: Number(overlay.querySelector('[data-price]').value) || 0,
            ticketValue: Number(overlay.querySelector('[data-ticket]').value) || 0,
            description: overlay.querySelector('[data-description]').value.trim(),
            isPublished: publishEl ? publishEl.checked : false,
          });

          const photosInput = overlay.querySelector('[data-photos]');
          const propId = created && created.data && created.data.property ? created.data.property._id : null;
          if (photosInput && photosInput.files && photosInput.files.length && propId) {
            try {
              await API.properties.uploadPhotos(propId, photosInput.files);
            } catch (photoError) {
              UI.toast(`Propiedad creada, pero las fotos no se subieron: ${photoError.message}`, 'warning');
            }
          }

          UI.toast('Propiedad subida al inventario general', 'success');
          UI.closeModal();
          load();
        } catch (error) {
          btn.disabled = false;
          btn.textContent = 'Subir propiedad';
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
          <h2>Inventario General</h2>
          <p class="text-muted" style="margin:4px 0 0;">
            ${isBoss
              ? 'Administra las propiedades de todos los asesores del equipo: sube, publica, asigna y quita del inventario.'
              : 'Consulta las propiedades de todos los asesores y sube tus propias captaciones al inventario general. Ábrelas para ver el detalle, agendar citas o crear negocios.'}
          </p>
          ${meta ? `<div class="home-stats" style="margin-top:14px;">
            <div class="home-stat"><span class="home-stat-icon">&#128203;</span><div><strong>${meta.total}</strong><small>Propiedades</small></div></div>
            <div class="home-stat"><span class="home-stat-icon">&#129333;</span><div><strong>${agents.length}</strong><small>Asesores activos</small></div></div>
          </div>` : ''}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn btn-primary" type="button" data-upload>+ Subir propiedad</button></div>
      `;
      const upload = el.querySelector('[data-upload]');
      if (upload) upload.addEventListener('click', openUploadModal);
      return el;
    }

    function renderToolbar() {
      const el = document.createElement('div');
      el.style.cssText = 'display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center;';
      el.innerHTML = `
        <input class="form-control" data-q type="search" placeholder="Buscar por ubicación, tipo o folio..." value="${UI.escapeHtml(state.q)}" style="max-width:280px;">
        <select class="form-control" data-agent-filter style="max-width:240px;">
          <option value="">Todos los asesores</option>
          ${agents.map((u) => `<option value="${u._id}" ${state.agent === u._id ? 'selected' : ''}>${UI.escapeHtml(u.name)}</option>`).join('')}
        </select>
        <select class="form-control" data-published style="max-width:180px;">
          <option value="">Publicación</option>
          <option value="true" ${state.published === 'true' ? 'selected' : ''}>Publicadas</option>
          <option value="false" ${state.published === 'false' ? 'selected' : ''}>Sin publicar</option>
        </select>
        <button class="btn btn-primary" type="button" data-search>Buscar</button>
        <button class="btn btn-secondary" type="button" data-clear>Limpiar</button>
      `;
      const run = () => {
        state.q = (el.querySelector('[data-q]').value || '').trim();
        state.agent = el.querySelector('[data-agent-filter]').value;
        state.published = el.querySelector('[data-published]').value;
        state.page = 1;
        load();
      };
      el.querySelector('[data-search]').addEventListener('click', run);
      el.querySelector('[data-q]').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
      el.querySelector('[data-clear]').addEventListener('click', () => {
        el.querySelector('[data-q]').value = '';
        el.querySelector('[data-agent-filter]').value = '';
        el.querySelector('[data-published]').value = '';
        state.q = '';
        state.agent = '';
        state.published = '';
        state.page = 1;
        load();
      });
      return el;
    }

    function renderTable(items) {
      const wrap = document.createElement('div');
      wrap.className = 'table-wrapper card';
      if (!items.length) {
        wrap.innerHTML = '<div class="empty-state"><p>No hay propiedades en el inventario general.</p><p class="text-muted">Cuando administración suba propiedades, aparecerán aquí.</p></div>';
        return wrap;
      }

      const rows = items.map((item, index) => {
        const prop = item.property;
        const agentName = item.assignedAgent ? (item.assignedAgent.name || 'Usuario') : 'Sin asignar';
        return `
          <tr>
            <td><strong>${UI.escapeHtml(propertyLabel(prop))}</strong>${prop && prop.folio ? `<div class="text-muted" style="font-size:11px;">${UI.escapeHtml(prop.folio)}</div>` : ''}</td>
            <td>${prop ? UI.badge(String(prop.type || '').replace(/_/g, ' '), 'info') : '—'}</td>
            <td>${prop ? UI.badge(String(prop.operationType || ''), 'primary') : '—'}</td>
            <td>${prop ? Format.currency(prop.price) : '—'}</td>
            <td>${item.isPublished ? UI.badge('Publicado', 'success') : UI.badge('Sin publicar', 'muted')}</td>
            <td>${UI.escapeHtml(agentName)}</td>
            <td>
              <button class="btn btn-secondary btn-sm" data-action data-index="${index}" data-kind="view">Ver</button>
              ${!isBoss ? `<button class="btn btn-primary btn-sm" data-action data-index="${index}" data-kind="appointment" style="margin-left:6px;">Cita</button>` : ''}
              ${!isBoss ? `<button class="btn btn-success btn-sm" data-action data-index="${index}" data-kind="business" style="margin-left:6px;">Negocio</button>` : ''}
              ${isBoss && !item.isPublished ? `<button class="btn btn-primary btn-sm" data-action data-index="${index}" data-kind="publish" style="margin-left:6px;">Publicar</button>` : ''}
              ${isBoss && item.isPublished ? `<button class="btn btn-secondary btn-sm" data-action data-index="${index}" data-kind="publish" style="margin-left:6px;">Despublicar</button>` : ''}
              ${isBoss ? `<button class="btn btn-secondary btn-sm" data-action data-index="${index}" data-kind="assign" style="margin-left:6px;">Asignar</button>` : ''}
              ${isBoss ? `<button class="btn btn-danger btn-sm" data-action data-index="${index}" data-kind="remove" style="margin-left:6px;">Quitar</button>` : ''}
            </td>
          </tr>`;
      }).join('');

      wrap.innerHTML = `
        <table class="table">
          <thead><tr>
            <th>Ubicación</th><th>Tipo</th><th>Operación</th><th>Precio</th><th>Estado</th><th>Asesor</th><th>Acciones</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `;

      wrap.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const item = items[Number(btn.dataset.index)];
          if (!item) return;
          const kind = btn.dataset.kind;
          if (kind === 'view') openDetailModal(item);
          else if (kind === 'appointment') openAppointmentModal(item);
          else if (kind === 'business') openBusinessModal(item);
          else if (kind === 'assign') openAssignModal(item);
          else if (kind === 'publish') {
            API.inventory.publish(item._id, { isPublished: !item.isPublished })
              .then(() => { UI.toast('Inventario actualizado', 'success'); load(); })
              .catch((error) => UI.toast(error.message, 'error'));
          } else if (kind === 'remove') {
            UI.confirm('¿Quitar esta propiedad del inventario general?').then((ok) => {
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

      const loading = document.createElement('div');
      loading.className = 'loading';
      loading.textContent = 'Cargando inventario general...';
      container.appendChild(loading);

      try {
        const params = { page: state.page, limit: 15 };
        if (state.q) params.q = state.q;
        if (state.agent) params.assignedAgent = state.agent;
        if (state.published !== '') params.isPublished = state.published;
        const result = await API.inventory.general(params);
        meta = result.meta;
        loading.remove();
        container.innerHTML = '';
        container.appendChild(renderHeader(meta));
        container.appendChild(renderToolbar());
        container.appendChild(renderTable(result.data));
        if (meta && meta.pages > 1) {
          container.appendChild(UI.pagination(meta, (page) => { state.page = page; load(); }));
        }
      } catch (error) {
        loading.remove();
        container.appendChild(renderHeader(meta));
        container.appendChild(renderToolbar());
        const alertEl = document.createElement('div');
        alertEl.innerHTML = UI.errorAlert(error.message);
        container.appendChild(alertEl.firstChild || alertEl);
      }
    }

    load();
  },
};