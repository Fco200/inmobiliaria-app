'use strict';

window.Pages = window.Pages || {};

window.Pages.inventory = {
  title: 'Inventario',

  async render(container) {
    const state = { page: 1, filter: '' };

    const stored = window.ApiClient.getStoredUser();
    const role = stored && stored.role ? (stored.role.code || stored.role) : '';
    const isBoss = role === 'admin' || role === 'gerencia';

    let me = null;
    let users = [];
    let clients = [];
    try {
      me = await API.auth.me().catch(() => null);
    } catch (error) { me = null; }
    try {
      const u = await API.users.list({ limit: 100 }).catch(() => ({ data: [] }));
      users = u.data;
    } catch (error) { users = []; }
    try {
      const c = await API.clients.list({ limit: 100 }).catch(() => ({ data: [] }));
      clients = c.data;
    } catch (error) { clients = []; }

    const myId = (me && me._id) || (stored && stored._id) || '';

    const propertyLabel = (prop) => {
      if (!prop) return '—';
      return `${prop.zone || ''} ${prop.city || ''}`.trim() || prop.address || 'Propiedad';
    };

    // ---- Detalle de la propiedad (con mercado e historial) ----

    function openDetailModal(item) {
      const prop = item.property;
      const isMine = isBoss || String(item.assignedAgent ? item.assignedAgent._id || item.assignedAgent : '') === String(myId);

      const modal = UI.openModal({
        title: `Inventario — ${propertyLabel(prop)}`,
        body: '<div class="loading">Cargando...</div>',
        size: 860,
        footer: `
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:space-between;">
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn btn-primary" type="button" data-appointment>Agendar cita</button>
              <button class="btn btn-secondary" type="button" data-business>Crear negocio</button>
              ${isMine ? '<button class="btn btn-secondary" type="button" data-obs>Observaciones</button>' : ''}
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
        const photo = (prop.photos || []).find(Boolean);
        const characteristics = (prop.characteristics || [])
          .map((c) => `<li><strong>${UI.escapeHtml(c.name)}:</strong> ${UI.escapeHtml(c.value)}</li>`)
          .join('');

        modal.bodyEl.innerHTML = `
          <div class="grid grid-2" style="align-items:start;">
            <div>
              ${photo ? `<img src="${window.AppConfig.resolveUrl(photo)}" alt="" style="width:100%;height:180px;object-fit:cover;border-radius:10px;margin-bottom:10px;">` : ''}
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
          await API.appointments.create({
            user: myId,
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
            <input class="form-control" data-name value="Venta ${prop.type || ''} ${prop.zone || ''} ${prop.city || ''}".trim()>
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

    // ---- Asignar asesor (solo jefes) ----

    function openAssignModal(item) {
      const options = users.map((u) => `<option value="${u._id}" ${String(item.assignedAgent && item.assignedAgent._id) === String(u._id) ? 'selected' : ''}>${UI.escapeHtml(u.name)}</option>`).join('');
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

    // ---- Header ----

    function renderHeader() {
      const el = document.createElement('div');
      el.className = 'page-header';
      el.innerHTML = `
        <div>
          <h2>${isBoss ? 'Inventario' : 'Mi inventario'}</h2>
          <p class="text-muted" style="margin:4px 0 0;">
            ${isBoss
              ? 'Administra qué propiedades se publican y a qué asesor se asignan para trabajar.'
              : 'Propiedades publicadas y asignadas a ti. Ábrelas para ver el detalle, agendar citas o crear negocios.'}
          </p>
        </div>
        ${isBoss ? '<button class="btn btn-primary" type="button" data-add>Agregar propiedad</button>' : ''}
      `;
      const add = el.querySelector('[data-add]');
      if (add) add.addEventListener('click', openAddModal);
      return el;
    }

    function renderToolbar() {
      const el = document.createElement('div');
      el.style.cssText = 'display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;';
      if (isBoss) {
        el.innerHTML = `
          <select class="form-control" data-filter style="max-width:240px;">
            <option value="">Todas</option>
            <option value="true">Solo publicadas</option>
            <option value="false">Solo sin publicar</option>
          </select>
        `;
      } else {
        el.innerHTML = `
          <div class="process-tabs" role="tablist" aria-label="Vista de inventario">
            <button class="process-tab active" type="button" data-view="all">Inventario General</button>
            <button class="process-tab" type="button" data-view="mine">Mis propiedades</button>
          </div>
        `;
        el.querySelectorAll('.process-tab').forEach((tab) => {
          tab.addEventListener('click', () => {
            el.querySelectorAll('.process-tab').forEach((t) => t.classList.remove('active'));
            tab.classList.add('active');
            state.filter = tab.dataset.view === 'mine' ? 'mia' : '';
            state.page = 1;
            load();
          });
        });
      }
      const filterSel = el.querySelector('[data-filter]');
      if (filterSel) {
        filterSel.addEventListener('change', (e) => {
          state.filter = e.target.value;
          state.page = 1;
          load();
        });
      }
      return el;
    }

    // ---- Tabla ----

    function renderTable(items) {
      const wrap = document.createElement('div');
      wrap.className = 'table-wrapper card';
      if (!items.length) {
        wrap.innerHTML = isBoss
          ? '<div class="empty-state"><p>El inventario está vacío.</p><p class="text-muted">Agrega una propiedad para publicarla y asignarla a un asesor.</p></div>'
          : '<div class="empty-state"><p>No hay propiedades en tu inventario todavía.</p><p class="text-muted">Cuando administración publique o te asigne propiedades, aparecerán aquí.</p></div>';
        return wrap;
      }

      const rows = items.map((item, index) => {
        const prop = item.property;
        return `
          <tr>
            <td>${UI.escapeHtml(propertyLabel(prop))}</td>
            <td>${prop ? UI.badge(String(prop.type || '').replace(/_/g, ' '), 'info') : '—'}</td>
            <td>${prop ? Format.currency(prop.price) : '—'}</td>
            <td>${prop && prop.ticketValue ? Format.currency(prop.ticketValue) : '—'}</td>
            <td>${item.isPublished ? UI.badge('Publicado', 'success') : UI.badge('Sin publicar', 'muted')}</td>
            <td>${UI.escapeHtml(item.assignedAgent ? item.assignedAgent.name : '—')}</td>
            <td>
              <button class="btn btn-secondary btn-sm" data-action data-index="${index}" data-kind="view">Ver</button>
              ${item.observations ? `<button class="btn btn-secondary btn-sm" data-action data-index="${index}" data-kind="obs" style="margin-left:6px;" title="Ver/editar notas">Notas</button>` : ''}
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
            <th>Ubicación</th><th>Tipo</th><th>Precio</th><th>Valor ticket</th><th>Estado</th><th>Asesor</th><th>Acciones</th>
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
          else if (kind === 'obs') openObservationsModal(item);
          else if (kind === 'appointment') openAppointmentModal(item);
          else if (kind === 'business') openBusinessModal(item);
          else if (kind === 'assign') openAssignModal(item);
          else if (kind === 'publish') {
            API.inventory.publish(item._id, { isPublished: !item.isPublished })
              .then(() => { UI.toast('Inventario actualizado', 'success'); load(); })
              .catch((error) => UI.toast(error.message, 'error'));
          } else if (kind === 'remove') {
            UI.confirm('¿Quitar esta propiedad del inventario?').then((ok) => {
              if (!ok) return;
              API.inventory.remove(item._id)
                .then(() => { UI.toast('Eliminado del inventario', 'success'); load(); })
                .catch((error) => UI.toast(error.message, 'error'));
            });
          }
        });
      });

      return wrap;
    }

    function openAddModal() {
      const footer = `
        <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
        <button class="btn btn-primary" type="button" data-ok>Agregar</button>
      `;
      const modal = UI.openModal({
        title: 'Agregar propiedad al inventario',
        body: `
          <div class="form-group">
            <label>Propiedad</label>
            <select class="form-control" id="inv-prop">
              <option value="">Cargando propiedades...</option>
            </select>
          </div>
          <div class="form-group">
            <label>Asesor asignado</label>
            <select class="form-control" id="inv-agent">
              <option value="">— Sin asesor —</option>
              ${users.map((u) => `<option value="${u._id}">${UI.escapeHtml(u.name)}</option>`).join('')}
            </select>
          </div>
        `,
        footer,
      });

      const overlay = modal.bodyEl ? modal.bodyEl.closest('#modal-overlay') : null;
      const propSel = modal.bodyEl ? modal.bodyEl.querySelector('#inv-prop') : null;
      if (!overlay || !propSel) return;
      API.properties.list({ limit: 100, status: 'disponible' })
        .then((res) => {
          propSel.innerHTML = '<option value="">Selecciona una propiedad</option>' + res.data
            .map((p) => `<option value="${p._id}">${UI.escapeHtml(p.type)} — ${UI.escapeHtml(propertyLabel(p))} — ${Format.currency(p.price)}</option>`)
            .join('');
        })
        .catch(() => {
          propSel.innerHTML = '<option value="">Sin propiedades disponibles</option>';
        });

      const cancelBtn = overlay.querySelector('[data-cancel]');
      if (cancelBtn) cancelBtn.addEventListener('click', UI.closeModal);
      const okBtn = overlay.querySelector('[data-ok]');
      if (okBtn) okBtn.addEventListener('click', async () => {
        const propertyId = propSel.value;
        const agentSel = modal.bodyEl ? modal.bodyEl.querySelector('#inv-agent') : null;
        const assignedAgent = agentSel ? agentSel.value || null : null;
        if (!propertyId) return UI.toast('Selecciona una propiedad', 'warning');
        try {
          await API.inventory.create({ propertyId, assignedAgent });
          UI.toast('Propiedad agregada al inventario', 'success');
          UI.closeModal();
          load();
        } catch (error) {
          UI.toast(error.message, 'error');
        }
      });
    }

    function renderIntegrationCard() {
      if (!isBoss) return null;
      const el = document.createElement('div');
      el.className = 'card mt-2';
      el.innerHTML = `
        <h3 style="margin-top:0;">Cómo funciona el inventario</h3>
        <p class="text-muted" style="margin:0 0 10px;">
          Solo administración y gerencia agregan, asignan y publican propiedades. Los asesores trabajan sobre lo publicado
          y lo que les asignes: ven el detalle, editan notas, agendan citas y crean negocios desde cada propiedad.
        </p>
        <p class="text-muted" style="margin:0 0 10px;">
          La página pública del catálogo consume esta API sin necesidad de credenciales (solo propiedades publicadas):
        </p>
        <code style="background:#f3f4f6;padding:8px 12px;border-radius:6px;display:inline-block;margin-bottom:10px;">
          GET ${window.AppConfig.API_URL}/inventory/public
        </code>
        <p class="text-muted" style="margin:8px 0 0;">
          Filtros opcionales: type, operationType, city, zone, minPrice y maxPrice.
        </p>
      `;
      return el;
    }

    async function load() {
      container.innerHTML = '';
      container.appendChild(renderHeader());
      container.appendChild(renderToolbar());

      const loading = document.createElement('div');
      loading.className = 'loading';
      loading.textContent = 'Cargando...';
      container.appendChild(loading);

      try {
        const params = { page: state.page, limit: 15 };
        if (isBoss && state.filter !== '') params.isPublished = state.filter;
        if (!isBoss && state.filter === 'mia') params.mine = 'true';
        const result = await API.inventory.list(params);
        loading.remove();
        container.appendChild(renderTable(result.data));
        if (result.meta && result.meta.pages > 1) {
          container.appendChild(UI.pagination(result.meta, (page) => { state.page = page; load(); }));
        }
      } catch (error) {
        loading.remove();
        const alertEl = document.createElement('div');
        alertEl.innerHTML = UI.errorAlert(error.message);
        container.appendChild(alertEl.firstChild || alertEl);
      }

      const integration = renderIntegrationCard();
      if (integration) container.appendChild(integration);
    }

    load();
  },
};
