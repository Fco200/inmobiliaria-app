'use strict';

window.Pages = window.Pages || {};

// Tipos de documento reutilizados por el expediente del cliente.
const CLIENT_DOC_TYPES = [
  { value: 'identificacion', label: 'Identificación / INE' },
  { value: 'datos_personales', label: 'Datos personales' },
  { value: 'escrituras', label: 'Escrituras' },
  { value: 'avaluo', label: 'Avalúo' },
  { value: 'contratos', label: 'Contratos' },
  { value: 'comprobantes', label: 'Comprobantes' },
  { value: 'bancario', label: 'Bancario / pago' },
  { value: 'legal', label: 'Documentación legal' },
  { value: 'otros', label: 'Otros' },
];

function isBossUser() {
  const user = ApiClient.getStoredUser();
  return Boolean(user && user.role && ['admin', 'gerencia'].includes(user.role.code));
}

// ── Créditos que se usan en México (INFONAVIT, FOVISSSTE, bancos...) ────
const CREDIT_TYPES = [
  { value: 'infonavit', label: 'INFONAVIT', icon: '&#127968;', desc: 'Crédito que se paga desde tu subcuenta de vivienda' },
  { value: 'fovissste', label: 'FOVISSSTE', icon: '&#127962;', desc: 'Crédito hipotecario para servidores públicos' },
  { value: 'infonavit_fovissste', label: 'Combinado INFONAVIT + FOVISSSTE', icon: '&#129309;', desc: 'Se juntan ambos créditos como uno solo (muy usado en México)' },
  { value: 'credito_bancario', label: 'Crédito bancario', icon: '&#127974;', desc: 'Hipoteca de banco: BBVA, Banorte, Santander, Citibanamex...' },
  { value: 'credito_hipotecario', label: 'Crédito hipotecario (hipotecaria / SOFOM)', icon: '&#127977;', desc: 'Instituciones hipotecarias privadas' },
  { value: 'cofinavit', label: 'Cofinavit (INFONAVIT + banco)', icon: '&#129309;&#127974;', desc: 'INFONAVIT + crédito bancario que se suman' },
  { value: 'apoyo_infonavit', label: 'Apoyo INFONAVIT (antes "Infonavit Total")', icon: '&#11088;', desc: 'Crédito en pesos de INFONAVIT con tasa fija' },
  { value: 'contado', label: 'Contado / recursos propios', icon: '&#128176;', desc: 'Pago total en efectivo o con recursos propios' },
  { value: 'otro', label: 'Otro esquema', icon: '&#128203;' },
];
const MX_BANKS = ['BBVA', 'Banorte', 'Santander', 'Citibanamex', 'HSBC', 'Scotiabank', 'Inbursa', 'BanBajío', 'Banregio', 'Banco Azteca', 'Coppel', 'AFIRME', 'Sofom Hipotecaria', 'Otro banco'];
const CREDIT_ESTATUS = ['pendiente', 'solicitado', 'pre_aprobado', 'aprobado', 'otorgado'];
const CREDIT_ESTATUS_LABEL = {
  pendiente: 'Pendiente', solicitado: 'Solicitado', pre_aprobado: 'Pre-aprobado',
  aprobado: 'Aprobado', otorgado: 'Otorgado',
};
const creditInfo = (tipo) => CREDIT_TYPES.find((c) => c.value === tipo) || CREDIT_TYPES[CREDIT_TYPES.length - 1];

// Íconos por tipo de cliente para la tabla y las tarjetas de selección.
const CLIENT_TYPE_ICON = { vender: '&#127947;', comprar: '&#127968;', rentar: '&#128273;', alquilar: '&#128273;' };

// Nombre del grupo de campos según el tipo (vendedor vs comprador).
function clientFlow(type) {
  return String(type || 'comprar') === 'vender' ? 'seller' : 'buyer';
}

// Grupos de campos para los formularios filtrados por tipo.
const CLIENT_BASE_FIELDS = ['name', 'phone', 'email', 'contactMedium', 'status', 'funnelStage', 'notes'];
const CLIENT_SELLER_FIELDS = [
  'sellerInfo_operationType', 'sellerInfo_property', 'sellerInfo_propertyType', 'sellerInfo_location',
  'sellerInfo_hasMortgage', 'sellerInfo_mortgageInstitution', 'sellerInfo_debt', 'sellerInfo_requestedPrice',
  'sellerInfo_observations',
];
const CLIENT_BUYER_FIELDS = [
  'buyerInfo_desiredZone', 'buyerInfo_budget', 'buyerInfo_paymentMethod', 'buyerInfo_propertyType',
  'buyerInfo_desiredFeatures', 'buyerInfo_observations',
  'buyerInfo_mergeCredits', 'buyerInfo_creditStatus', 'buyerInfo_salaryConnection', 'buyerInfo_bank',
  'buyerInfo_downPayment', 'buyerInfo_subsidy', 'buyerInfo_ownResources', 'buyerInfo_totalFunding',
];

const CLIENT_TYPE_MAP = { comprador: 'comprar', vendedor: 'vender', arrendatario: 'rentar' };

// Modal inicial: ¿qué tipo de cliente es? (Vendedor o Comprador).
function askClientType(openForm, record) {
  const isEdit = Boolean(record);
  const current = isEdit ? String(record.type || 'comprar') : 'comprar';
  const activeKey = current === 'vender' ? 'vendedor' : (current === 'rentar' || current === 'alquilar' ? 'arrendatario' : 'comprador');
  const activeCls = (k) => (k === activeKey ? ' is-active' : '');
  const modal = UI.openModal({
    title: isEdit ? `Tipo de cliente — ${UI.escapeHtml((record.name || '').split(' ')[0])}` : 'Nuevo cliente',
    body: `
      <p class="text-muted" style="margin-top:0;">Cada tipo abre un formulario diferente, con los campos que le tocan al perfil.</p>
      <div class="client-type-grid">
        <button class="client-type-card${activeCls('comprador')}" type="button" data-type="comprador">
          <span class="client-type-icon">&#127968;</span>
          <span class="client-type-title">Comprador</span>
          <small>Quiere comprar una propiedad: con crédito (INFONAVIT, FOVISSSTE, banco...), contado o hipoteca.</small>
        </button>
        <button class="client-type-card${activeCls('vendedor')}" type="button" data-type="vendedor">
          <span class="client-type-icon">&#127947;</span>
          <span class="client-type-title">Vendedor</span>
          <small>Quiere vender (o rentar) su propiedad: datos del inmueble, hipoteca vigente, deuda y precio pedido.</small>
        </button>
        <button class="client-type-card${activeCls('arrendatario')}" type="button" data-type="arrendatario">
          <span class="client-type-icon">&#128273;</span>
          <span class="client-type-title">Arrendatario</span>
          <small>Busca una propiedad para rentar o alquilar.</small>
        </button>
      </div>
    `,
    size: 620,
  });
  modal.bodyEl.querySelectorAll('[data-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      UI.closeModal();
      openTypedForm(openForm, record, btn.dataset.type);
    });
  });
  return modal;
}

// Abre el formulario solo con los campos de ese tipo + el selector de créditos.
function openTypedForm(openForm, record, typeKey) {
  const typeValue = CLIENT_TYPE_MAP[typeKey] || 'comprar';
  const seller = typeValue === 'vender';
  const isEdit = Boolean(record);
  const allowedNames = CLIENT_BASE_FIELDS.concat(seller ? CLIENT_SELLER_FIELDS : CLIENT_BUYER_FIELDS);
  const hiddenFields = `<input type="hidden" name="type" value="${typeValue}">` +
    (seller ? '' : '<div id="credit-builder" style="grid-column:1/-1;"></div>');

  openForm(record, {
    title: `${isEdit ? 'Editar' : 'Nuevo'} cliente — ${seller ? 'Vendedor' : typeValue === 'rentar' ? 'Arrendatario' : 'Comprador'}`,
    allowedNames,
    hiddenFields,
    mount(form, rec, bodyEl) {
      if (!seller) {
        const builderEl = bodyEl.querySelector('#credit-builder');
        if (builderEl) mountCreditBuilder(form, builderEl, rec && (rec.buyerInfo || {}));
      }
    },
  });
}

// Selector visual de créditos de México + filas configurables + total automático.
function mountCreditBuilder(form, builderEl, buyerInfo) {
  const initial = (buyerInfo && Array.isArray(buyerInfo.credits)) ? buyerInfo.credits.slice() : [];
  const credits = initial.map((c) => ({ ...c }));

  builderEl.innerHTML = `
    <hr style="margin:4px 0 14px;border:none;border-top:1px solid var(--border);">
    <h4 style="margin:0 0 4px;">&#127991;&nbsp; Financiamiento del comprador</h4>
    <p class="text-muted" style="margin:0 0 12px;font-size:12.5px;">
      Toca el ícono del crédito que aplica al cliente para agregarlo (se pueden combinar varios).
    </p>
    <div class="credit-chips"></div>
    <div class="credit-list"></div>
    <button type="button" class="btn btn-secondary btn-sm" data-credit-add>+ Agregar crédito</button>
    <div class="credit-total"></div>
  `;

  const chipsEl = builderEl.querySelector('.credit-chips');
  const listEl = builderEl.querySelector('.credit-list');
  const totalEl = builderEl.querySelector('.credit-total');
  const addBtn = builderEl.querySelector('[data-credit-add]');

  chipsEl.innerHTML = CREDIT_TYPES.map((c) => `
    <button type="button" class="credit-chip-btn" data-tipo="${c.value}" title="${UI.escapeHtml(c.desc)}">
      <span class="credit-chip-icon">${c.icon}</span>
      <span class="credit-chip-name">${UI.escapeHtml(c.label)}</span>
    </button>`).join('');

  const readFromDom = () => {
    const rows = Array.from(listEl.querySelectorAll('.credit-row'));
    credits.length = 0;
    rows.forEach((row) => credits.push({
      tipo: row.querySelector('[data-c-tipo]').value,
      monto: Number(row.querySelector('[data-c-monto]').value) || 0,
      institucion: row.querySelector('[data-c-institucion]').value.trim(),
      estatus: row.querySelector('[data-c-estatus]').value,
      observaciones: row.querySelector('[data-c-obs]').value.trim(),
    }));
  };

  const rowHTML = (c, i) => `
    <div class="credit-row">
      <select class="form-control" name="credit_tipo_${i}" data-c-tipo>
        ${CREDIT_TYPES.map((t) => `<option value="${t.value}" ${t.value === (c.tipo || 'otro') ? 'selected' : ''}>${t.icon} ${UI.escapeHtml(t.label)}</option>`).join('')}
      </select>
      <input class="form-control" name="credit_monto_${i}" data-c-monto type="number" min="0" placeholder="Monto aprox. $" value="${c.monto ? Number(c.monto) : ''}">
      <input class="form-control" name="credit_institucion_${i}" data-c-institucion type="text" placeholder="Institución / banco" list="mx-banks" value="${UI.escapeHtml(c.institucion || '')}">
      <select class="form-control" name="credit_estatus_${i}" data-c-estatus>
        ${CREDIT_ESTATUS.map((s) => `<option value="${s}" ${s === (c.estatus || 'pendiente') ? 'selected' : ''}>${CREDIT_ESTATUS_LABEL[s]}</option>`).join('')}
      </select>
      <input class="form-control" name="credit_observaciones_${i}" data-c-obs type="text" placeholder="Notas (ej. monto de subcuenta...)" style="min-width:140px;" value="${UI.escapeHtml(c.observaciones || '')}">
      <button type="button" class="btn btn-danger btn-sm" data-c-del title="Quitar crédito">&#10005;</button>
    </div>`;

  const render = () => {
    listEl.innerHTML = credits.map(rowHTML).join('');
    listEl.querySelectorAll('[data-c-del]').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        readFromDom();
        credits.splice(i, 1);
        render();
      });
    });
    listEl.querySelectorAll('[data-c-monto], [data-c-tipo]').forEach((el) => {
      el.addEventListener('input', updateTotal);
    });
    updateTotal();
  };

  const numOf = (sel) => {
    const el = form.querySelector(sel);
    return el ? (Number(el.value) || 0) : 0;
  };

  function updateTotal() {
    let creditSum = 0;
    listEl.querySelectorAll('[data-c-monto]').forEach((el) => { creditSum += Number(el.value) || 0; });
    const merge = form.querySelector('[name="buyerInfo_mergeCredits"]');
    const total = creditSum
      + numOf('[name="buyerInfo_subsidy"]')
      + numOf('[name="buyerInfo_downPayment"]')
      + numOf('[name="buyerInfo_ownResources"]');
    const totalInput = form.querySelector('[name="buyerInfo_totalFunding"]');
    if (totalInput) totalInput.value = total;
    totalEl.innerHTML = `
      <strong>Total de financiamiento del cliente:</strong> ${Format.currency(total)}
      ${merge && merge.checked ? '<span class="badge badge-warning" style="margin-left:6px;">&#129309; Créditos combinados</span>' : ''}
    `;
  }

  chipsEl.querySelectorAll('.credit-chip-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      readFromDom();
      credits.push({ tipo: btn.dataset.tipo, monto: 0, institucion: '', estatus: 'pendiente', observaciones: '' });
      render();
    });
  });
  addBtn.addEventListener('click', () => {
    readFromDom();
    credits.push({ tipo: 'otro', monto: 0, institucion: '', estatus: 'pendiente', observaciones: '' });
    render();
  });

  // El total también se actualiza al cambiar enganche / subcuenta / recursos.
  ['buyerInfo_subsidy', 'buyerInfo_downPayment', 'buyerInfo_ownResources', 'buyerInfo_mergeCredits'].forEach((n) => {
    const el = form.querySelector(`[name="${n}"]`);
    if (el) el.addEventListener('input', updateTotal);
  });

  if (!form.querySelector('#mx-banks')) {
    const dl = document.createElement('datalist');
    dl.id = 'mx-banks';
    dl.innerHTML = MX_BANKS.map((b) => `<option value="${UI.escapeHtml(b)}">`).join('');
    form.appendChild(dl);
  }

  render();
}

window.Pages.clients = {
  title: 'Clientes',

  async render(container) {
    let users = [];
    try {
      const result = await API.users.list({ limit: 100 });
      users = result.data;
    } catch (error) {
      users = [];
    }

    const userOptions = users.map((u) => ({ value: u._id, label: u.name }));

    /* ── Acciones rápidas de contacto (CRM móvil) ─────────────────────── */
    const actionButtons = (record) => {
      const digits = Format.digits(record.phone || '');
      let html = '';
      if (digits) {
        html += `
          <a class="btn btn-sm crm-btn-wa" href="${Format.whatsappLink(digits)}" target="_blank" rel="noopener"
             data-action="whatsapp" data-record="${record._id}" title="Enviar WhatsApp">WhatsApp</a>
          <a class="btn btn-secondary btn-sm" href="${Format.telLink(digits)}"
             data-action="call" data-record="${record._id}" title="Llamar y registrar">Llamar</a>`;
      }
      html += `
        <button class="btn btn-secondary btn-sm" data-action="docs" data-record="${record._id}" title="Expediente de documentos">Docs</button>
        <button class="btn btn-secondary btn-sm" data-action="vcard" data-record="${record._id}" title="Guardar en contactos del teléfono">Contacto</button>
        <button class="btn btn-secondary btn-sm" data-action="history" data-record="${record._id}" title="Notas e historial CRM">Historial</button>`;
      return html;
    };

    crudPage(container, {
      title: 'Clientes',
      newLabel: 'Nuevo cliente',
      service: {
        list: (params) => API.clients.list(params),
        create: (body) => API.clients.create(body),
        update: (id, body) => API.clients.update(id, body),
        remove: (id) => API.clients.remove(id),
      },
      statusOptions: [
        { value: 'activo', label: 'Activo' },
        { value: 'inactivo', label: 'Inactivo' },
        { value: 'concluido', label: 'Concluido' },
      ],
      columns: [
        { key: 'name', label: 'Nombre', render: (r) => `${UI.escapeHtml(r.name)}<br><small class="text-muted">${UI.escapeHtml(r.phone || '')}</small>` },
        {
          key: 'type',
          label: 'Tipo',
          render: (r) => `${CLIENT_TYPE_ICON[r.type] || ''} ${UI.badge(String(r.type || '').replace(/_/g, ' '), 'info')}`,
        },
        { key: 'email', label: 'Correo', render: (r) => UI.escapeHtml(r.email || '—') },
        {
          key: 'credits',
          label: 'Financiamiento',
          render: (r) => {
            const bi = r.buyerInfo || {};
            const credits = bi.credits || [];
            if (!credits.length && !bi.bank) return '<span class="text-muted">—</span>';
            const chips = credits.map((c) => {
              const info = creditInfo(c.tipo);
              return `<span class="credit-chip" title="${UI.escapeHtml(info.label)}">${info.icon} ${UI.escapeHtml(info.label)}</span>`;
            }).join(' ');
            const total = Number(bi.totalFunding) || 0;
            const merge = bi.mergeCredits ? ' <span class="badge badge-warning" title="Créditos combinados">&#129309;</span>' : '';
            return `${chips}${merge}${total ? `<div class="text-muted" style="font-size:11px;">Financiamiento: <strong>${Format.currency(total)}</strong></div>` : ''}`;
          },
        },
        { key: 'status', label: 'Estado', render: (r) => UI.statusBadge(r.status) },
        {
          key: 'funnelStage',
          label: 'Etapa del embudo',
          render: (r) => UI.badge(String(r.funnelStage || 'prospecto').replace(/_/g, ' '), 'primary'),
        },
        {
          key: 'responsibleUser',
          label: 'Asesor',
          render: (r) => UI.escapeHtml(r.responsibleUser ? r.responsibleUser.name : '—'),
        },
      ],
      fields: [
        { name: 'name', label: 'Nombre completo', type: 'text', required: true, full: true },
        { name: 'type', label: '¿Qué necesita el cliente?', type: 'select', options: ['vender', 'comprar', 'rentar', 'alquilar'] },
        { name: 'metodoPago', label: 'Método de pago', type: 'select', options: ['infonavit', 'credito_bancario', 'efectivo', 'credito_hipotecario', 'otro'] },
        { name: 'funnelStage', label: 'Etapa del embudo', type: 'select', options: ['prospecto', 'cita', 'negociacion', 'promesa', 'cierre'] },
        { name: 'phone', label: 'Teléfono (con lada)', type: 'tel', placeholder: '6121234567' },
        { name: 'email', label: 'Correo', type: 'email' },
        { name: 'contactMedium', label: 'Medio de contacto', type: 'select', options: ['redes', 'referido', 'lona', 'tarjeta', 'sitio_web'] },
        { name: 'status', label: 'Estado', type: 'select', options: ['activo', 'inactivo', 'concluido'] },
        { name: 'notes', label: 'Notas', type: 'textarea', full: true },

        { name: 'sellerInfo_operationType', label: 'Operación (vendedor)', type: 'select', options: [{ value: '', label: '—' }, 'venta', 'renta'], value: (r) => (r.sellerInfo || {}).operationType || '' },
        { name: 'sellerInfo_property', label: 'Propiedad que vende', type: 'text', value: (r) => (r.sellerInfo || {}).property || '' },
        { name: 'sellerInfo_propertyType', label: 'Tipo de inmueble', type: 'select', options: [{ value: '', label: '—' }, 'casa', 'departamento', 'local', 'bodega', 'rancho', 'terreno', 'playa', 'otro'], value: (r) => (r.sellerInfo || {}).propertyType || '' },
        { name: 'sellerInfo_location', label: 'Ubicación', type: 'text', value: (r) => (r.sellerInfo || {}).location || '' },
        { name: 'sellerInfo_hasMortgage', label: '¿Tiene hipoteca?', type: 'checkbox', value: (r) => Boolean((r.sellerInfo || {}).hasMortgage) },
        { name: 'sellerInfo_mortgageInstitution', label: 'Institución hipotecaria', type: 'text', value: (r) => (r.sellerInfo || {}).mortgageInstitution || '' },
        { name: 'sellerInfo_debt', label: 'Deuda', type: 'number', value: (r) => (r.sellerInfo || {}).debt || 0 },
        { name: 'sellerInfo_requestedPrice', label: 'Precio solicitado', type: 'number', value: (r) => (r.sellerInfo || {}).requestedPrice || 0 },
        { name: 'sellerInfo_observations', label: 'Observaciones del vendedor', type: 'textarea', full: true, value: (r) => (r.sellerInfo || {}).observations || '' },

        { name: 'buyerInfo_desiredZone', label: 'Zona deseada', type: 'text', value: (r) => (r.buyerInfo || {}).desiredZone || '' },
        { name: 'buyerInfo_budget', label: 'Presupuesto', type: 'number', value: (r) => (r.buyerInfo || {}).budget || 0 },
        { name: 'buyerInfo_paymentMethod', label: 'Forma de pago', type: 'text', value: (r) => (r.buyerInfo || {}).paymentMethod || '' },
        { name: 'buyerInfo_propertyType', label: 'Tipo de propiedad buscada', type: 'select', options: [{ value: '', label: '—' }, 'casa', 'departamento', 'local', 'bodega', 'rancho', 'terreno', 'playa', 'otro'], value: (r) => (r.buyerInfo || {}).propertyType || '' },
        { name: 'buyerInfo_desiredFeatures', label: 'Características deseadas', type: 'textarea', full: true, value: (r) => (r.buyerInfo || {}).desiredFeatures || '' },
        { name: 'buyerInfo_observations', label: 'Observaciones del comprador', type: 'textarea', full: true, value: (r) => (r.buyerInfo || {}).observations || '' },

        // ── Financiamiento del comprador (créditos de México) ────────────
        { name: 'buyerInfo_mergeCredits', label: 'Combinar créditos (ej. INFONAVIT + FOVISSSTE)', type: 'checkbox', hint: 'Marca esta casilla si el cliente juntará dos créditos para pagar', value: (r) => Boolean((r.buyerInfo || {}).mergeCredits) },
        { name: 'buyerInfo_creditStatus', label: 'Estatus del financiamiento', type: 'select', options: [{ value: 'sin_aplica', label: 'Aún no aplica' }, 'solicitado', 'pre_aprobado', 'aprobado', 'en_escrituracion'], value: (r) => (r.buyerInfo || {}).creditStatus || 'sin_aplica' },
        { name: 'buyerInfo_salaryConnection', label: 'Vínculo laboral', type: 'select', options: ['independiente', 'relacion_laboral', 'rfc_moral', 'otro'], value: (r) => (r.buyerInfo || {}).salaryConnection || 'independiente' },
        { name: 'buyerInfo_bank', label: 'Banco (si aplica)', type: 'text', placeholder: 'BBVA, Banorte, Santander...', hint: 'Se usa cuando el crédito es bancario', value: (r) => (r.buyerInfo || {}).bank || '' },
        { name: 'buyerInfo_downPayment', label: 'Enganche', type: 'number', value: (r) => (r.buyerInfo || {}).downPayment || 0 },
        { name: 'buyerInfo_subsidy', label: 'Subcuenta de vivienda / subsidios', type: 'number', hint: 'Dinero a favor en tu subcuenta (INFONAVIT/FOVISSSTE) o subsidio', value: (r) => (r.buyerInfo || {}).subsidy || 0 },
        { name: 'buyerInfo_ownResources', label: 'Recursos propios adicionales', type: 'number', hint: 'Apoyo familiar u otros recursos en efectivo', value: (r) => (r.buyerInfo || {}).ownResources || 0 },
        { name: 'buyerInfo_totalFunding', label: 'Total de financiamiento (automático)', type: 'number', hint: 'Se calcula solo: créditos + subcuenta + enganche + recursos', value: (r) => (r.buyerInfo || {}).totalFunding || 0 },
      ],
      formData(values, record, form) {
        const { sellerInfo_operationType: sOp, sellerInfo_property: sProp, sellerInfo_propertyType: sPT, sellerInfo_location: sLoc, sellerInfo_hasMortgage: sMort, sellerInfo_mortgageInstitution: sMI, sellerInfo_debt: sDebt, sellerInfo_requestedPrice: sRP, sellerInfo_observations: sObs, buyerInfo_desiredZone: bZone, buyerInfo_budget: bBud, buyerInfo_paymentMethod: bPay, buyerInfo_propertyType: bPT, buyerInfo_desiredFeatures: bFeat, buyerInfo_observations: bObs, buyerInfo_mergeCredits: bMerge, buyerInfo_creditStatus: bCredStatus, buyerInfo_salaryConnection: bSal, buyerInfo_bank: bBank, buyerInfo_downPayment: bDown, buyerInfo_subsidy: bSubsidy, buyerInfo_ownResources: bOwn, buyerInfo_totalFunding: bTotal, ...rest } = values;
        const body = { ...rest };

        // Intervalos vacíos se normalizan a número seguro.
        const emptyToNum = (v, d) => (v === '' || v === null || v === undefined ? d : Number(v));

        // Créditos del comprador (filas dinámicas del formulario).
        let credits = [];
        if (form) {
          const grouped = new Map();
          Array.from(form.elements).forEach((el) => {
            const m = el.name && el.name.match(/^credit_(\w+)_(\d+)$/);
            if (!m) return;
            const field = m[1];
            const idx = Number(m[2]);
            if (!grouped.has(idx)) grouped.set(idx, {});
            const row = grouped.get(idx);
            if (field === 'monto') row.monto = emptyToNum(el.value, 0);
            else if (field === 'institucion') row.institucion = String(el.value || '').trim();
            else if (field === 'estatus') row.estatus = String(el.value || '').trim();
            else if (field === 'observaciones') row.observaciones = String(el.value || '').trim();
            else if (field === 'tipo') row.tipo = String(el.value || 'otro');
          });
          credits = Array.from(grouped.values())
            .map((r) => ({
              tipo: r.tipo || 'otro',
              monto: r.monto || 0,
              institucion: r.institucion || '',
              estatus: r.estatus || 'pendiente',
              observaciones: r.observaciones || '',
            }))
            .filter((r) => r.tipo || r.monto || r.institucion || r.estatus || r.observaciones);
        }

        const merge = Boolean(bMerge);
        const downPayment = emptyToNum(bDown, 0);
        const subsidy = emptyToNum(bSubsidy, 0);
        const ownResources = emptyToNum(bOwn, 0);
        const creditMonto = credits.reduce((acc, c) => acc + (Number(c.monto) || 0), 0);
        const totalFunding = creditMonto + subsidy + downPayment + ownResources;

        body.sellerInfo = {
          operationType: sOp || null,
          property: sProp || '',
          propertyType: sPT || null,
          location: sLoc || '',
          hasMortgage: Boolean(sMort),
          mortgageInstitution: sMI || '',
          debt: sDebt || 0,
          requestedPrice: sRP || 0,
          observations: sObs || '',
        };
        body.buyerInfo = {
          desiredZone: bZone || '',
          budget: emptyToNum(bBud, 0),
          paymentMethod: bPay || '',
          propertyType: bPT || null,
          desiredFeatures: bFeat || '',
          observations: bObs || '',
          mergeCredits: merge,
          creditStatus: bCredStatus || 'sin_aplica',
          salaryConnection: bSal || 'independiente',
          bank: bBank || '',
          downPayment,
          subsidy,
          ownResources,
          totalFunding,
          credits,
        };
        if (!body.type) body.type = 'comprar';
        return body;
      },
      defaultParams: {},
      extraActions: (record) => actionButtons(record),
      async onExtraAction(record, btn) {
        const action = btn.dataset.action;
        if (action === 'docs') return openClientDocuments(record);
        if (action === 'vcard') return saveContactVcf(record);
        if (action === 'history') return openCrmHistory(record);
        if (action === 'call') return registerInteraction(record, 'llamada');
        if (action === 'whatsapp') return registerInteraction(record, 'whatsapp');
        return undefined;
      },
      onNew: (openForm) => askClientType(openForm, null),
      onEdit: (record, openForm) => askClientType(openForm, record),
      onRemove: true,
    });

    /* ── Expediente de documentos del cliente ──────────────────────────── */
    function openClientDocuments(record) {
      const modal = UI.openModal({
        title: `Expediente — ${UI.escapeHtml(record.name)}`,
        body: '<div class="loading">Cargando documentos...</div>',
        size: 860,
      });
      const bodyEl = modal.bodyEl;

      const typeLabel = (t) => {
        const found = CLIENT_DOC_TYPES.find((x) => x.value === t);
        return found ? found.label : (t || 'otros');
      };

      async function renderList() {
        try {
          const result = await API.documents.list({ client: record._id, limit: 100 });
          const docs = result.data || [];
          const listHtml = docs.length
            ? `<div class="doc-grid">${docs.map((d) => `
                <div class="card doc-card">
                  ${d.fileUrl && /\.(png|jpe?g|gif|webp|avif|jfif)$/i.test(d.fileUrl)
                    ? `<img src="${window.AppConfig.resolveUrl(d.fileUrl)}" alt="" class="doc-thumb" loading="lazy">`
                    : '<div class="doc-thumb doc-thumb-file">&#128196;</div>'}
                  <div style="padding:10px;">
                    <strong style="font-size:13px;">${UI.escapeHtml(d.name)}</strong><br>
                    ${UI.badge(typeLabel(d.type), 'info')} ${UI.statusBadge(d.status)}
                    <div class="text-muted" style="font-size:11px;margin-top:6px;">${Format.date(d.date)}</div>
                  </div>
                  <div style="padding:0 10px 10px;display:flex;gap:4px;flex-wrap:wrap;">
                    ${d.fileUrl ? `<a class="btn btn-secondary btn-sm" href="${window.AppConfig.resolveUrl(d.fileUrl)}" target="_blank" rel="noopener">Ver</a>` : ''}
                    ${isBossUser() ? `
                      <button class="btn btn-success btn-sm" data-validate="${d._id}" title="Validar documento">✓</button>
                      <button class="btn btn-danger btn-sm" data-reject="${d._id}" title="Rechazar documento">✗</button>` : ''}
                    <button class="btn btn-danger btn-sm" data-del-doc="${d._id}" title="Eliminar">🗑</button>
                  </div>
                </div>`).join('')}</div>`
            : '<p class="text-muted">Aún no hay documentos para este cliente.</p>';

          bodyEl.innerHTML = `
            <form id="client-doc-form" novalidate>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 14px;">
                ${UI.field('name', 'Nombre del documento', { required: true, placeholder: 'INE por frente...', hint: 'Vacío = usa el nombre del archivo' })}
                ${UI.field('type', 'Tipo', { type: 'select', options: CLIENT_DOC_TYPES })}
                ${UI.field('file', 'Archivo (PDF, imagen o Word)', { type: 'file', required: true, full: true })}
              </div>
              <button class="btn btn-primary" type="submit">&#8613;&nbsp; Subir documento</button>
            </form>
            <hr style="margin:16px 0;border:none;border-top:1px solid var(--border);">
            <h4 style="margin:0 0 10px;">Documentos (${docs.length})</h4>
            ${listHtml}
          `;

          bodyEl.querySelectorAll('[data-validate]').forEach((b) => attachStatusChange(b, record, 'validado'));
          bodyEl.querySelectorAll('[data-reject]').forEach((b) => attachStatusChange(b, record, 'rechazado'));
          bodyEl.querySelectorAll('[data-del-doc]').forEach((b) => {
            b.addEventListener('click', async () => {
              const ok = await UI.confirm('¿Eliminar este documento del expediente?');
              if (!ok) return;
              try {
                await API.documents.remove(b.dataset.delDoc);
                UI.toast('Documento eliminado', 'success');
                renderList();
              } catch (error) {
                UI.toast(error.message, 'error');
              }
            });
          });

          const docForm = bodyEl ? bodyEl.querySelector('#client-doc-form') : null;
          if (docForm) docForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const values = UI.collectForm(e.target);
            const fileInput = e.target.querySelector('[name="file"]');
            const file = fileInput && fileInput.files ? fileInput.files[0] : null;
            if (!file) {
              UI.toast('Selecciona un archivo', 'warning');
              return;
            }
            try {
              await API.documents.upload(file, {
                client: record._id,
                name: values.name || '',
                type: values.type,
                status: 'recibido',
              });
              UI.toast('Documento subido al expediente', 'success');
              renderList();
            } catch (error) {
              UI.toast(error.message, 'error');
            }
          });
        } catch (error) {
          bodyEl.innerHTML = UI.errorAlert(error.message);
        }
      }

      renderList();

      async function attachStatusChange(btn, rec, status) {
        btn.addEventListener('click', async () => {
          try {
            await API.documents.update(btn.dataset[status === 'validado' ? 'validate' : 'reject'], { status });
            UI.toast(`Documento ${status}`, 'success');
            renderList();
          } catch (error) {
            UI.toast(error.message, 'error');
          }
        });
      }
    }

    /* ── Guardar cliente en los contactos del teléfono (.vcf) ─────────── */
    function saveContactVcf(record) {
      const digits = Format.digits(record.phone || '');
      const email = record.email || '';
      const lines = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${record.name}`,
        `N:${record.name.split(' ').slice(1).join(' ')};${record.name.split(' ')[0] || ''};;;`,
      ];
      if (digits) lines.push(`TEL;TYPE=CELL:+52${digits}`);
      if (email) lines.push(`EMAIL;TYPE=INTERNET:${email}`);
      lines.push(`ORG:INMOBLES`);
      lines.push(`NOTE:Cliente CRM · Estado: ${record.status || '—'} · Etapa: ${String(record.funnelStage || '—').replace(/_/g, ' ')}`);
      lines.push('END:VCARD');

      const blob = new Blob([lines.join('\r\n')], { type: 'text/vcard;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${String(record.name).replace(/[^a-zA-Z0-9 áéíóúÁÉÍÓÚñÑ.-]/g, '').trim() || 'cliente'}.vcf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 500);
      UI.toast('Tarjeta de contacto descargada: ábrela para agregarlo a tus contactos', 'success');
    }

    /* ── Registrar llamada / WhatsApp con notas ────────────────────────── */
    function registerInteraction(record, channel) {
      const outcomes = channel === 'llamada'
        ? ['contestó', 'no contestó', 'buzón', 'número inválido', 'agendó cita']
        : ['sin respuesta'];
      const modal = UI.openModal({
        title: channel === 'llamada'
          ? `Registrar llamada — ${UI.escapeHtml(record.name)}`
          : `Registro de WhatsApp — ${UI.escapeHtml(record.name)}`,
        body: `
          ${channel === 'whatsapp' ? '<p class="text-muted" style="margin-top:0;">Se abrió WhatsApp en otra pestaña. Al terminar, deja una nota del seguimiento.</p>' : '<p class="text-muted" style="margin-top:0;">La llamada se inició con la app de teléfono. Al colgar, registra el resultado.</p>'}
          <form id="interaction-form" novalidate>
            ${UI.field('outcome', 'Resultado', { type: 'select', options: [{ value: '', label: '— Selecciona —' }, ...outcomes.map((o) => ({ value: o, label: o }))] })}
            ${UI.field('notes', 'Notas del seguimiento (CRM)', { type: 'textarea', placeholder: 'Ej. Le interesa la casa de la zona norte, enviar información el viernes...', full: true })}
          </form>
        `,
        footer: `
          <button class="btn btn-secondary" type="button" data-skip>Sin nota</button>
          <button class="btn btn-primary" type="submit" form="interaction-form">Guardar registro</button>
        `,
        size: 560,
      });

      const overlay = modal.bodyEl ? modal.bodyEl.closest('#modal-overlay') : null;
      if (overlay) {
        const skipBtn = overlay.querySelector('[data-skip]');
        if (skipBtn) skipBtn.addEventListener('click', () => UI.closeModal());
      }
      const form = modal.bodyEl ? modal.bodyEl.querySelector('#interaction-form') : null;
      if (form) form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const values = UI.collectForm(e.target);
        try {
          await API.interactions.create({
            client: record._id,
            channel,
            outcome: values.outcome || null,
            notes: values.notes || '',
          });
          UI.toast('Interacción guardada en el CRM', 'success');
          UI.closeModal();
        } catch (error) {
          UI.toast(error.message, 'error');
        }
      });
    }

    /* ── Historial CRM: actividad automática + interacciones manuales ──── */
    async function openCrmHistory(record) {
      UI.openModal({
        title: `Historial CRM — ${UI.escapeHtml(record.name)}`,
        body: '<div class="loading">Cargando historial...</div>',
        size: 640,
      });
      try {
        const [activityRes, interactionsRes] = await Promise.all([
          API.activity.list({ entityType: 'Client', entityId: record._id, limit: 50 }).catch(() => ({ data: [] })),
          API.interactions.list({ client: record._id, limit: 50 }).catch(() => ({ data: [] })),
        ]);

        const events = [
          ...(activityRes.data || []).map((a) => ({
            date: a.createdAt,
            icon: '&#128221;',
            title: String(a.action || '').replace(/_/g, ' '),
            detail: a.message || '',
            who: a.user ? a.user.name : '',
          })),
          ...(interactionsRes.data || []).map((i) => ({
            date: i.createdAt,
            icon: i.channel === 'whatsapp' ? '&#128172;' : (i.channel === 'nota' ? '&#128196;' : '&#128222;'),
            title: `Interacción: ${i.channel}${i.outcome ? ` (${i.outcome})` : ''}`,
            detail: i.notes || '(sin notas)',
            who: i.user ? i.user.name : '',
          })),
        ].sort((a, b) => new Date(b.date) - new Date(a.date));

        const body = document.querySelector('#modal-overlay [data-body]');
        if (!body) return;
        if (!events.length) {
          body.innerHTML = '<p class="text-muted">Sin actividad ni interacciones registradas.</p>';
          return;
        }
        body.innerHTML = `
          <ul class="timeline">
            ${events.map((ev) => `
              <li>
                <strong>${ev.icon} ${UI.escapeHtml(ev.title)}</strong>
                <div class="text-muted" style="font-size:12px;">${Format.dateTime(ev.date)} · ${UI.escapeHtml(ev.who)}</div>
                <div style="font-size:13px;">${UI.escapeHtml(ev.detail)}</div>
              </li>`).join('')}
          </ul>
        `;
      } catch (error) {
        const body = document.querySelector('#modal-overlay [data-body]');
        if (body) body.innerHTML = UI.errorAlert(error.message);
      }
    }
  },
};
