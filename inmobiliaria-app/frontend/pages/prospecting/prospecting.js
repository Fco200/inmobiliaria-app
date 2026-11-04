'use strict';

window.Pages = window.Pages || {};

window.Pages.prospecting = {
  title: 'Prospección',

  async render(container) {
    let me = null;
    let users = [];
    try {
      const [m, u] = await Promise.all([
        API.auth.me().catch(() => null),
        API.users.list({ limit: 100 }).catch(() => ({ data: [] })),
      ]);
      me = m;
      users = u.data;
    } catch (error) {
      // sin opciones
    }

    const isGerencia = me && me.role && ['admin', 'direccion', 'gerencia', 'asistencia', 'superadmin'].includes(me.role.code || me.role);
    const userOptions = users.length
      ? UI.sortByLabel(users, (x) => x.name).map((x) => ({ value: x._id, label: x.name }))
      : [{ value: me ? me._id : '', label: me ? me.name : '' }];

    const TYPE_LABELS = {
      lonas: 'Lonas',
      tarjetas: 'Tarjetas',
      volantes: 'Volantes',
      cambaceo: 'Cambaceo',
      publicidad: 'Publicidad',
      gasolina: 'Gasolina',
      imagen: 'Imagen / publicidad',
      otros: 'Otros',
    };

    container.innerHTML = `
      <div class="page-header">
        <h2>Prospección</h2>
        <div style="display:flex;gap:10px;align-items:center;">
          ${isGerencia ? `
            <select class="form-control" id="prosp-user" style="max-width:220px;">
              <option value="">Todos los asesores</option>
              ${userOptions.map((u) => `<option value="${u.value}">${UI.escapeHtml(u.label)}</option>`).join('')}
            </select>` : ''}
          <button class="btn btn-primary" type="button" data-new>+ Nueva actividad</button>
        </div>
      </div>
      <div id="prosp-summary"><div class="loading">Cargando indicadores...</div></div>
      <div id="prosp-list"></div>
    `;

    const summaryEl = container.querySelector('#prosp-summary');
    const listEl = container.querySelector('#prosp-list');
    const userSel = container.querySelector('#prosp-user');

    async function loadSummary() {
      const params = {};
      if (userSel && userSel.value) params.user = userSel.value;
      try {
        const s = await API.prospecting.summary(params);
        const byType = s.byType || [];
        const total = s.total || { investment: 0, prospects: 0, contacts: 0, count: 0 };

        summaryEl.innerHTML = `
          <div class="grid grid-4">
            <div class="card stat-card">
              <div class="stat-label">Inversión total</div>
              <div class="stat-value">${Format.currency(total.investment)}</div>
            </div>
            <div class="card stat-card">
              <div class="stat-label">Prospectos captados</div>
              <div class="stat-value">${total.prospects}</div>
            </div>
            <div class="card stat-card">
              <div class="stat-label">Contactos generados</div>
              <div class="stat-value">${total.contacts}</div>
            </div>
            <div class="card stat-card">
              <div class="stat-label">Actividades registradas</div>
              <div class="stat-value">${total.count}</div>
            </div>
          </div>
          <div class="card mt-2">
            <h3 style="margin-top:0;">Inversión por tipo de actividad</h3>
            ${byType.length
              ? byType.map((b) => `
                  <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
                    <div style="width:170px;font-size:13px;font-weight:600;">${TYPE_LABELS[b._id] || b._id}</div>
                    <div style="flex:1;"><div class="progress"><div class="progress-bar" style="width:${total.investment ? Math.max(2, (b.investment / total.investment) * 100) : 0}%;"></div></div></div>
                    <div style="width:120px;text-align:right;font-size:13px;">${Format.currency(b.investment)}</div>
                    <div style="width:80px;text-align:right;font-size:12px;color:var(--text-muted);">${b.count} act.</div>
                  </div>`).join('')
              : '<p class="text-muted">Aún no hay actividades registradas.</p>'}
          </div>
        `;
      } catch (error) {
        summaryEl.innerHTML = UI.errorAlert(error.message);
      }
    }

    async function loadList() {
      const params = {};
      if (userSel && userSel.value) params.user = userSel.value;
      listEl.innerHTML = '<div class="loading">Cargando actividades...</div>';
      try {
        const result = await API.prospecting.list(params);
        const records = result.data || [];
        if (!records.length) {
          listEl.innerHTML = '<div class="card"><div class="empty-state"><p>No hay actividades de prospección registradas.</p></div></div>';
          return;
        }
        listEl.innerHTML = `
          <div class="table-wrapper card mt-2">
            <table class="table">
              <thead><tr><th>Actividad</th><th>Fecha</th><th>Cantidad</th><th>Lugar / colonia</th><th>Tiempo</th><th>Inversión</th><th>Prospectos</th><th>Asesor</th><th></th></tr></thead>
              <tbody>${records.map((r) => `
                <tr>
                  <td><strong>${UI.badge(TYPE_LABELS[r.type] || r.type, 'info')}</strong></td>
                  <td>${Format.date(r.date)}</td>
                  <td>${r.quantity || '—'}</td>
                  <td>${UI.escapeHtml(r.location || '—')}</td>
                  <td>${r.timeSpent ? `${r.timeSpent} h` : '—'}</td>
                  <td>${Format.currency(r.investment)}</td>
                  <td>${r.prospectsObtained || 0}</td>
                  <td>${UI.escapeHtml(r.user ? r.user.name : '—')}</td>
                  <td>
                    <button class="btn btn-secondary btn-sm" data-edit="${r._id}" style="margin-left:6px;">Editar</button>
                    <button class="btn btn-danger btn-sm" data-remove="${r._id}" style="margin-left:6px;">Eliminar</button>
                  </td>
                </tr>`).join('')}</tbody>
            </table>
          </div>
        `;
        listEl.querySelectorAll('[data-edit]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const record = records.find((r) => r._id === btn.dataset.edit);
            openForm(record);
          });
        });
        listEl.querySelectorAll('[data-remove]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const record = records.find((r) => r._id === btn.dataset.remove);
            const ok = await UI.confirm('¿Eliminar esta actividad?');
            if (!ok) return;
            try {
              await API.prospecting.remove(record._id);
              UI.toast('Actividad eliminada', 'success');
              loadList();
              loadSummary();
            } catch (error) {
              UI.toast(error.message, 'error');
            }
          });
        });
      } catch (error) {
        listEl.innerHTML = UI.errorAlert(error.message);
      }
    }

    const activityTypes = ['lonas', 'tarjetas', 'volantes', 'cambaceo', 'publicidad', 'gasolina', 'imagen', 'otros'];

    function openForm(record) {
      const isEdit = Boolean(record);
      const fields = [
        { name: 'type', label: 'Tipo de actividad', type: 'select', required: true, options: activityTypes, value: record ? record.type : 'lonas' },
        { name: 'date', label: 'Fecha', type: 'datetime-local', required: true, value: record ? Format.toLocalInput(record.date) : '' },
        { name: 'quantity', label: 'Cantidad (piezas/personas)', type: 'number', value: record ? record.quantity : 0 },
        { name: 'location', label: 'Colonia / lugar', type: 'text', value: record ? record.location : '', full: true },
        { name: 'timeSpent', label: 'Tiempo invertido (horas)', type: 'number', value: record ? record.timeSpent : 0 },
        { name: 'contacts', label: 'Contactos generados', type: 'number', value: record ? record.contacts : 0 },
        { name: 'prospectsObtained', label: 'Prospectos obtenidos', type: 'number', value: record ? record.prospectsObtained : 0 },
        { name: 'investment', label: 'Inversión ($)', type: 'number', value: record ? record.investment : 0 },
        { name: 'user', label: 'Asesor', type: 'select', sinOtros: true, value: record ? (record.user ? record.user._id : me._id) : (me ? me._id : ''), options: userOptions },
        { name: 'observations', label: 'Observaciones', type: 'textarea', full: true, value: record ? record.observations : '' },
      ];
      const modal = UI.openModal({
        title: isEdit ? 'Editar actividad' : 'Nueva actividad',
        body: `
          <form id="prosp-form" novalidate>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 16px;">
              ${fields.map((f) => UI.field(f.name, f.label, { ...f, value: f.value })).join('')}
            </div>
          </form>
        `,
        footer: `
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary" type="submit" form="prosp-form">${isEdit ? 'Guardar cambios' : 'Crear'}</button>
        `,
      });
      const bodyEl = modal.bodyEl;
      const overlay = bodyEl ? bodyEl.closest('#modal-overlay') : null;
      if (overlay) {
        const cancelBtn = overlay.querySelector('[data-cancel]');
        if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());
      }
      const form = bodyEl ? bodyEl.querySelector('#prosp-form') : null;
      if (form) form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const values = UI.collectForm(e.target);
        const body = { ...values, date: new Date(values.date).toISOString() };
        try {
          if (isEdit) {
            await API.prospecting.update(record._id, body);
          } else {
            await API.prospecting.create(body);
          }
          UI.toast(isEdit ? 'Cambios guardados' : 'Actividad creada', 'success');
          UI.closeModal();
          loadList();
          loadSummary();
        } catch (error) {
          UI.toast(error.message, 'error');
        }
      });
    }

    if (userSel) {
      userSel.addEventListener('change', () => {
        loadSummary();
        loadList();
      });
    }
    const newBtn = container.querySelector('[data-new]');
    if (newBtn) newBtn.addEventListener('click', () => openForm(null));

    loadSummary();
    loadList();
  },
};
