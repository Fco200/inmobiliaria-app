'use strict';

window.Pages = window.Pages || {};

window.Pages.businesses = {
  title: 'Negocios',

  async render(container) {
    const FALLBACK_STAGES = [
      'PROMESA',
      'INTEGRACION',
      'AVALUO',
      'REVISION_AVALUO',
      'NOTARIA',
      'DICTAMEN_PRESUPUESTO',
      'FIRMA',
      'PAGO',
      'ENTREGA',
    ];
    const TERMINAL_STAGES = ['concluido', 'cancelado', 'PAUSA'];

    let stageMeta = {
      byProcess: { comprador: FALLBACK_STAGES.slice(), vendedor: FALLBACK_STAGES.slice() },
      order: [...FALLBACK_STAGES, ...TERMINAL_STAGES],
      labels: {},
    };
    try {
      const stagesRes = await API.businesses.stages();
      const data = (stagesRes && stagesRes.data) || stagesRes || {};
      if (data.byProcess && data.byProcess.comprador) {
        stageMeta = {
          byProcess: {
            comprador: data.byProcess.comprador,
            vendedor: (data.byProcess.vendedor || FALLBACK_STAGES.slice()),
          },
          order: data.order || [...FALLBACK_STAGES, ...TERMINAL_STAGES],
          labels: data.labels || {},
        };
      }
    } catch (error) {
      // respaldo predeterminado
    }

    let properties = [];
    let users = [];
    let clients = [];
    let me = null;
    let negociosActivos = [];
    try {
      const [inv, u, c, m, activos] = await Promise.all([
        API.inventory.general({ limit: 100 }).catch(() => ({ data: [] })),
        API.users.list({ limit: 100 }).catch(() => ({ data: [] })),
        API.clients.list({ limit: 100 }).catch(() => ({ data: [] })),
        API.auth.me().catch(() => null),
        fetchAllBusinesses().catch(() => []),
      ]);
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

    const isBuyerClient = (x) => x && ((x.type === 'comprador') || /Comprar/i.test(x.servicio || ''));
    const isSellerClient = (x) => x && ((x.type === 'vendedor') || /Vender/i.test(x.servicio || ''));
    const buyers = clients.filter(isBuyerClient);
    const sellers = clients.filter(isSellerClient);

    const refId = (valor) => String((valor && (valor._id || valor)) || '');
    const yaTieneNegocio = (cliente, campo) => negociosActivos.some((b) => refId(b[campo]) === refId(cliente));
    const opcionesCliente = (lista, campo) => UI.sortByLabel(lista, (x) => x.name).map((x) => ({
      value: x._id,
      label: `${x.name}${yaTieneNegocio(x, campo) ? ' — ya tiene un negocio activo' : ''}`,
    }));

    const stagesFor = (processType) => stageMeta.byProcess[processType] || stageMeta.byProcess.comprador;
    const stageLabel = (code) => stageMeta.labels[code] || String(code || '').replace(/_/g, ' ');

    const roleCode = String((me && me.role && (me.role.code || me.role)) || '');
    const canManage = ['admin', 'direccion', 'gerencia', 'superadmin', 'asistencia'].includes(roleCode);
    const canChangeStage = ['admin', 'direccion', 'gerencia', 'superadmin', 'escrituracion'].includes(roleCode);
    const canChecklist = ['admin', 'direccion', 'gerencia', 'superadmin', 'asistencia', 'escrituracion'].includes(roleCode);
    const canWriteNotes = true;

    const allStages = stageMeta.order && stageMeta.order.length
      ? stageMeta.order
      : Array.from(new Set([...stageMeta.byProcess.comprador, ...stageMeta.byProcess.vendedor, ...TERMINAL_STAGES]));
    const allStageOptions = allStages.map((s) => ({ value: s, label: stageLabel(s) }));

    const STAGE_COLORS = {
      PROMESA: '#8b5cf6',
      INTEGRACION: '#0d9488',
      AVALUO: '#b45309',
      REVISION_AVALUO: '#2563eb',
      NOTARIA: '#db2777',
      DICTAMEN_PRESUPUESTO: '#9333ea',
      FIRMA: '#ea580c',
      PAGO: '#7c3aed',
      ENTREGA: '#0891b2',
      concluido: '#1f9d55',
      cancelado: '#dc2626',
      PAUSA: '#f59e0b',
    };
    const colorFor = (stage) => STAGE_COLORS[stage] || '#64748b';

    const currentUser = me || ApiClient.getStoredUser();
    const currentUserId = currentUser ? (currentUser._id || currentUser.id || '') : '';
    const userOptions = users.length
      ? UI.sortByLabel(users, (x) => x.name).map((x) => ({ value: x._id, label: x.name }))
      : [{ value: currentUserId, label: currentUser ? currentUser.name : '' }];
    const propertyOptions = UI.sortByLabel(properties, UI.propertyOptionLabel)
      .map((x) => ({ value: x._id, label: UI.propertyOptionLabel(x) }));

    // Compatibilidad: si el navegador conserva un bundle viejo de
    // `services/index.js` sin los subobjetos de checklist/notas/documentos, se
    // usan las rutas REST directamente en lugar de romper los botones con
    // "API.businesses.documents.list is not a function".
    const bizApi = API.businesses || {};
    const notesApi = (bizApi.notes && typeof bizApi.notes.list === 'function') ? bizApi.notes : {
      list: (id) => ApiClient.get(`/businesses/${id}/notes`),
      create: (id, body) => ApiClient.post(`/businesses/${id}/notes`, body),
      remove: (id, noteId) => ApiClient.remove(`/businesses/${id}/notes/${noteId}`),
    };
    const checklistApi = (bizApi.checklist && typeof bizApi.checklist.list === 'function') ? bizApi.checklist : {
      list: (id) => ApiClient.get(`/businesses/${id}`).then((res) => ((res && res.checklist) || (res && res.data && res.data.checklist) || [])),
      create: (id, body) => ApiClient.post(`/businesses/${id}/checklist`, body),
      update: (id, itemId, body) => ApiClient.patch(`/businesses/${id}/checklist/${itemId}`, body),
      remove: (id, itemId) => ApiClient.remove(`/businesses/${id}/checklist/${itemId}`),
    };
    const documentsApi = (bizApi.documents && typeof bizApi.documents.list === 'function') ? bizApi.documents : {
      list: (id) => ApiClient.get(`/businesses/${id}/documents`),
      create: (id, form) => ApiClient.postMultipart(`/businesses/${id}/documents`, form),
      remove: (id, docId) => ApiClient.remove(`/businesses/${id}/documents/${docId}`),
    };

    const state = { view: 'table', processType: 'comprador' };

    // ── Utilidades del formulario de negocios ──────────────────────────────
    // El formulario usa los alias solicitados por la inmobiliaria
    // (`asesor_captador_id`, `asesor_cliente_id`, `cliente_id`) y el backend
    // los sincroniza con mainAdvisor/partnerAdvisor/buyerClient. Aquí se arma
    // el cuerpo una sola vez para que crear y editar se comporten igual.
    function ensureSelectOption(select, value, label) {
      if (!select || value == null || value === '') return;
      const id = String(value);
      if (!Array.from(select.options).some((o) => String(o.value) === id)) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = label || id;
        select.appendChild(opt);
      }
      select.value = id;
    }

    function syncExternalField(form, selName, wrapName) {
      const sel = form.querySelector(`#fld-${selName}`);
      const wrap = form.querySelector(`#fld-${wrapName}`);
      if (!sel || !wrap) return;
      const parent = wrap.closest('.form-field') || wrap.parentElement || wrap;
      const run = () => { parent.style.display = sel.value === '__externo__' ? '' : 'none'; };
      sel.addEventListener('change', run);
      run();
    }

    // Al elegir una propiedad se muestra quién es el propietario y el asesor
    // responsable, y se completan el vendedor y (si está vacío) el captador.
    async function syncPropertyInfo(form) {
      const propSel = form.querySelector('#fld-property');
      if (!propSel) return;
      let info = form.querySelector('[data-property-info]');
      if (!info) {
        info = document.createElement('div');
        info.setAttribute('data-property-info', '');
        info.className = 'form-field form-field-full';
        info.style.display = 'none';
        const wrap = propSel.closest('.form-field') || propSel.parentElement;
        if (wrap && wrap.parentElement) wrap.parentElement.insertBefore(info, wrap.nextSibling);
        else form.appendChild(info);
      }
      const propertyId = propSel.value;
      if (!propertyId) {
        info.style.display = 'none';
        info.innerHTML = '';
        return;
      }
      info.style.display = '';
      info.innerHTML = '<small class="text-muted">Cargando datos de la propiedad…</small>';
      try {
        const prop = await API.properties.get(propertyId);
        if (!prop) {
          info.style.display = 'none';
          return;
        }
        const owner = prop.owner && typeof prop.owner === 'object' ? prop.owner : null;
        const ownerName = (owner && (owner.nombre || owner.name)) || prop.ownerName || '';
        const ownerId = owner ? (owner._id || owner) : (typeof prop.owner === 'string' ? prop.owner : '');
        const responsible = prop.responsibleUser && typeof prop.responsibleUser === 'object'
          ? prop.responsibleUser
          : null;
        const responsibleId = responsible
          ? (responsible._id || responsible)
          : (typeof prop.responsibleUser === 'string' ? prop.responsibleUser : '');
        const responsibleName = responsible ? (responsible.name || responsible.username || '') : '';

        // Vendedor = propietario de la propiedad (si no se había elegido uno).
        const sellerSel = form.querySelector('#fld-sellerClient');
        const sellerExt = form.querySelector('#fld-sellerExternalName');
        if (ownerId) {
          ensureSelectOption(sellerSel, ownerId, `Propietario: ${ownerName || 'propiedad'}`);
          if (sellerExt) sellerExt.value = '';
          syncExternalFieldDisplay(form, 'sellerClient', 'sellerExternalName');
        } else if (ownerName && sellerSel && !sellerSel.value && sellerExt) {
          sellerExt.value = ownerName;
          syncExternalFieldDisplay(form, 'sellerClient', 'sellerExternalName');
        }

        // Captador = asesor responsable de la propiedad, solo si aún no se eligió.
        const captadorSel = form.querySelector('#fld-asesor_captador_id');
        if (captadorSel && responsibleId && !captadorSel.value) {
          ensureSelectOption(captadorSel, responsibleId, responsibleName || 'Asesor responsable');
        }

        info.innerHTML = `
          <div class="alert alert-info" style="margin:0;">
            <strong>Propiedad:</strong> ${UI.escapeHtml(UI.propertyOptionLabel(prop))}<br>
            <span class="text-muted">Propietario / vendedor:</span> ${UI.escapeHtml(ownerName || 'No registrado')}<br>
            <span class="text-muted">Asesor responsable:</span> ${UI.escapeHtml(responsibleName || 'No registrado')}
          </div>
        `;
      } catch (error) {
        info.innerHTML = `<small class="text-muted">No se pudieron cargar los datos de la propiedad.</small>`;
      }
    }

    function syncExternalFieldDisplay(form, selName, wrapName) {
      const sel = form.querySelector(`#fld-${selName}`);
      const wrap = form.querySelector(`#fld-${wrapName}`);
      if (!sel || !wrap) return;
      const parent = wrap.closest('.form-field') || wrap.parentElement || wrap;
      parent.style.display = sel.value === '__externo__' ? '' : 'none';
    }

    function wireBusinessForm(form) {
      if (!form) return;
      if (UI.wireSearchSelects) UI.wireSearchSelects(form);
      syncExternalField(form, 'cliente_id', 'buyerExternalName');
      syncExternalField(form, 'sellerClient', 'sellerExternalName');
      syncExternalField(form, 'asesor_cliente_id', 'partnerAdvisorName');
      const propSel = form.querySelector('#fld-property');
      if (propSel) {
        propSel.addEventListener('change', () => { syncPropertyInfo(form); });
        if (propSel.value) syncPropertyInfo(form);
      }
    }

    // Construye el payload canónico + alias. Lanza errores legibles cuando
    // falta un dato obligatorio (p. ej. el asesor captador).
    function buildBusinessPayload(values, record) {
      const data = { ...values };
      const {
        negotiation_offer,
        negotiation_notes,
        buyerExternalName,
        sellerExternalName,
        partnerAdvisorName,
        closing_promiseDate,
        closing_commission,
        fecha_cierre,
        ...rest
      } = data;

      const externo = (valor, nombre) => {
        if (valor === '__externo__') return { id: null, nombre: String(nombre || '').trim() };
        return { id: valor || null, nombre: '' };
      };

      const clienteRaw = rest.cliente_id;
      const clienteExterno = clienteRaw === '__externo__';
      const clienteNombre = String(buyerExternalName || '').trim();
      if (clienteExterno && !clienteNombre) {
        throw new Error('Escribe el nombre del cliente externo.');
      }
      const seller = externo(rest.sellerClient, sellerExternalName);
      if (rest.sellerClient === '__externo__' && !seller.nombre) {
        throw new Error('Escribe el nombre del vendedor externo.');
      }
      const asesorCliente = externo(rest.asesor_cliente_id, partnerAdvisorName);
      if (rest.asesor_cliente_id === '__externo__' && !asesorCliente.nombre) {
        throw new Error('Escribe el nombre del asesor externo.');
      }
      const captador = rest.asesor_captador_id || rest.mainAdvisor || '';
      if (!captador) {
        throw new Error('Selecciona el asesor captador del negocio.');
      }

      rest.asesor_captador_id = captador;
      rest.mainAdvisor = captador;
      rest.cliente_id = clienteExterno ? null : (clienteRaw || null);
      rest.buyerClient = rest.cliente_id;
      rest.buyerExternalName = clienteExterno ? clienteNombre : '';
      rest.sellerClient = seller.id;
      rest.sellerExternalName = seller.nombre;
      rest.asesor_cliente_id = asesorCliente.id;
      rest.partnerAdvisor = asesorCliente.id;
      rest.partnerAdvisorName = asesorCliente.nombre;

      const negPrevio = (record && record.negotiation) || {};
      const closePrevio = (record && record.closing) || {};
      const closeParticipants = (Array.isArray(closePrevio.participants) ? closePrevio.participants : [])
        .map((p) => ({
          user: (p && p.user && (p.user._id || p.user)) || null,
          share: Number((p && p.share) || 0),
        }))
        .filter((p) => p.user);
      const tienePromise = Object.prototype.hasOwnProperty.call(values, 'closing_promiseDate');
      const tieneCommission = Object.prototype.hasOwnProperty.call(values, 'closing_commission');
      const closingDate = fecha_cierre ? new Date(fecha_cierre).toISOString() : null;

      return {
        ...rest,
        negotiation: {
          offer: negotiation_offer || 0,
          counterOffer: negPrevio.counterOffer || 0,
          notes: negotiation_notes || '',
        },
        closing: {
          promiseAmount: closePrevio.promiseAmount || 0,
          promiseDate: tienePromise
            ? (closing_promiseDate ? new Date(closing_promiseDate).toISOString() : null)
            : (closePrevio.promiseDate || null),
          closingAmount: closePrevio.closingAmount || 0,
          closingDate,
          commission: tieneCommission ? (closing_commission || 0) : (closePrevio.commission || 0),
          participants: closeParticipants,
        },
        fecha_cierre: closingDate,
      };
    }

    container.innerHTML = `
      <div class="page-header">
        <h2>Negocios</h2>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <div class="process-tabs" role="tablist" aria-label="Vista">
            <button class="process-tab active" type="button" data-view="table">&#128203; Lista</button>
            <button class="process-tab" type="button" data-view="kanban">&#128200; Kanban</button>
          </div>
          ${canManage ? `
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
              <button class="btn btn-primary" type="button" data-new>+ Nuevo negocio</button>
              <small class="text-muted" style="max-width:320px;text-align:right;font-size:11px;">Abre el formulario completo: comprador o vendedor, propiedad, asesor captador y asesor que atiende al cliente. Para cambiar un negocio existente usa <em>Editar</em> en la lista.</small>
            </div>` : ''}
        </div>
      </div>
      <div id="biz-content"></div>
    `;

    const contentEl = container.querySelector('#biz-content');

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

    const newBtnEl = container.querySelector('[data-new]');
    if (newBtnEl) newBtnEl.addEventListener('click', () => openNew());

    function columnsFor(processType) {
      const columns = stagesFor(processType)
        .filter((s) => !TERMINAL_STAGES.includes(s))
        .map((s) => ({ stage: s, label: stageLabel(s), color: colorFor(s) }));
      columns.push({ stage: 'PAUSA', label: stageLabel('PAUSA'), color: colorFor('PAUSA') });
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

    async function renderSummary(summaryEl) {
      if (!summaryEl) return;
      try {
        const all = await API.businesses.list({ limit: 1000 }).catch(() => ({ data: [] }));
        const items = (all && (all.data || all)) || [];
        const counts = {};
        items.forEach((b) => {
          const s = b && b.currentStage ? String(b.currentStage) : '';
          if (!s) return;
          counts[s] = (Number(counts[s]) || 0) + 1;
        });
        const total = items.length;
        const known = [
          ...new Set([...(stageMeta.byProcess.comprador || []), ...(stageMeta.byProcess.vendedor || []), 'PAUSA', 'concluido', 'cancelado']),
        ];
        const others = Object.keys(counts).filter((k) => !known.includes(k));
        const stages = [...known, ...others];
        summaryEl.innerHTML = `
          <div class="pipeline-strip" style="margin-bottom:16px;">
            <button class="pipeline-step pipeline-all is-active" type="button" style="--pipeline-color:var(--primary);">
              <span class="pipeline-label">Total de negocios</span>
              <span class="pipeline-count">${total}</span>
            </button>
            ${stages
              .map((s) => {
                if (s === 'concluido' || s === 'cancelado') return '';
                const label = stageLabel(s) || s;
                const color = colorFor(s);
                const c = Number(counts[s]) || 0;
                return `
                  <button class="pipeline-step" type="button" style="--pipeline-color:${color};">
                    <span class="pipeline-label">${UI.escapeHtml(label)}</span>
                    <span class="pipeline-count">${c}</span>
                  </button>
                `;
              })
              .join('')}
            <button class="pipeline-step" type="button" style="--pipeline-color:#1f9d55;">
              <span class="pipeline-label">Concluidos</span>
              <span class="pipeline-count">${Number(counts.concluido) || 0}</span>
            </button>
            <button class="pipeline-step" type="button" style="--pipeline-color:#dc2626;">
              <span class="pipeline-label">Cancelados / Pausa</span>
              <span class="pipeline-count">${(Number(counts.cancelado) || 0) + (Number(counts.PAUSA) || 0)}</span>
            </button>
          </div>
        `;
      } catch (error) {
        summaryEl.innerHTML = '';
      }
    }

    function renderTable() {
      contentEl.innerHTML = '<div id="biz-summary"></div><div id="biz-list"></div>';
      const summaryEl = contentEl.querySelector('#biz-summary');
      const listEl = contentEl.querySelector('#biz-list');
      crudPage(listEl, {
        title: 'Negocios',
        newLabel: 'Nuevo negocio',
        hideNew: true,
        service: {
          list: (params) => API.businesses.list(params),
          create: (body) => API.businesses.create(body),
          update: (id, body) => API.businesses.update(id, body),
          remove: (id) => API.businesses.remove(id),
        },
        statusOptions: [
          { value: 'activo', label: 'Activo' },
          { value: 'concluido', label: 'Concluido' },
          { value: 'cancelado', label: 'Cancelado/Pausa' },
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
          { key: 'currentStage', label: 'Etapa', render: (r) => `${UI.statusBadge(stageLabel(r.currentStage))}${r.status === 'concluido' ? ' ' + UI.statusBadge('Concluido', 'success') : ''}` },
          { key: 'status', label: 'Estado', render: (r) => UI.statusBadge(r.status) },
        ],
        fields: [
          { name: 'name', label: 'Nombre del negocio', type: 'text', required: true, full: true },
          { name: 'processType', label: 'Proceso de venta', type: 'select', options: [{ value: 'comprador', label: 'Comprador' }, { value: 'vendedor', label: 'Vendedor' }] },
          { name: 'asesor_captador_id', label: 'Asesor captador', type: 'select', required: true, sinOtros: true, value: (r) => (r.asesor_captador_id ? (r.asesor_captador_id._id || r.asesor_captador_id) : (r.mainAdvisor ? (r.mainAdvisor._id || r.mainAdvisor) : '')), options: [{ value: '', label: '— Selecciona al asesor —' }, ...userOptions], hint: 'Asesor que captó el negocio o la propiedad. Obligatorio.' },
          { name: 'asesor_cliente_id', label: 'Asesor que atiende al cliente', type: 'select', sinOtros: true, value: (r) => (r.asesor_cliente_id ? (r.asesor_cliente_id._id || r.asesor_cliente_id) : (r.partnerAdvisor ? (r.partnerAdvisor._id || r.partnerAdvisor) : (r.partnerAdvisorName ? '__externo__' : ''))), options: [{ value: '', label: '— Sin asesor —' }, ...userOptions, { value: '__externo__', label: 'Otro / Externo — escribir nombre' }] },
          { name: 'partnerAdvisorName', label: 'Nombre del asesor externo', type: 'text', value: (r) => r.partnerAdvisorName || '', placeholder: 'Ej. Lic. Ramírez', hint: 'Solo si elegiste "Otro / Externo".' },
          { name: 'cliente_id', label: 'Cliente (comprador)', type: 'select', sinOtros: true, search: true, searchSource: UI.remoteSources.client, value: (r) => (r.cliente_id ? (r.cliente_id._id || r.cliente_id) : (r.buyerClient ? (r.buyerClient._id || r.buyerClient) : (r.buyerExternalName ? '__externo__' : ''))), options: [{ value: '', label: '— Sin cliente —' }, ...opcionesCliente(buyers, 'buyerClient'), { value: '__externo__', label: 'Otro / Externo — escribir nombre' }] },
          { name: 'buyerExternalName', label: 'Nombre del cliente externo', type: 'text', value: (r) => r.buyerExternalName || '', placeholder: 'Ej. Juan Pérez', hint: 'Solo si elegiste "Otro / Externo".' },
          { name: 'sellerClient', label: 'Vendedor (propietario)', type: 'select', sinOtros: true, value: (r) => (r.sellerClient ? (r.sellerClient._id || r.sellerClient) : (r.sellerExternalName ? '__externo__' : '')), options: [{ value: '', label: '— Se toma del propietario —' }, ...opcionesCliente(sellers, 'sellerClient'), { value: '__externo__', label: 'Otro / Externo — escribir nombre' }] },
          { name: 'sellerExternalName', label: 'Nombre del vendedor externo', type: 'text', value: (r) => r.sellerExternalName || '', placeholder: 'Ej. María López', hint: 'Solo si elegiste "Otro / Externo".' },
          { name: 'property', label: 'Propiedad', type: 'select', sinOtros: true, search: true, searchSource: UI.remoteSources.property, options: [{ value: '', label: '— Sin propiedad —' }, ...propertyOptions], hint: 'Al elegirla se completan el propietario/vendedor y el asesor captador.' },
          { name: 'valueOperation', label: 'Valor de la operación', type: 'number' },
          { name: 'negotiation_offer', label: 'Propuesta inicial', type: 'number', value: (r) => (r.negotiation || {}).offer || 0 },
          { name: 'negotiation_notes', label: 'Notas de negociación', type: 'textarea', full: true, value: (r) => (r.negotiation || {}).notes || '' },
          { name: 'closing_promiseDate', label: 'Fecha de promesa', type: 'datetime-local', value: (r) => Format.toLocalInput((r.closing || {}).promiseDate) },
          { name: 'fecha_cierre', label: 'Fecha estimada de cierre', type: 'datetime-local', value: (r) => Format.toLocalInput((r.closing || {}).closingDate), hint: 'Fecha estimada o proyectada para la conclusión de la operación (firma de escrituras o contratos).' },
          { name: 'closing_commission', label: 'Comisión', type: 'number', value: (r) => (r.closing || {}).commission || 0 },
        ],
        formData(values, record) {
          return buildBusinessPayload(values, record);
        },
        onFormMount(form) {
          wireBusinessForm(form);
        },
        extraActions(record) {
          return `
            ${canChangeStage ? '<button class="btn btn-secondary btn-sm" data-extra data-change-stage style="margin-left:6px;">Etapa</button>' : ''}
            <button class="btn btn-secondary btn-sm" data-extra data-bitacora style="margin-left:6px;">Ver bitácora</button>
            <button class="btn btn-secondary btn-sm" data-extra data-checklist style="margin-left:6px;">Checklist</button>
            <button class="btn btn-secondary btn-sm" data-extra data-docs style="margin-left:6px;">Documentos</button>
            <button class="btn btn-secondary btn-sm" data-extra data-stages-info style="margin-left:6px;">Info Etapas</button>
          `;
        },
        onExtraAction(record, control, ctx) {
          if (control.dataset.changeStage !== undefined) {
            openChangeStageModal(record, ctx);
            return;
          }
          if (control.dataset.bitacora !== undefined) {
            openBitacoraModal(record);
            return;
          }
          if (control.dataset.checklist !== undefined) {
            openChecklistModal(record);
            return;
          }
          if (control.dataset.docs !== undefined) {
            openDocumentsModal(record);
            return;
          }
          if (control.dataset.stagesInfo !== undefined) {
            showStagesInfo(record.processType);
            return;
          }
        },
        onEdit: canManage,
        onRemove: canManage,
      });

      renderSummary(summaryEl);
    }

    function showStagesInfo(processType) {
      const stages = stagesFor(processType);
      const items = stages
        .map((s) => `<li style="margin-bottom:8px;"><strong>${UI.escapeHtml(stageLabel(s))}</strong> <span class="text-muted">(${s})</span></li>`)
        .join('');
      const extra = `
        <p style="margin-top:16px;margin-bottom:8px;"><strong>Opciones terminales / especiales</strong></p>
        <ul style="margin:0;padding-left:18px;">
          <li style="margin-bottom:8px;"><strong>${UI.escapeHtml(stageLabel('PAUSA'))}</strong> <span class="text-muted">(PAUSA)</span> — Pausar el negocio temporalmente.</li>
          <li style="margin-bottom:8px;"><strong>${UI.escapeHtml(stageLabel('concluido'))}</strong> <span class="text-muted">(concluido)</span> — Cierre exitoso del negocio.</li>
          <li style="margin-bottom:8px;"><strong>${UI.escapeHtml(stageLabel('cancelado'))}</strong> <span class="text-muted">(cancelado)</span> — Cancelación del negocio.</li>
        </ul>
      `;
      UI.openModal({
        title: `Etapas — Proceso ${processType === 'vendedor' ? 'Vendedor' : 'Comprador'}`,
        body: `
          <p class="text-muted" style="margin-top:0;">Flujo de etapas configurado para este proceso:</p>
          <ol style="margin:0;padding-left:18px;">${items}</ol>
          ${extra}
        `,
        size: 520,
      });
    }

    function openChangeStageModal(record, ctx) {
      const stages = stagesFor(record.processType);
      const stageOptions = [...stages, 'PAUSA', 'concluido', 'cancelado']
        .map((s) => `<option value="${s}" ${s === record.currentStage ? 'selected' : ''}>${UI.escapeHtml(stageLabel(s))}</option>`)
        .join('');
      const modal = UI.openModal({
        title: `Cambiar etapa — ${record.name}`,
        body: `
          <form id="biz-stage-form" novalidate>
            <div class="form-field">
              <label>Etapa</label>
              <select class="form-control" name="stage" required>${stageOptions}</select>
            </div>
            <div class="form-field">
              <label>Nota / Comentario (obligatorio)</label>
              <textarea class="form-control" name="nota" rows="4" required placeholder="Describe el motivo del cambio de etapa..."></textarea>
              <small class="text-muted">Es obligatorio agregar una nota para registrar el cambio.</small>
            </div>
          </form>
        `,
        footer: `
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary" type="submit" form="biz-stage-form">Guardar</button>
        `,
        size: 520,
      });
      const overlay = modal.bodyEl.closest('#modal-overlay');
      overlay.querySelector('[data-cancel]').addEventListener('click', () => UI.closeModal());
      const form = modal.bodyEl.querySelector('#biz-stage-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = UI.collectForm(e.target);
        const stage = v.stage;
        const nota = String(v.nota || '').trim();
        if (!stage) {
          UI.toast('Selecciona una etapa', 'warning');
          return;
        }
        if (!nota) {
          UI.toast('La nota es obligatoria para cambiar de etapa', 'warning');
          return;
        }
        try {
          const res = await API.businesses.stage(record._id, { stage, nota, comments: nota });
          UI.closeModal();
          UI.toast((res && res.message) || 'Etapa actualizada', 'success');
          if (ctx && typeof ctx.reload === 'function') ctx.reload();
          else renderView();
        } catch (error) {
          UI.toast(error.message, 'error');
        }
      });
    }

    // ============ MODAL DE BITÁCORA ============
    async function openBitacoraModal(record) {
      const modal = UI.openModal({
        title: `Bitácora / Notas — ${record.name}`,
        body: `<div id="biz-notes-container"><div class="loading">Cargando notas...</div></div>`,
        size: 600,
      });

      const loadNotesContent = async () => {
        const containerEl = modal.bodyEl.querySelector('#biz-notes-container');
        if (!containerEl) return;
        try {
          const res = await notesApi.list(record._id);
          const notes = (res && res.data) || res || [];
          containerEl.innerHTML = `
            ${canWriteNotes ? `
              <form id="add-note-form" style="margin-bottom:16px;display:flex;gap:8px;">
                <input type="text" class="form-control" name="text" placeholder="Escribe una nueva nota o comentario..." required />
                <button class="btn btn-primary" type="submit">Agregar</button>
              </form>
            ` : ''}
            <div style="max-height:350px;overflow-y:auto;">
              ${notes.length ? notes.map((n) => `
                <div style="padding:10px;margin-bottom:8px;border:1px solid var(--border-color,#e2e8f0);border-radius:6px;background:var(--bg-card,#fff);">
                  <div style="font-size:13px;margin-bottom:4px;">${UI.escapeHtml(n.text || n.content || n.note)}</div>
                  <div class="text-muted" style="font-size:11px;">
                    ${n.createdBy ? UI.escapeHtml(n.createdBy.name || n.createdBy.username || n.createdBy) : 'Sistema'} · ${Format.dateTime(n.createdAt || n.date)}
                  </div>
                </div>
              `).join('') : '<p class="text-muted">No hay notas registradas en la bitácora.</p>'}
            </div>
          `;

          const addForm = containerEl.querySelector('#add-note-form');
          if (addForm) {
            addForm.addEventListener('submit', async (ev) => {
              ev.preventDefault();
              const val = UI.collectForm(ev.target);
              if (!String(val.text || '').trim()) return;
              try {
                await notesApi.create(record._id, { text: val.text });
                UI.toast('Nota agregada', 'success');
                loadNotesContent();
              } catch (err) {
                UI.toast(err.message, 'error');
              }
            });
          }
        } catch (err) {
          containerEl.innerHTML = UI.errorAlert(err.message);
        }
      };

      loadNotesContent();
    }

    // ============ MODAL DE CHECKLIST ============
    async function openChecklistModal(record) {
      const modal = UI.openModal({
        title: `Checklist — ${record.name}`,
        body: `<div id="biz-checklist-container"><div class="loading">Cargando checklist...</div></div>`,
        size: 550,
      });

      const loadChecklistContent = async () => {
        const containerEl = modal.bodyEl.querySelector('#biz-checklist-container');
        if (!containerEl) return;
        try {
          const res = await checklistApi.list(record._id).catch(() => record.checklist || []);
          const items = (res && res.data) || res || [];
          containerEl.innerHTML = `
            ${canChecklist ? `
              <form id="add-check-form" style="margin-bottom:16px;display:flex;gap:8px;">
                <input type="text" class="form-control" name="text" placeholder="Nuevo elemento para el checklist..." required />
                <button class="btn btn-primary" type="submit">Añadir</button>
              </form>
            ` : ''}
            <div style="max-height:350px;overflow-y:auto;">
              ${items.length ? items.map((item, idx) => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-color,#e2e8f0);">
                  <label style="display:flex;align-items:center;gap:8px;cursor:pointer;flex:1;">
                    <input type="checkbox" data-check-id="${item._id || idx}" ${item.done || item.completed ? 'checked' : ''} ${!canChecklist ? 'disabled' : ''} />
                    <span style="${item.done || item.completed ? 'text-decoration:line-through;color:var(--text-muted);' : ''}">${UI.escapeHtml(item.text || item.title)}</span>
                  </label>
                  ${canChecklist ? `<button class="btn btn-danger btn-sm" data-delete-check="${item._id || idx}" style="padding:2px 6px;font-size:11px;">✕</button>` : ''}
                </div>
              `).join('') : '<p class="text-muted">No hay elementos en el checklist.</p>'}
            </div>
          `;

          const addForm = containerEl.querySelector('#add-check-form');
          if (addForm) {
            addForm.addEventListener('submit', async (ev) => {
              ev.preventDefault();
              const val = UI.collectForm(ev.target);
              if (!String(val.text || '').trim()) return;
              try {
                await checklistApi.create(record._id, { text: val.text });
                loadChecklistContent();
              } catch (err) {
                UI.toast(err.message, 'error');
              }
            });
          }

          containerEl.querySelectorAll('[data-check-id]').forEach((chk) => {
            chk.addEventListener('change', async (ev) => {
              const itemId = ev.target.dataset.checkId;
              const done = ev.target.checked;
              try {
                await checklistApi.update(record._id, itemId, { done });
              } catch (err) {
                UI.toast(err.message, 'error');
                ev.target.checked = !done;
              }
            });
          });

          containerEl.querySelectorAll('[data-delete-check]').forEach((delBtn) => {
            delBtn.addEventListener('click', async (ev) => {
              const itemId = ev.target.dataset.deleteCheck;
              try {
                await checklistApi.remove(record._id, itemId);
                loadChecklistContent();
              } catch (err) {
                UI.toast(err.message, 'error');
              }
            });
          });
        } catch (err) {
          containerEl.innerHTML = UI.errorAlert(err.message);
        }
      };

      loadChecklistContent();
    }

    // ============ MODAL DE DOCUMENTOS ============
    async function openDocumentsModal(record) {
      const modal = UI.openModal({
        title: `Documentos — ${record.name}`,
        body: `<div id="biz-docs-container"><div class="loading">Cargando documentos...</div></div>`,
        size: 600,
      });

      const loadDocsContent = async () => {
        const containerEl = modal.bodyEl.querySelector('#biz-docs-container');
        if (!containerEl) return;
        try {
          const res = await documentsApi.list(record._id).catch(() => []);
          const docs = (res && res.data) || res || [];
          // Los archivos viven en /uploads y el backend exige sesión: se resuelve
          // la URL absoluta y se agrega el token para que "Ver"/"Descargar" no
          // terminen en 401.
          const resolveDocUrl = (doc) => {
            const raw = doc.fileUrl || doc.url || '';
            if (!raw) return '';
            const config = window.AppConfig;
            return (config && typeof config.resolveUrl === 'function') ? config.resolveUrl(raw) : raw;
          };
          containerEl.innerHTML = `
            <form id="upload-doc-form" style="margin-bottom:16px;padding:12px;background:var(--bg-subtle,#f8fafc);border-radius:6px;">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
                <input type="text" class="form-control" name="name" placeholder="Nombre o título del documento" required />
                <input type="file" class="form-control" name="file" required style="padding:4px;" />
              </div>
              <button class="btn btn-primary btn-sm" type="submit">Subir documento (máx. 8 MB)</button>
            </form>
            <div style="max-height:300px;overflow-y:auto;">
              ${docs.length ? docs.map((doc) => {
                const url = resolveDocUrl(doc);
                const uploaderId = String((doc.uploadedBy && (doc.uploadedBy._id || doc.uploadedBy)) || '');
                const canDelete = canChecklist || (uploaderId && uploaderId === String(currentUserId));
                const uploaderName = doc.uploadedBy && doc.uploadedBy.name ? doc.uploadedBy.name : '';
                return `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:8px;border-bottom:1px solid var(--border-color,#e2e8f0);gap:10px;">
                  <div>
                    <strong>${UI.escapeHtml(doc.name || doc.originalName || 'Documento')}</strong>
                    <br><small class="text-muted">${Format.dateTime(doc.createdAt)}${uploaderName ? ` · ${UI.escapeHtml(uploaderName)}` : ''}</small>
                  </div>
                  <div style="display:flex;gap:8px;flex-shrink:0;">
                    ${url ? `<a href="${UI.escapeHtml(url)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">Ver</a>` : ''}
                    ${url ? `<a href="${UI.escapeHtml(url)}" download class="btn btn-secondary btn-sm">Descargar</a>` : ''}
                    ${canDelete ? `<button class="btn btn-danger btn-sm" data-delete-doc="${doc._id}">Eliminar</button>` : ''}
                  </div>
                </div>`;
              }).join('') : '<p class="text-muted">No hay documentos adjuntos a este negocio.</p>'}
            </div>
          `;

          const uploadForm = containerEl.querySelector('#upload-doc-form');
          if (uploadForm) {
            uploadForm.addEventListener('submit', async (ev) => {
              ev.preventDefault();
              const formData = new FormData(ev.target);
              try {
                UI.toast('Subiendo documento...', 'info');
                await documentsApi.create(record._id, formData);
                UI.toast('Documento subido con éxito', 'success');
                loadDocsContent();
              } catch (err) {
                UI.toast(err.message, 'error');
              }
            });
          }

          containerEl.querySelectorAll('[data-delete-doc]').forEach((delBtn) => {
            delBtn.addEventListener('click', async (ev) => {
              const docId = ev.target.dataset.deleteDoc;
              if (!confirm('¿Estás seguro de eliminar este documento?')) return;
              try {
                await documentsApi.remove(record._id, docId);
                UI.toast('Documento eliminado', 'success');
                loadDocsContent();
              } catch (err) {
                UI.toast(err.message, 'error');
              }
            });
          });
        } catch (err) {
          containerEl.innerHTML = UI.errorAlert(err.message);
        }
      };

      loadDocsContent();
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
        const rows = (result.data || result || [])
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

    async function refrescarActivos() {
      try {
        negociosActivos = await fetchAllBusinesses({ status: 'activo' });
      } catch (error) {
        // conserva anterior
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
        { name: 'fecha_cierre', label: 'Fecha estimada de cierre', type: 'datetime-local', value: Format.toLocalInput(closing.closingDate), hint: 'Fecha estimada o proyectada para la conclusión de la operación (firma de escrituras o contratos).' },
        { name: 'closing_commission', label: 'Comisión', type: 'number', value: closing.commission || 0 },
        { name: 'partnerAdvisor', label: 'Compañero / asesor', type: 'select', sinOtros: true, options: [{ value: '', label: '— Sin compañero —' }, ...userOptions, { value: '__externo__', label: 'Otro / Externo — escribir nombre' }], value: business.partnerAdvisor ? business.partnerAdvisor._id || business.partnerAdvisor : (business.partnerAdvisorName ? '__externo__' : '') },
        { name: 'partnerAdvisorName', label: 'Nombre del asesor externo', type: 'text', placeholder: 'Ej. Lic. Ramírez', value: business.partnerAdvisorName || '' },
        { name: 'negotiation_notes', label: 'Notas de negociación', type: 'textarea', full: true, value: neg.notes || '' },
      ];
      const modal = UI.openModal({
        title: `Negociación: ${business.name}`,
        body: `
          <div style="margin-bottom:16px;display:flex;gap:12px;flex-wrap:wrap;font-size:13px;">
            ${UI.badge(business.processType === 'vendedor' ? 'Proceso vendedor' : 'Proceso comprador', 'info')}
            ${UI.badge(stageLabel(business.currentStage), 'info')}
            <span class="text-muted">Comprador: ${UI.escapeHtml(business.buyerClient ? business.buyerClient.name : (business.buyerExternalName || '—'))}</span>
            <span class="text-muted">Vendedor: ${UI.escapeHtml(business.sellerClient ? business.sellerClient.name : (business.sellerExternalName || '—'))}</span>
          </div>
          <form id="neg-form" novalidate>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 16px;">
              ${fields.map((f) => UI.field(f.name, f.label, { ...f, value: f.value })).join('')}
            </div>
          </form>
        `,
        footer: canManage
          ? `
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary" type="submit" form="neg-form">Guardar</button>
        `
          : `
          <button class="btn btn-secondary" type="button" data-cancel>Cerrar</button>
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
        const partnerSel = form.querySelector('#fld-partnerAdvisor');
        const partnerWrap = form.querySelector('#fld-partnerAdvisorName');
        if (partnerSel && partnerWrap) {
          const parent = partnerWrap.parentElement || partnerWrap;
          const syncPartner = () => { parent.style.display = partnerSel.value === '__externo__' ? '' : 'none'; };
          partnerSel.addEventListener('change', syncPartner);
          syncPartner();
        }
        if (!canManage) {
          // Asesor / escrituración: consulta del avance en modo solo lectura.
          form.querySelectorAll('input, select, textarea').forEach((el) => { el.disabled = true; });
          return;
        }
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const v = UI.collectForm(e.target);
          const { negotiation_offer, negotiation_notes, closing_promiseDate, fecha_cierre, closing_commission, stage, processType, partnerAdvisorName, ...rest } = v;
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
              closingDate: fecha_cierre ? new Date(fecha_cierre).toISOString() : null,
              commission: closing_commission || 0,
              participants: (Array.isArray(closing.participants) ? closing.participants : [])
                .map((p) => ({
                  user: (p && p.user && (p.user._id || p.user)) || null,
                  share: Number((p && p.share) || 0),
                }))
                .filter((p) => p.user),
            },
            fecha_cierre: fecha_cierre ? new Date(fecha_cierre).toISOString() : null,
          };
          try {
            const hasProcessChange = Boolean(processType && processType !== business.processType);
            if (!hasProcessChange && stage && stage !== business.currentStage) {
              await API.businesses.stage(business._id, { stage, nota: 'Actualización desde detalle', comments: 'Actualización desde detalle' });
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
      const stageOptionsForNew = (processType) => (stagesFor(processType) || [])
        .filter((s) => s !== 'concluido' && s !== 'cancelado')
        .map((s) => ({ value: s, label: stageLabel(s) }));
      const fields = [
        { name: 'name', label: 'Nombre del negocio', type: 'text', required: true, full: true },
        { name: 'processType', label: 'Proceso de venta', type: 'select', options: [{ value: 'comprador', label: 'Comprador' }, { value: 'vendedor', label: 'Vendedor' }], value: 'comprador' },
        { name: 'currentStage', label: 'Etapa inicial', type: 'select', options: stageOptionsForNew('comprador') },
        { name: 'asesor_captador_id', label: 'Asesor captador', type: 'select', required: true, sinOtros: true, options: [{ value: '', label: '— Selecciona al asesor —' }, ...userOptions], hint: 'Asesor que captó el negocio o la propiedad. Obligatorio.' },
        { name: 'asesor_cliente_id', label: 'Asesor que atiende al cliente', type: 'select', sinOtros: true, options: [{ value: '', label: '— Sin asesor —' }, ...userOptions, { value: '__externo__', label: 'Otro / Externo — escribir nombre' }] },
        { name: 'partnerAdvisorName', label: 'Nombre del asesor externo', type: 'text', placeholder: 'Ej. Lic. Ramírez', hint: 'Solo si elegiste "Otro / Externo".' },
        { name: 'cliente_id', label: 'Cliente (comprador)', type: 'select', sinOtros: true, search: true, searchSource: UI.remoteSources.client, options: [{ value: '', label: '— Sin cliente —' }, ...opcionesCliente(clients, 'buyerClient'), { value: '__externo__', label: 'Otro / Externo — escribir nombre' }] },
        { name: 'buyerExternalName', label: 'Nombre del cliente externo', type: 'text', placeholder: 'Ej. Juan Pérez', hint: 'Solo si elegiste "Otro / Externo".' },
        { name: 'sellerClient', label: 'Vendedor (propietario)', type: 'select', sinOtros: true, search: true, searchSource: UI.remoteSources.client, options: [{ value: '', label: '— Se toma del propietario —' }, ...opcionesCliente(clients, 'sellerClient'), { value: '__externo__', label: 'Otro / Externo — escribir nombre' }] },
        { name: 'sellerExternalName', label: 'Nombre del vendedor externo', type: 'text', placeholder: 'Ej. María López', hint: 'Solo si elegiste "Otro / Externo".' },
        { name: 'property', label: 'Propiedad', type: 'select', sinOtros: true, search: true, searchSource: UI.remoteSources.property, options: [{ value: '', label: '— Sin propiedad —' }, ...propertyOptions], hint: 'Al elegirla se completan el propietario/vendedor y el asesor captador.' },
        { name: 'valueOperation', label: 'Valor de operación', type: 'number' },
        { name: 'negotiation_offer', label: 'Propuesta inicial (oferta)', type: 'number' },
        { name: 'negotiation_notes', label: 'Notas', type: 'textarea', full: true },
        { name: 'fecha_cierre', label: 'Fecha estimada de cierre', type: 'datetime-local', hint: 'Fecha estimada o proyectada para la conclusión de la operación (firma de escrituras o contratos).' },
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
        wireBusinessForm(form);
        const procSel = form.querySelector('#fld-processType');
        const stageSel = form.querySelector('#fld-currentStage');
        if (procSel && stageSel) {
          const syncStages = () => {
            const opts = stageOptionsForNew(procSel.value);
            stageSel.innerHTML = opts.map((o) => `<option value="${UI.escapeHtml(o.value)}">${UI.escapeHtml(o.label)}</option>`).join('');
            if (opts.length && !opts.find((o) => o.value === stageSel.value)) {
              stageSel.value = opts[0].value;
            }
          };
          procSel.addEventListener('change', syncStages);
          syncStages();
        }

        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const values = UI.collectForm(e.target);
            const body = buildBusinessPayload(values, null);
            await API.businesses.create(body);
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