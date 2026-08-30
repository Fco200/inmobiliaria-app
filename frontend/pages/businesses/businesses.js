'use strict';

window.Pages = window.Pages || {};

window.Pages.businesses = {
  title: 'Negocios',

  async render(container) {
    let buyers = [];
    let sellers = [];
    let properties = [];
    let users = [];
    let clients = [];
    let me = null;
    try {
      const [b, s, p, u, c, m] = await Promise.all([
        API.clients.list({ limit: 100, type: 'comprador' }).catch(() => ({ data: [] })),
        API.clients.list({ limit: 100, type: 'vendedor' }).catch(() => ({ data: [] })),
        API.properties.list({ limit: 100 }).catch(() => ({ data: [] })),
        API.users.list({ limit: 100 }).catch(() => ({ data: [] })),
        API.clients.list({ limit: 100 }).catch(() => ({ data: [] })),
        API.auth.me().catch(() => null),
      ]);
      buyers = b.data;
      sellers = s.data;
      properties = p.data;
      users = u.data;
      clients = c.data;
      me = m;
    } catch (error) {
      // sin opciones
    }

    const BUYER_STAGES = [
      'nuevo', 'prospecto', 'contactado', 'perfilado', 'cita', 'contrato',
      'integracion', 'avaluo', 'revision', 'notarias', 'firma', 'pago',
      'entrega', 'postventa', 'concluido', 'cancelado',
    ];
    const SELLER_STAGES = [
      'nuevo', 'prospecto', 'contactado', 'revision', 'cita', 'captacion',
      'integracion_expedientes', 'promesa', 'avaluo', 'concluido', 'cancelado',
    ];
    const stagesFor = (processType) => (processType === 'vendedor' ? SELLER_STAGES : BUYER_STAGES);
    const stageLabel = (s) => String(s || '').replace(/_/g, ' ');

    const BUYER_COLUMNS = [
      { stage: 'perfilado', label: 'Perfilado', color: '#64748b' },
      { stage: 'cita', label: 'Citas', color: '#0ea5e9' },
      { stage: 'contrato', label: 'Contrato', color: '#8b5cf6' },
      { stage: 'integracion', label: 'Integración', color: '#0d9488' },
      { stage: 'avaluo', label: 'Avalúo', color: '#b45309' },
      { stage: 'revision', label: 'Revisión', color: '#2563eb' },
      { stage: 'notarias', label: 'Notarías', color: '#db2777' },
      { stage: 'firma', label: 'Firma', color: '#ea580c' },
      { stage: 'pago', label: 'Pago', color: '#7c3aed' },
      { stage: 'entrega', label: 'Entrega', color: '#0891b2' },
    ];
    const SELLER_COLUMNS = [
      { stage: 'revision', label: 'Revisión', color: '#2563eb' },
      { stage: 'cita', label: 'Citas', color: '#0ea5e9' },
      { stage: 'captacion', label: 'Captación', color: '#8b5cf6' },
      { stage: 'integracion_expedientes', label: 'Integración expedientes', color: '#0d9488' },
      { stage: 'promesa', label: 'Promesa', color: '#9333ea' },
      { stage: 'avaluo', label: 'Avalúo', color: '#b45309' },
    ];

    const userOptions = users.length
      ? users.map((x) => ({ value: x._id, label: x.name }))
      : [{ value: me ? me._id : '', label: me ? me.name : '' }];
    const clientOptions = clients.map((x) => ({ value: x._id, label: x.name }));
    const propertyOptions = properties.map((x) => ({ value: x._id, label: `${x.type} — ${x.zone} ${x.city}` }));

    const state = { view: 'table', processType: 'comprador' };

    container.innerHTML = `
      <div class="page-header">
        <h2>Negocios</h2>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <div class="process-tabs" role="tablist" aria-label="Vista">
            <button class="process-tab active" type="button" data-view="table">&#128203; Lista</button>
            <button class="process-tab" type="button" data-view="kanban">&#128200; Kanban</button>
          </div>
          <button class="btn btn-primary" type="button" data-new>+ Nuevo negocio</button>
        </div>
      </div>
      <div id="biz-content"></div>
    `;

    const contentEl = container.querySelector('#biz-content');

    container.querySelectorAll('[data-view]').forEach((tab) => {
      tab.addEventListener('click', () => {
        state.view = tab.dataset.view;
        container.querySelectorAll('[data-view]').forEach((t) => t.classList.toggle('active', t === tab));
        renderView();
      });
    });

    container.querySelector('[data-new]').addEventListener('click', () => openNew());

    function renderView() {
      if (state.view === 'kanban') {
        renderKanban();
      } else {
        renderTable();
      }
    }

    // ============ VISTA TABLA (CRUD) ============

    function renderTable() {
      contentEl.innerHTML = '';
      crudPage(contentEl, {
        title: 'Negocios',
        newLabel: 'Nuevo negocio',
        service: {
          list: (params) => API.businesses.list(params),
          create: (body) => API.businesses.create(body),
          update: (id, body) => API.businesses.update(id, body),
          remove: (id) => API.businesses.remove(id),
        },
        statusOptions: [
          { value: 'activo', label: 'Activo' },
          { value: 'concluido', label: 'Concluido' },
          { value: 'cancelado', label: 'Cancelado' },
        ],
        columns: [
          { key: 'name', label: 'Negocio', render: (r) => `<strong>${UI.escapeHtml(r.name)}</strong><br><small class="text-muted">${Format.currency(r.valueOperation)}</small>` },
          { key: 'buyerClient', label: 'Comprador', render: (r) => UI.escapeHtml(r.buyerClient ? r.buyerClient.name : '—') },
          { key: 'sellerClient', label: 'Vendedor', render: (r) => UI.escapeHtml(r.sellerClient ? r.sellerClient.name : '—') },
          { key: 'property', label: 'Propiedad', render: (r) => (r.property ? `${UI.escapeHtml(r.property.zone)} ${UI.escapeHtml(r.property.city)}` : '—') },
          { key: 'currentStage', label: 'Etapa', render: (r) => UI.statusBadge(stageLabel(r.currentStage)) },
          { key: 'status', label: 'Estado', render: (r) => UI.statusBadge(r.status) },
        ],
        fields: [
          { name: 'name', label: 'Nombre del negocio', type: 'text', required: true, full: true },
          { name: 'processType', label: 'Proceso de venta', type: 'select', options: [{ value: 'comprador', label: 'Comprador' }, { value: 'vendedor', label: 'Vendedor' }] },
          { name: 'buyerClient', label: 'Comprador', type: 'select', options: [{ value: '', label: '— Sin comprador —' }, ...buyers.map((x) => ({ value: x._id, label: x.name }))] },
          { name: 'sellerClient', label: 'Vendedor', type: 'select', options: [{ value: '', label: '— Sin vendedor —' }, ...sellers.map((x) => ({ value: x._id, label: x.name }))] },
          { name: 'property', label: 'Propiedad', type: 'select', options: [{ value: '', label: '— Sin propiedad —' }, ...properties.map((x) => ({ value: x._id, label: `${x.type} — ${x.zone} ${x.city}` }))] },
          { name: 'valueOperation', label: 'Valor de la operación', type: 'number' },
          { name: 'partnerAdvisor', label: 'Asesor compartido', type: 'select', options: [{ value: '', label: '— Sin partner —' }, ...users.map((x) => ({ value: x._id, label: x.name }))] },
          { name: 'negotiation_offer', label: 'Propuesta inicial', type: 'number', value: (r) => (r.negotiation || {}).offer || 0 },
          { name: 'negotiation_counterOffer', label: 'Contraoferta', type: 'number', value: (r) => (r.negotiation || {}).counterOffer || 0 },
          { name: 'negotiation_notes', label: 'Notas de negociación', type: 'textarea', full: true, value: (r) => (r.negotiation || {}).notes || '' },
          { name: 'closing_promiseAmount', label: 'Cantidad de promesa', type: 'number', value: (r) => (r.closing || {}).promiseAmount || 0 },
          { name: 'closing_promiseDate', label: 'Fecha de promesa', type: 'datetime-local', value: (r) => Format.toLocalInput((r.closing || {}).promiseDate) },
          { name: 'closing_closingAmount', label: 'Monto de cierre', type: 'number', value: (r) => (r.closing || {}).closingAmount || 0 },
          { name: 'closing_closingDate', label: 'Fecha de cierre', type: 'datetime-local', value: (r) => Format.toLocalInput((r.closing || {}).closingDate) },
          { name: 'closing_commission', label: 'Comisión', type: 'number', value: (r) => (r.closing || {}).commission || 0 },
        ],
        formData(values) {
          const { negotiation_offer, negotiation_counterOffer, negotiation_notes, closing_promiseAmount, closing_promiseDate, closing_closingAmount, closing_closingDate, closing_commission, ...rest } = values;
          return {
            ...rest,
            negotiation: {
              offer: negotiation_offer || 0,
              counterOffer: negotiation_counterOffer || 0,
              notes: negotiation_notes || '',
            },
            closing: {
              promiseAmount: closing_promiseAmount || 0,
              promiseDate: closing_promiseDate ? new Date(closing_promiseDate).toISOString() : null,
              closingAmount: closing_closingAmount || 0,
              closingDate: closing_closingDate ? new Date(closing_closingDate).toISOString() : null,
              commission: closing_commission || 0,
            },
          };
        },
        extraActions(record) {
          const options = stagesFor(record.processType).map((s) => `<option value="${s}" ${s === record.currentStage ? 'selected' : ''}>${UI.escapeHtml(stageLabel(s))}</option>`).join('');
          return `
            <select class="form-control" data-stage style="display:inline-block;width:150px;padding:5px 8px;font-size:12px;margin-left:6px;" title="Cambiar etapa">${options}</select>
            <button class="btn btn-secondary btn-sm" data-extra data-stage-btn style="margin-left:4px;">Cambiar</button>
            <button class="btn btn-secondary btn-sm" data-history style="margin-left:6px;">Etapas</button>
            <button class="btn btn-secondary btn-sm" data-activity data-record="${record._id}" style="margin-left:6px;">Actividad</button>
          `;
        },
        onExtraAction(record, btn, ctx) {
          if (btn.dataset.activity) {
            UI.showActivityHistory('Business', record._id, `Centro de actividad — ${record.name}`);
            return;
          }
          const stageSel = btn.parentElement.querySelector('[data-stage]');
          API.businesses
            .stage(record._id, { stage: stageSel.value })
            .then((res) => {
              ctx.toast(res.message, 'success');
              ctx.reload();
            })
            .catch((error) => ctx.toast(error.message, 'error'));
        },
        onEdit: true,
        onRemove: true,
      });

      contentEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-history]');
        if (!btn) return;
        const recordId = getRecordIdFromRow(btn);
        if (!recordId) return;
        showHistory(recordId);
      });
    }

    function getRecordIdFromRow(btn) {
      const rows = contentEl.querySelectorAll('tbody tr');
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].contains(btn)) {
          const editBtn = rows[i].querySelector('[data-edit]');
          return editBtn ? editBtn.dataset.edit : null;
        }
      }
      return null;
    }

    async function showHistory(id) {
      try {
        const result = await API.businesses.history(id);
        const rows = result.data
          .map((s) => `
            <li style="margin-bottom:10px;border-left:3px solid var(--primary);padding-left:12px;">
              <strong>${UI.escapeHtml(s.name || s.stageCode)}</strong>
              <div class="text-muted" style="font-size:12px;">
                Inicio: ${Format.dateTime(s.startedAt)} · Fin: ${Format.dateTime(s.finishedAt)}
              </div>
              ${s.comments ? `<small>${UI.escapeHtml(s.comments)}</small>` : ''}
            </li>`)
          .join('');
        UI.openModal({
          title: 'Historial del negocio',
          body: rows ? `<ul style="list-style:none;margin:0;padding:0;">${rows}</ul>` : '<p class="text-muted">Sin historial registrado.</p>',
        });
      } catch (error) {
        UI.toast(error.message, 'error');
      }
    }

    // ============ VISTA KANBAN (NEGOCIACIONES) ============

    function columnsFor() {
      const base = state.processType === 'vendedor' ? SELLER_COLUMNS : BUYER_COLUMNS;
      return [
        ...base,
        { stage: 'concluido', label: 'Concluido', color: '#1f9d55' },
        { stage: 'cancelado', label: 'Cancelado', color: '#dc2626' },
      ];
    }

    async function renderKanban() {
      contentEl.innerHTML = `
        <div style="margin-bottom:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <div class="process-tabs" role="tablist" aria-label="Proceso de venta">
            <button class="process-tab ${state.processType === 'comprador' ? 'active' : ''}" type="button" data-process="comprador">Comprador</button>
            <button class="process-tab ${state.processType === 'vendedor' ? 'active' : ''}" type="button" data-process="vendedor">Vendedor</button>
          </div>
        </div>
        <div id="neg-board"><div class="loading">Cargando negociaciones...</div></div>
      `;

      contentEl.querySelectorAll('.process-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          state.processType = tab.dataset.process;
          contentEl.querySelectorAll('.process-tab').forEach((t) => t.classList.toggle('active', t === tab));
          loadBoard();
        });
      });

      loadBoard();
    }

    async function loadBoard() {
      const boardEl = contentEl.querySelector('#neg-board');
      if (!boardEl) return;
      boardEl.innerHTML = '<div class="loading">Cargando negociaciones...</div>';
      try {
        const result = await API.businesses.list({ limit: 200, status: 'activo' });
        const active = result.data || [];
        const doneResult = await API.businesses.list({ limit: 200, status: 'concluido' });
        const cancelledResult = await API.businesses.list({ limit: 200, status: 'cancelado' });
        const all = [...active, ...doneResult.data, ...cancelledResult.data];

        const columns = columnsFor();
        const byStage = {};
        columns.forEach((c) => { byStage[c.stage] = []; });
        const extras = [];
        all.forEach((b) => {
          const stage = b.currentStage;
          if (byStage[stage]) byStage[stage].push(b);
          else extras.push(b);
        });

        boardEl.innerHTML = `
          <div class="funnel-board">
            ${columns.map((col) => {
              const items = byStage[col.stage] || [];
              return `
                <div class="kanban-col">
                  <h4><span>${col.label}</span><span style="color:${col.color};">${items.length}</span></h4>
                  ${items.map((b) => `
                    <div class="kanban-card" data-card="${b._id}">
                      <strong>${UI.escapeHtml(b.name)}</strong>
                      <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">
                        ${Format.currency(b.valueOperation)}<br>
                        ${UI.escapeHtml(b.buyerClient ? b.buyerClient.name : 'Sin comprador')}${b.sellerClient ? ` ← ${UI.escapeHtml(b.sellerClient.name)}` : ''}
                      </div>
                    </div>`).join('') || '<p class="text-muted" style="font-size:12px;">Sin negocios</p>'}
                </div>`;
            }).join('')}
            ${extras.length ? `
              <div class="kanban-col">
                <h4><span>Otras etapas</span><span style="color:#64748b;">${extras.length}</span></h4>
                ${extras.map((b) => `
                  <div class="kanban-card" data-card="${b._id}">
                    <strong>${UI.escapeHtml(b.name)}</strong>
                    <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">
                      ${stageLabel(b.currentStage)}<br>
                      ${Format.currency(b.valueOperation)}
                    </div>
                  </div>`).join('')}
              </div>` : ''}
          </div>
        `;

        boardEl.querySelectorAll('[data-card]').forEach((card) => {
          card.addEventListener('click', () => {
            const business = all.find((b) => b._id === card.dataset.card);
            if (business) openDetail(business);
          });
        });
      } catch (error) {
        boardEl.innerHTML = UI.errorAlert(error.message);
      }
    }

    function openDetail(business) {
      const neg = business.negotiation || {};
      const closing = business.closing || {};
      const fields = [
        { name: 'processType', label: 'Proceso de venta', type: 'select', options: [{ value: 'comprador', label: 'Comprador' }, { value: 'vendedor', label: 'Vendedor' }], value: business.processType || 'comprador' },
        { name: 'stage', label: 'Etapa', type: 'select', options: stagesFor(business.processType || 'comprador'), value: business.currentStage },
        { name: 'valueOperation', label: 'Valor de operación', type: 'number', value: business.valueOperation || 0 },
        { name: 'negotiation_offer', label: 'Propuesta inicial', type: 'number', value: neg.offer || 0 },
        { name: 'negotiation_counterOffer', label: 'Contraoferta', type: 'number', value: neg.counterOffer || 0 },
        { name: 'closing_promiseAmount', label: 'Monto de promesa', type: 'number', value: closing.promiseAmount || 0 },
        { name: 'closing_promiseDate', label: 'Fecha de promesa', type: 'datetime-local', value: Format.toLocalInput(closing.promiseDate) },
        { name: 'closing_closingAmount', label: 'Monto de cierre', type: 'number', value: closing.closingAmount || 0 },
        { name: 'closing_closingDate', label: 'Fecha de cierre', type: 'datetime-local', value: Format.toLocalInput(closing.closingDate) },
        { name: 'closing_commission', label: 'Comisión', type: 'number', value: closing.commission || 0 },
        { name: 'partnerAdvisor', label: 'Compañero / asesor', type: 'select', options: [{ value: '', label: '— Sin compañero —' }, ...userOptions], value: business.partnerAdvisor ? business.partnerAdvisor._id || business.partnerAdvisor : '' },
        { name: 'negotiation_notes', label: 'Notas de negociación', type: 'textarea', full: true, value: neg.notes || '' },
      ];
      const modal = UI.openModal({
        title: `Negociación: ${business.name}`,
        body: `
          <div style="margin-bottom:16px;display:flex;gap:12px;flex-wrap:wrap;font-size:13px;">
            ${UI.badge(business.processType === 'vendedor' ? 'Proceso vendedor' : 'Proceso comprador', 'info')}
            ${UI.badge(stageLabel(business.currentStage), 'info')}
            <span class="text-muted">Comprador: ${UI.escapeHtml(business.buyerClient ? business.buyerClient.name : '—')}</span>
            <span class="text-muted">Vendedor: ${UI.escapeHtml(business.sellerClient ? business.sellerClient.name : '—')}</span>
          </div>
          <form id="neg-form" novalidate>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 16px;">
              ${fields.map((f) => UI.field(f.name, f.label, { ...f, value: f.value })).join('')}
            </div>
          </form>
        `,
        footer: `
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary" type="submit" form="neg-form">Guardar</button>
        `,
        size: 820,
      });
      const bodyEl = modal.bodyEl;
      const overlay = bodyEl ? bodyEl.closest('#modal-overlay') : null;
      if (overlay) {
        const cancelBtn = overlay.querySelector('[data-cancel]');
        if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());
      }
      const form = bodyEl ? bodyEl.querySelector('#neg-form') : null;
      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const v = UI.collectForm(e.target);
          const { negotiation_offer, negotiation_counterOffer, negotiation_notes, closing_promiseAmount, closing_promiseDate, closing_closingAmount, closing_closingDate, closing_commission, stage, processType, ...rest } = v;
          const body = {
            ...rest,
            processType,
            negotiation: {
              offer: negotiation_offer || 0,
              counterOffer: negotiation_counterOffer || 0,
              notes: negotiation_notes || '',
            },
            closing: {
              promiseAmount: closing_promiseAmount || 0,
              promiseDate: closing_promiseDate ? new Date(closing_promiseDate).toISOString() : null,
              closingAmount: closing_closingAmount || 0,
              closingDate: closing_closingDate ? new Date(closing_closingDate).toISOString() : null,
              commission: closing_commission || 0,
            },
          };
          try {
            if ((stage && stage !== business.currentStage) || (processType && processType !== business.processType)) {
              await API.businesses.stage(business._id, { stage });
            }
            await API.businesses.update(business._id, body);
            UI.toast('Cambios guardados', 'success');
            UI.closeModal();
            renderView();
          } catch (error) {
            UI.toast(error.message, 'error');
          }
        });
      }
    }

    function openNew() {
      const fields = [
        { name: 'name', label: 'Nombre del negocio', type: 'text', required: true, full: true },
        { name: 'processType', label: 'Proceso de venta', type: 'select', options: [{ value: 'comprador', label: 'Comprador' }, { value: 'vendedor', label: 'Vendedor' }] },
        { name: 'buyerClient', label: 'Comprador', type: 'select', options: [{ value: '', label: '— Sin comprador —' }, ...clientOptions] },
        { name: 'sellerClient', label: 'Vendedor', type: 'select', options: [{ value: '', label: '— Sin vendedor —' }, ...clientOptions] },
        { name: 'property', label: 'Propiedad', type: 'select', options: [{ value: '', label: '— Sin propiedad —' }, ...propertyOptions] },
        { name: 'valueOperation', label: 'Valor de operación', type: 'number' },
        { name: 'negotiation_offer', label: 'Propuesta inicial', type: 'number' },
        { name: 'negotiation_counterOffer', label: 'Contraoferta', type: 'number' },
        { name: 'partnerAdvisor', label: 'Compañero / asesor', type: 'select', options: [{ value: '', label: '— Sin compañero —' }, ...userOptions] },
        { name: 'negotiation_notes', label: 'Notas', type: 'textarea', full: true },
      ];
      const modal = UI.openModal({
        title: 'Nuevo negocio',
        body: `
          <form id="new-neg-form" novalidate>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 16px;">
              ${fields.map((f) => UI.field(f.name, f.label, { ...f, value: f.value || '' })).join('')}
            </div>
          </form>
        `,
        footer: `
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary" type="submit" form="new-neg-form">Crear</button>
        `,
        size: 820,
      });
      const bodyEl = modal.bodyEl;
      const overlay = bodyEl ? bodyEl.closest('#modal-overlay') : null;
      if (overlay) {
        const cancelBtn = overlay.querySelector('[data-cancel]');
        if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());
      }
      const form = bodyEl ? bodyEl.querySelector('#new-neg-form') : null;
      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const v = UI.collectForm(e.target);
          const { negotiation_offer, negotiation_counterOffer, negotiation_notes, ...rest } = v;
          try {
            await API.businesses.create({
              ...rest,
              negotiation: {
                offer: negotiation_offer || 0,
                counterOffer: negotiation_counterOffer || 0,
                notes: negotiation_notes || '',
              },
            });
            UI.toast('Negocio creado', 'success');
            UI.closeModal();
            renderView();
          } catch (error) {
            UI.toast(error.message, 'error');
          }
        });
      }
    }

    renderView();
  },
};
