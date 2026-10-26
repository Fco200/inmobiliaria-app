'use strict';

window.Pages = window.Pages || {};

window.Pages.businesses = {
  title: 'Negocios',

  async render(container) {
    // Etapas de respaldo (idénticas al backend) por si el endpoint no responde.
    const FALLBACK_BUYER = [
      'nuevo', 'prospecto', 'contactado', 'seguimiento', 'cita', 'negociacion',
      'contrato', 'integracion', 'avaluo', 'revision', 'notarias', 'firma',
      'pago', 'entrega', 'postventa', 'concluido',
    ];
    const FALLBACK_SELLER = [
      'nuevo', 'prospecto', 'contactado', 'seguimiento', 'revision', 'cita',
      'captacion', 'integracion_expedientes', 'negociacion', 'promesa',
      'avaluo', 'concluido',
    ];

    // Las etapas reales las expone el backend (GET /businesses/stages); así el
    // embudo, el select de cambio de etapa y las etiquetas nunca se desincronizan.
    let stageMeta = {
      byProcess: { comprador: FALLBACK_BUYER.slice(), vendedor: FALLBACK_SELLER.slice() },
      labels: {},
    };
    try {
      const stagesRes = await API.businesses.stages();
      const data = (stagesRes && stagesRes.data) || stagesRes || {};
      if (data.byProcess && data.byProcess.comprador) {
        stageMeta = {
          byProcess: {
            comprador: data.byProcess.comprador,
            vendedor: (data.byProcess.vendedor || FALLBACK_SELLER.slice()),
          },
          labels: data.labels || {},
        };
      }
    } catch (error) {
      // respaldo: las listas por defecto arriba
    }

    let properties = [];
    let users = [];
    let clients = [];
    let me = null;
    let negociosActivos = [];
    try {
      // Los negocios activos se piden de entrada porque un cliente no puede tener
      // dos a la vez: sirven para marcar en el formulario quién ya está
      // ocupado y no llevar al error del backend.
      const [inv, u, c, m, activos] = await Promise.all([
        // Propiedades: se toma el INVENTARIO GENERAL del equipo (propiedades
        // compartidas por cualquier asesor + externas de otras inmobiliarias),
        // no solo "mis propiedades". Así al crear un negocio aparecen TODAS
        // las propiedades que están en el inventario.
        API.inventory.general({ limit: 100 }).catch(() => ({ data: [] })),
        API.users.list({ limit: 100 }).catch(() => ({ data: [] })),
        API.clients.list({ limit: 100 }).catch(() => ({ data: [] })),
        API.auth.me().catch(() => null),
        fetchAllBusinesses({ status: 'activo' }).catch(() => []),
      ]);
      // El inventario devuelve items { property, assignedAgent }: se normaliza
      // a la forma de Property que espera el formulario, con respaldo a la
      // lista propia si el inventario general viniera vacío.
      properties = (inv.data || [])
        .map((item) => (item && item.property ? item.property : null))
        .filter(Boolean);
      if (!properties.length) {
        const mine = await API.properties.list({ limit: 100 }).catch(() => ({ data: [] }));
        properties = mine.data || [];
      }
      users = u.data;
      clients = c.data;
      me = m;
      negociosActivos = activos;
    } catch (error) {
      // sin opciones
    }

    // Un mismo catálogo de clientes se parte por tipo (comprador/vendedor):
    // el cliente sí distingue "Comprar"/"Vender" (campo servicio / type).
    const isBuyerClient = (x) => x && ((x.type === 'comprador') || /Comprar/i.test(x.servicio || ''));
    const isSellerClient = (x) => x && ((x.type === 'vendedor') || /Vender/i.test(x.servicio || ''));
    const buyers = clients.filter(isBuyerClient);
    const sellers = clients.filter(isSellerClient);

    // Un cliente solo puede pertenecer a un negocio activo por rol (el backend
    // lo rechaza con 409 y el índice único del modelo lo blinda). Aquí se marca
    // en el desplegable para que el asesor lo vea antes de elegirlo.
    const refId = (valor) => String((valor && (valor._id || valor)) || '');
    const yaTieneNegocio = (cliente, campo) => negociosActivos.some((b) => refId(b[campo]) === refId(cliente));
    const opcionesCliente = (lista, campo) => lista.map((x) => ({
      value: x._id,
      label: `${x.name}${yaTieneNegocio(x, campo) ? ' — ya tiene un negocio activo' : ''}`,
    }));

    const stagesFor = (processType) => stageMeta.byProcess[processType] || stageMeta.byProcess.comprador;
    const stageLabel = (code) => stageMeta.labels[code] || String(code || '').replace(/_/g, ' ');

    const allStageOptions = Array.from(
      new Set([...stageMeta.byProcess.comprador, ...stageMeta.byProcess.vendedor])
    ).map((s) => ({ value: s, label: stageLabel(s) }));

    const STAGE_COLORS = {
      nuevo: '#64748b',
      prospecto: '#64748b',
      contactado: '#64748b',
      seguimiento: '#0ea5e9',
      cita: '#0ea5e9',
      negociacion: '#f59e0b',
      contrato: '#8b5cf6',
      integracion: '#0d9488',
      avaluo: '#b45309',
      revision: '#2563eb',
      notarias: '#db2777',
      firma: '#ea580c',
      pago: '#7c3aed',
      entrega: '#0891b2',
      postventa: '#14b8a6',
      captacion: '#8b5cf6',
      integracion_expedientes: '#0d9488',
      promesa: '#9333ea',
      concluido: '#1f9d55',
      cancelado: '#dc2626',
    };
    const colorFor = (stage) => STAGE_COLORS[stage] || '#64748b';

    const userOptions = users.length
      ? users.map((x) => ({ value: x._id, label: x.name }))
      : [{ value: me ? me._id : '', label: me ? me.name : '' }];
    const propertyOptions = properties.map((x) => ({ value: x._id, label: UI.propertyOptionLabel(x) }));

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

    // Delegación persistente para "Etapas" (historial) del listado: se registra
    // una sola vez, aunque la vista tabla se reconstruya varias veces.
    contentEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-history]');
      if (!btn) return;
      const recordId = getRecordIdFromRow(btn);
      if (recordId) showHistory(recordId);
    });

    container.querySelectorAll('[data-view]').forEach((tab) => {
      tab.addEventListener('click', () => {
        state.view = tab.dataset.view;
        container.querySelectorAll('[data-view]').forEach((t) => t.classList.toggle('active', t === tab));
        renderView();
      });
    });

    container.querySelector('[data-new]').addEventListener('click', () => openNew());

    function columnsFor(processType) {
      const columns = stagesFor(processType)
        .filter((s) => s !== 'concluido' && s !== 'cancelado')
        .map((s) => ({ stage: s, label: stageLabel(s), color: colorFor(s) }));
      columns.push({ stage: 'concluido', label: stageLabel('concluido'), color: '#1f9d55' });
      columns.push({ stage: 'cancelado', label: stageLabel('cancelado'), color: '#dc2626' });
      return columns;
    }

    function renderView() {
      if (state.view === 'kanban') {
        renderKanban();
      } else {
        renderTable();
      }
    }

    // ============ INDICADORES ============

    async function renderSummary(summaryEl) {
      if (!summaryEl) return;
      try {
        const [totalR, activeR, doneR, cancelledR, negR] = await Promise.all([
          API.businesses.list({ limit: 1 }),
          API.businesses.list({ limit: 1, status: 'activo' }),
          API.businesses.list({ limit: 1, status: 'concluido' }),
          API.businesses.list({ limit: 1, status: 'cancelado' }),
          API.businesses.list({ limit: 1, currentStage: 'negociacion' }),
        ]);
        const total = (totalR.meta && totalR.meta.total) || 0;
        const activos = (activeR.meta && activeR.meta.total) || 0;
        const concluidos = (doneR.meta && doneR.meta.total) || 0;
        const cancelados = (cancelledR.meta && cancelledR.meta.total) || 0;
        const enNeg = (negR.meta && negR.meta.total) || 0;
        const kpi = (title, value, tone, icon) => `
          <div class="kpi-card tone-${tone}">
            <div class="kpi-icon">${icon}</div>
            <div class="kpi-body">
              <small>${title}</small>
              <strong>${value}</strong>
            </div>
          </div>`;
        summaryEl.innerHTML = `<div class="kpi-grid" style="margin-bottom:16px;">${[
          kpi('Total de negocios', total, 'blue', '&#128179;'),
          kpi('Activos', activos, 'green', '&#10004;'),
          kpi('En negociación', enNeg, 'amber', '&#129309;'),
          kpi('Concluidos', concluidos, 'teal', '&#127919;'),
          kpi('Cancelados', cancelados, 'red', '&#10060;'),
        ].join('')}</div>`;
      } catch (error) {
        // los indicadores son informativos; la vista principal no debe romperse
      }
    }

    // ============ VISTA TABLA (CRUD) ============

    function renderTable() {
      contentEl.innerHTML = '<div id="biz-summary"></div><div id="biz-list"></div>';
      const summaryEl = contentEl.querySelector('#biz-summary');
      const listEl = contentEl.querySelector('#biz-list');
      crudPage(listEl, {
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
        filters: [
          { key: 'buyerClient', label: 'Comprador', searchSource: UI.remoteSources.client, placeholder: 'Todos los compradores' },
          {
            key: 'processType',
            label: 'Proceso',
            placeholder: 'Todos los procesos',
            options: [
              { value: 'comprador', label: 'Comprador' },
              { value: 'vendedor', label: 'Vendedor' },
            ],
          },
          { key: 'currentStage', label: 'Etapa', placeholder: 'Todas las etapas', options: allStageOptions },
        ],
        columns: [
          { key: 'name', label: 'Negocio', render: (r) => `<strong>${UI.escapeHtml(r.name)}</strong><br><small class="text-muted">${Format.currency(r.valueOperation)}</small>` },
          { key: 'buyerClient', label: 'Comprador', render: (r) => UI.escapeHtml(r.buyerClient ? r.buyerClient.name : (r.buyerExternalName || '—')) },
          { key: 'sellerClient', label: 'Vendedor', render: (r) => UI.escapeHtml(r.sellerClient ? r.sellerClient.name : (r.sellerExternalName || '—')) },
          { key: 'property', label: 'Propiedad', render: (r) => (r.property ? UI.escapeHtml(UI.propertyOptionLabel(r.property)) : '—') },
          { key: 'currentStage', label: 'Etapa', render: (r) => UI.statusBadge(stageLabel(r.currentStage)) },
          { key: 'status', label: 'Estado', render: (r) => UI.statusBadge(r.status) },
        ],
        fields: [
          { name: 'name', label: 'Nombre del negocio', type: 'text', required: true, full: true },
          { name: 'processType', label: 'Proceso de venta', type: 'select', options: [{ value: 'comprador', label: 'Comprador' }, { value: 'vendedor', label: 'Vendedor' }] },
          { name: 'buyerClient', label: 'Comprador', type: 'select', sinOtros: true, value: (r) => (r.buyerClient ? (r.buyerClient._id || r.buyerClient) : (r.buyerExternalName ? '__externo__' : '')), options: [{ value: '', label: '— Sin comprador —' }, ...opcionesCliente(buyers, 'buyerClient'), { value: '__externo__', label: 'Otro / Externo — escribir nombre' }] },
          { name: 'buyerExternalName', label: 'Nombre del comprador externo', type: 'text', value: (r) => r.buyerExternalName || '', placeholder: 'Ej. Juan Pérez (no está en la cartera)', hint: 'Solo si elegiste "Otro / Externo".' },
          { name: 'sellerClient', label: 'Vendedor', type: 'select', sinOtros: true, value: (r) => (r.sellerClient ? (r.sellerClient._id || r.sellerClient) : (r.sellerExternalName ? '__externo__' : '')), options: [{ value: '', label: '— Sin vendedor —' }, ...opcionesCliente(sellers, 'sellerClient'), { value: '__externo__', label: 'Otro / Externo — escribir nombre' }] },
          { name: 'sellerExternalName', label: 'Nombre del vendedor externo', type: 'text', value: (r) => r.sellerExternalName || '', placeholder: 'Ej. María López (no está en la cartera)', hint: 'Solo si elegiste "Otro / Externo".' },
          { name: 'property', label: 'Propiedad', type: 'select', sinOtros: true, search: true, searchSource: UI.remoteSources.property, options: [{ value: '', label: '— Sin propiedad —' }, ...propertyOptions] },
          { name: 'valueOperation', label: 'Valor de la operación', type: 'number' },
          { name: 'partnerAdvisor', label: 'Asesor compartido', type: 'select', sinOtros: true, value: (r) => (r.partnerAdvisor ? (r.partnerAdvisor._id || r.partnerAdvisor) : (r.partnerAdvisorName ? '__externo__' : '')), options: [{ value: '', label: '— Sin partner —' }, ...users.map((x) => ({ value: x._id, label: x.name })), { value: '__externo__', label: 'Otro / Externo — escribir nombre' }] },
          { name: 'partnerAdvisorName', label: 'Nombre del asesor externo', type: 'text', value: (r) => r.partnerAdvisorName || '', placeholder: 'Ej. Lic. Ramírez de Inmobiliaria Centro', hint: 'Solo si elegiste "Otro / Externo".' },
          { name: 'negotiation_offer', label: 'Propuesta inicial', type: 'number', value: (r) => (r.negotiation || {}).offer || 0 },
          { name: 'negotiation_notes', label: 'Notas de negociación', type: 'textarea', full: true, value: (r) => (r.negotiation || {}).notes || '' },
          { name: 'closing_promiseDate', label: 'Fecha de promesa', type: 'datetime-local', value: (r) => Format.toLocalInput((r.closing || {}).promiseDate) },
          { name: 'closing_closingDate', label: 'Fecha de cierre', type: 'datetime-local', value: (r) => Format.toLocalInput((r.closing || {}).closingDate) },
          { name: 'closing_commission', label: 'Comisión', type: 'number', value: (r) => (r.closing || {}).commission || 0 },
        ],
        // Montos: solo los esenciales (valor de la operación, propuesta
        // inicial y comisión). Contraoferta, monto de promesa y monto de
        // cierre se quitaron del formulario por ser redundantes entre
        // etapas; los que ya estaban guardados se conservan tal cual.
        formData(values, record) {
          const { negotiation_offer, negotiation_notes, closing_promiseDate, closing_closingDate, closing_commission, buyerExternalName, sellerExternalName, partnerAdvisorName, ...rest } = values;

          // "Otro / Externo": el ObjectId queda vacío y el nombre viaja en el
          // campo de texto libre correspondiente.
          const externo = (valor, nombre) => {
            if (valor === '__externo__') return { id: null, nombre: String(nombre || '').trim() };
            return { id: valor || null, nombre: '' };
          };
          const buyer = externo(rest.buyerClient, buyerExternalName);
          const seller = externo(rest.sellerClient, sellerExternalName);
          const partner = externo(rest.partnerAdvisor, partnerAdvisorName);
          if (rest.buyerClient === '__externo__' && !buyer.nombre) throw new Error('Escribe el nombre del comprador externo.');
          if (rest.sellerClient === '__externo__' && !seller.nombre) throw new Error('Escribe el nombre del vendedor externo.');
          if (rest.partnerAdvisor === '__externo__' && !partner.nombre) throw new Error('Escribe el nombre del asesor externo.');
          rest.buyerClient = buyer.id;
          rest.buyerExternalName = buyer.nombre;
          rest.sellerClient = seller.id;
          rest.sellerExternalName = seller.nombre;
          rest.partnerAdvisor = partner.id;
          rest.partnerAdvisorName = partner.nombre;

          const negPrevio = (record && record.negotiation) || {};
          const closePrevio = (record && record.closing) || {};

          return {
            ...rest,
            negotiation: {
              offer: negotiation_offer || 0,
              counterOffer: negPrevio.counterOffer || 0,
              notes: negotiation_notes || '',
            },
            closing: {
              promiseAmount: closePrevio.promiseAmount || 0,
              promiseDate: closing_promiseDate ? new Date(closing_promiseDate).toISOString() : null,
              closingAmount: closePrevio.closingAmount || 0,
              closingDate: closing_closingDate ? new Date(closing_closingDate).toISOString() : null,
              commission: closing_commission || 0,
            },
          };
        },
        onFormMount(form) {
          // Comprador/vendedor/asesor "Otro / Externo": muestra el campo de
          // nombre libre solo cuando la opción externa está elegida.
          const sync = (selName, wrapName) => {
            const sel = form.querySelector(`#fld-${selName}`);
            const wrap = form.querySelector(`#fld-${wrapName}`);
            if (!sel || !wrap) return;
            const parent = wrap.parentElement || wrap;
            const run = () => { parent.style.display = sel.value === '__externo__' ? '' : 'none'; };
            sel.addEventListener('change', run);
            run();
          };
          sync('buyerClient', 'buyerExternalName');
          sync('sellerClient', 'sellerExternalName');
          sync('partnerAdvisor', 'partnerAdvisorName');
        },
        extraActions(record) {
          const options = stagesFor(record.processType).map((s) => `<option value="${s}" ${s === record.currentStage ? 'selected' : ''}>${UI.escapeHtml(stageLabel(s))}</option>`).join('');
          // El select de etapa guarda SOLO al cambiar (data-extra-auto): el
          // botón "Cambiar" se retiró porque ahora no hace falta pulsarlo.
          return `
            <select class="form-control" data-stage data-extra-auto data-field="currentStage" data-record="${record._id}" style="display:inline-block;width:150px;padding:5px 8px;font-size:12px;margin-left:6px;" title="Cambiar etapa (se guarda al elegir)">${options}</select>
            <button class="btn btn-secondary btn-sm" data-history style="margin-left:6px;">Etapas</button>
            <button class="btn btn-secondary btn-sm" data-extra data-activity data-record="${record._id}" style="margin-left:6px;">Actividad</button>
          `;
        },
        onExtraAction(record, control, ctx) {
          // Historial de actividad del negocio.
          if (control.dataset.activity) {
            UI.showActivityHistory('Business', record._id, `Centro de actividad — ${record.name}`);
            return;
          }
          // Cambio de etapa: llega desde el select auto-guardado (o un botón).
          const sel = control.matches && control.matches('select[data-stage]')
            ? control
            : (control.parentElement && control.parentElement.querySelector('[data-stage]'));
          if (!sel) return;
          API.businesses
            .stage(record._id, { stage: sel.value })
            .then((res) => {
              ctx.toast((res && res.message) || 'Etapa actualizada', 'success');
              ctx.reload();
            })
            .catch((error) => {
              ctx.toast(error.message, 'error');
              ctx.reload();
            });
        },
        onEdit: true,
        onRemove: true,
      });

      renderSummary(summaryEl);
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

    async function renderKanban() {
      contentEl.innerHTML = `
        <div id="biz-summary"></div>
        <div style="margin-bottom:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <div class="process-tabs" role="tablist" aria-label="Proceso de venta">
            <button class="process-tab ${state.processType === 'comprador' ? 'active' : ''}" type="button" data-process="comprador">Comprador</button>
            <button class="process-tab ${state.processType === 'vendedor' ? 'active' : ''}" type="button" data-process="vendedor">Vendedor</button>
          </div>
        </div>
        <div id="neg-board"><div class="loading">Cargando negociaciones...</div></div>
      `;

      renderSummary(contentEl.querySelector('#biz-summary'));

      contentEl.querySelectorAll('.process-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          state.processType = tab.dataset.process;
          contentEl.querySelectorAll('.process-tab').forEach((t) => t.classList.toggle('active', t === tab));
          loadBoard();
        });
      });

      loadBoard();
    }

    async function fetchAllBusinesses(params) {
      const all = [];
      let page = 1;
      for (;;) {
        const res = await API.businesses.list({ ...params, page, limit: 100 });
        all.push(...(res.data || []));
        if (!res.meta || !res.meta.pages || page >= res.meta.pages) break;
        page += 1;
      }
      return all;
    }

    // Se releen los negocios activos justo antes de abrir el formulario de alta:
    // el aviso "ya tiene un negocio activo" tiene que reflejar el estado de este
    // momento, no el de cuando se cargó la página.
    async function refrescarActivos() {
      try {
        negociosActivos = await fetchAllBusinesses({ status: 'activo' });
      } catch (error) {
        // si la lista falla se conserva la anterior; el backend sigue rechazando duplicados
      }
    }

    async function loadBoard() {
      const boardEl = contentEl.querySelector('#neg-board');
      if (!boardEl) return;
      boardEl.innerHTML = '<div class="loading">Cargando negociaciones...</div>';
      try {
        const [active, doneResult, cancelledResult] = await Promise.all([
          fetchAllBusinesses({ status: 'activo' }),
          fetchAllBusinesses({ status: 'concluido' }),
          fetchAllBusinesses({ status: 'cancelado' }),
        ]);
        const all = [...active, ...doneResult, ...cancelledResult];

        const columns = columnsFor(state.processType);
        const byStage = {};
        columns.forEach((c) => { byStage[c.stage] = []; });
        const extras = [];
        all.forEach((b) => {
          if (b.processType && b.processType !== state.processType) return;
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
                  <h4><span>${UI.escapeHtml(col.label)}</span><span style="color:${col.color};">${items.length}</span></h4>
                  ${items.map((b) => `
                    <div class="kanban-card" data-card="${b._id}">
                      <strong>${UI.escapeHtml(b.name)}</strong>
                      <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">
                        ${Format.currency(b.valueOperation)}<br>
                        ${UI.escapeHtml(b.buyerClient ? b.buyerClient.name : (b.buyerExternalName || 'Sin comprador'))}${b.sellerClient ? ` ← ${UI.escapeHtml(b.sellerClient.name)}` : (b.sellerExternalName ? ` ← ${UI.escapeHtml(b.sellerExternalName)}` : '')}
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
        { name: 'closing_promiseDate', label: 'Fecha de promesa', type: 'datetime-local', value: Format.toLocalInput(closing.promiseDate) },
        { name: 'closing_closingDate', label: 'Fecha de cierre', type: 'datetime-local', value: Format.toLocalInput(closing.closingDate) },
        { name: 'closing_commission', label: 'Comisión', type: 'number', value: closing.commission || 0 },
        { name: 'partnerAdvisor', label: 'Compañero / asesor', type: 'select', sinOtros: true, options: [{ value: '', label: '— Sin compañero —' }, ...userOptions, { value: '__externo__', label: 'Otro / Externo — escribir nombre' }], value: business.partnerAdvisor ? business.partnerAdvisor._id || business.partnerAdvisor : (business.partnerAdvisorName ? '__externo__' : '') },
        { name: 'partnerAdvisorName', label: 'Nombre del asesor externo', type: 'text', placeholder: 'Ej. Lic. Ramírez de Inmobiliaria Centro', value: business.partnerAdvisorName || '' },
        { name: 'negotiation_notes', label: 'Notas de negociación', type: 'textarea', full: true, value: neg.notes || '' },
      ];
      const modal = UI.openModal({
        title: `Negociación: ${business.name}`,
        body: `
          <div style="margin-bottom:16px;display:flex;gap:12px;flex-wrap:wrap;font-size:13px;">
            ${UI.badge(business.processType === 'vendedor' ? 'Proceso vendedor' : 'Proceso comprador', 'info')}
            ${UI.badge(stageLabel(business.currentStage), 'info')}
            <span class="text-muted">Comprador: ${UI.escapeHtml(business.buyerClient ? business.buyerClient.name : (business.buyerExternalName || '—'))}${business.buyerExternalName && !business.buyerClient ? ' (externo)' : ''}</span>
            <span class="text-muted">Vendedor: ${UI.escapeHtml(business.sellerClient ? business.sellerClient.name : (business.sellerExternalName || '—'))}${business.sellerExternalName && !business.sellerClient ? ' (externo)' : ''}</span>
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
        // El nombre del asesor externo solo se muestra con la opción "Otro /
        // Externo" seleccionada en el desplegable del compañero.
        const partnerSel = form.querySelector('#fld-partnerAdvisor');
        const partnerWrap = form.querySelector('#fld-partnerAdvisorName');
        if (partnerSel && partnerWrap) {
          const parent = partnerWrap.parentElement || partnerWrap;
          const syncPartner = () => { parent.style.display = partnerSel.value === '__externo__' ? '' : 'none'; };
          partnerSel.addEventListener('change', syncPartner);
          syncPartner();
        }
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const v = UI.collectForm(e.target);
          // Solo se editan los montos no redundantes (propuesta inicial y
          // comisión); contraoferta/promesa/cierre conservan su valor guardado.
          const { negotiation_offer, negotiation_notes, closing_promiseDate, closing_closingDate, closing_commission, stage, processType, partnerAdvisorName, ...rest } = v;
          // Asesor externo: ObjectId vacío + nombre en texto libre.
          if (rest.partnerAdvisor === '__externo__') {
            if (!String(partnerAdvisorName || '').trim()) return UI.toast('Escribe el nombre del asesor externo', 'warning');
            rest.partnerAdvisor = null;
            rest.partnerAdvisorName = String(partnerAdvisorName).trim();
          } else {
            rest.partnerAdvisorName = '';
          }
          const body = {
            ...rest,
            processType,
            negotiation: {
              offer: negotiation_offer || 0,
              counterOffer: neg.counterOffer || 0,
              notes: negotiation_notes || '',
            },
            closing: {
              promiseAmount: closing.promiseAmount || 0,
              promiseDate: closing_promiseDate ? new Date(closing_promiseDate).toISOString() : null,
              closingAmount: closing.closingAmount || 0,
              closingDate: closing_closingDate ? new Date(closing_closingDate).toISOString() : null,
              commission: closing_commission || 0,
            },
          };
          try {
            // Solo se avanza/regresa de etapa cuando realmente cambió; la
            // actualización del proceso se resuelve en el update.
            const hasProcessChange = Boolean(processType && processType !== business.processType);
            if (!hasProcessChange && stage && stage !== business.currentStage) {
              await API.businesses.stage(business._id, { stage });
            }
            await API.businesses.update(business._id, body);
            UI.toast('Cambios guardados', 'success');
            UI.closeModal();
            await refrescarActivos();
            renderView();
          } catch (error) {
            UI.toast(error.message, 'error');
          }
        });
      }
    }

    async function openNew() {
      await refrescarActivos();
      // Alta ágil para la llamada/visita: solo lo esencial. Contraoferta,
      // promesa, cierre y comisión se capturan después desde el detalle.
      const fields = [
        { name: 'name', label: 'Nombre del negocio', type: 'text', required: true, full: true },
        { name: 'processType', label: 'Proceso de venta', type: 'select', options: [{ value: 'comprador', label: 'Comprador' }, { value: 'vendedor', label: 'Vendedor' }] },
        { name: 'buyerClient', label: 'Comprador', type: 'select', sinOtros: true, search: true, searchSource: UI.remoteSources.client, options: [{ value: '', label: '— Sin comprador —' }, ...opcionesCliente(clients, 'buyerClient'), { value: '__externo__', label: 'Otro / Externo — escribir nombre' }] },
        { name: 'buyerExternalName', label: 'Nombre del comprador externo', type: 'text', placeholder: 'Ej. Juan Pérez (no está en la cartera)', hint: 'Solo si elegiste "Otro / Externo".' },
        { name: 'sellerClient', label: 'Vendedor', type: 'select', sinOtros: true, search: true, searchSource: UI.remoteSources.client, options: [{ value: '', label: '— Sin vendedor —' }, ...opcionesCliente(clients, 'sellerClient'), { value: '__externo__', label: 'Otro / Externo — escribir nombre' }] },
        { name: 'sellerExternalName', label: 'Nombre del vendedor externo', type: 'text', placeholder: 'Ej. María López (no está en la cartera)', hint: 'Solo si elegiste "Otro / Externo".' },
        { name: 'property', label: 'Propiedad', type: 'select', sinOtros: true, search: true, searchSource: UI.remoteSources.property, options: [{ value: '', label: '— Sin propiedad —' }, ...propertyOptions] },
        { name: 'valueOperation', label: 'Valor de operación', type: 'number' },
        { name: 'negotiation_offer', label: 'Propuesta inicial (oferta)', type: 'number' },
        { name: 'partnerAdvisor', label: 'Compañero / asesor', type: 'select', sinOtros: true, options: [{ value: '', label: '— Sin compañero —' }, ...userOptions, { value: '__externo__', label: 'Otro / Externo — escribir nombre' }] },
        { name: 'partnerAdvisorName', label: 'Nombre del asesor externo', type: 'text', placeholder: 'Ej. Lic. Ramírez de Inmobiliaria Centro', hint: 'Solo si elegiste "Otro / Externo".' },
        { name: 'negotiation_notes', label: 'Notas', type: 'textarea', full: true },
      ];
      const modal = UI.openModal({
        title: 'Nuevo negocio',
        body: `
          <form id="new-neg-form" novalidate>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 16px;">
              ${fields.map((f) => (f.search
                ? UI.searchSelect(f.name, f.label, { ...f, source: f.searchSource, value: f.value || '' })
                : UI.field(f.name, f.label, { ...f, value: f.value || '' }))).join('')}
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
        // Conecta los buscadores remotos de comprador/vendedor.
        if (UI.wireSearchSelects) UI.wireSearchSelects(form);
        // Comprador/vendedor/asesor "Otro / Externo": muestra el campo de
        // nombre libre solo cuando la opción externa está elegida.
        const syncExt = (selName, wrapName) => {
          const sel = form.querySelector(`#fld-${selName}`);
          const wrap = form.querySelector(`#fld-${wrapName}`);
          if (!sel || !wrap) return;
          const parent = wrap.parentElement || wrap;
          const run = () => { parent.style.display = sel.value === '__externo__' ? '' : 'none'; };
          sel.addEventListener('change', run);
          run();
        };
        syncExt('buyerClient', 'buyerExternalName');
        syncExt('sellerClient', 'sellerExternalName');
        syncExt('partnerAdvisor', 'partnerAdvisorName');

        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const v = UI.collectForm(e.target);
          const { negotiation_offer, negotiation_notes, buyerExternalName, sellerExternalName, partnerAdvisorName, ...rest } = v;
          // "Otro / Externo": ObjectId vacío + nombre en texto libre.
          const externo = (valor, nombre) => {
            if (valor === '__externo__') return { id: null, nombre: String(nombre || '').trim() };
            return { id: valor || null, nombre: '' };
          };
          const buyer = externo(rest.buyerClient, buyerExternalName);
          const seller = externo(rest.sellerClient, sellerExternalName);
          const partner = externo(rest.partnerAdvisor, partnerAdvisorName);
          if (rest.buyerClient === '__externo__' && !buyer.nombre) return UI.toast('Escribe el nombre del comprador externo', 'warning');
          if (rest.sellerClient === '__externo__' && !seller.nombre) return UI.toast('Escribe el nombre del vendedor externo', 'warning');
          if (rest.partnerAdvisor === '__externo__' && !partner.nombre) return UI.toast('Escribe el nombre del asesor externo', 'warning');
          rest.buyerClient = buyer.id;
          rest.buyerExternalName = buyer.nombre;
          rest.sellerClient = seller.id;
          rest.sellerExternalName = seller.nombre;
          rest.partnerAdvisor = partner.id;
          rest.partnerAdvisorName = partner.nombre;
          try {
            await API.businesses.create({
              ...rest,
              negotiation: {
                offer: negotiation_offer || 0,
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