'use strict';

window.Pages = window.Pages || {};

window.Pages.negotiations = {
  title: 'Negociaciones',

  async render(container) {
    const stageLabel = (s) => String(s || '').replace(/_/g, ' ');

    const BUYER_COLUMNS = [
      { stage: 'seguimiento', label: 'Seguimiento', color: '#64748b' },
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

    const BUYER_STAGES = [
      'nuevo', 'prospecto', 'contactado', 'seguimiento', 'cita', 'contrato',
      'integracion', 'avaluo', 'revision', 'notarias', 'firma', 'pago',
      'entrega', 'postventa', 'concluido', 'cancelado',
    ];
    const SELLER_STAGES = [
      'nuevo', 'prospecto', 'contactado', 'seguimiento', 'revision', 'cita',
      'captacion', 'integracion_expedientes', 'promesa', 'avaluo', 'concluido', 'cancelado',
    ];
    const stagesFor = (processType) => (processType === 'vendedor' ? SELLER_STAGES : BUYER_STAGES);

    const state = { processType: 'comprador' };

    let me = null;
    let users = [];
    let clients = [];
    let properties = [];
    try {
      const [m, u, c, p] = await Promise.all([
        API.auth.me().catch(() => null),
        API.users.list({ limit: 100 }).catch(() => ({ data: [] })),
        API.clients.list({ limit: 100 }).catch(() => ({ data: [] })),
        API.properties.list({ limit: 100 }).catch(() => ({ data: [] })),
      ]);
      me = m;
      users = u.data;
      clients = c.data;
      properties = p.data;
    } catch (error) {
      // sin opciones
    }

    const userOptions = users.length
      ? users.map((x) => ({ value: x._id, label: x.name }))
      : [{ value: me ? me._id : '', label: me ? me.name : '' }];
    const clientOptions = clients.map((x) => ({ value: x._id, label: x.name }));
    const propertyOptions = properties.map((x) => ({ value: x._id, label: `${x.type} — ${x.zone} ${x.city}` }));

    container.innerHTML = `
      <div class="page-header">
        <h2>Negociaciones</h2>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <div class="process-tabs" role="tablist" aria-label="Proceso de venta">
            <button class="process-tab active" type="button" data-process="comprador">Comprador</button>
            <button class="process-tab" type="button" data-process="vendedor">Vendedor</button>
          </div>
          <button class="btn btn-primary" type="button" data-new>+ Nueva negociación</button>
        </div>
      </div>
      <div id="neg-board"><div class="loading">Cargando negociaciones...</div></div>
    `;

    const boardEl = container.querySelector('#neg-board');

    const tabs = container.querySelectorAll('.process-tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        state.processType = tab.dataset.process;
        tabs.forEach((t) => t.classList.toggle('active', t === tab));
        loadBoard();
      });
    });

    function columnsFor() {
      const base = state.processType === 'vendedor' ? SELLER_COLUMNS : BUYER_COLUMNS;
      return [
        ...base,
        { stage: 'concluido', label: 'Concluido', color: '#1f9d55' },
        { stage: 'cancelado', label: 'Cancelado', color: '#dc2626' },
      ];
    }

    async function loadBoard() {
      boardEl.innerHTML = '<div class="loading">Cargando negociaciones...</div>';
      try {
        const [result, doneResult, cancelledResult] = await Promise.all([
          API.businesses.list({ limit: 200, status: 'activo' }),
          API.businesses.list({ limit: 200, status: 'concluido' }),
          API.businesses.list({ limit: 200, status: 'cancelado' }),
        ]);
        const active = result.data || [];
        const all = [...active, ...(doneResult.data || []), ...(cancelledResult.data || [])];

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
      bodyEl.closest('#modal-overlay').querySelector('[data-cancel]').addEventListener('click', () => UI.closeModal());
      bodyEl.querySelector('#neg-form').addEventListener('submit', async (e) => {
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
          loadBoard();
        } catch (error) {
          UI.toast(error.message, 'error');
        }
      });
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
        title: 'Nueva negociación',
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
      bodyEl.closest('#modal-overlay').querySelector('[data-cancel]').addEventListener('click', () => UI.closeModal());
      bodyEl.querySelector('#new-neg-form').addEventListener('submit', async (e) => {
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
          UI.toast('Negociación creada', 'success');
          UI.closeModal();
          loadBoard();
        } catch (error) {
          UI.toast(error.message, 'error');
        }
      });
    }

    container.querySelector('[data-new]').addEventListener('click', () => openNew());
    loadBoard();
  },
};
