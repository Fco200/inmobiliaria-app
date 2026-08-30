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
          render: (r) => UI.badge(String(r.type || '').replace(/_/g, ' '), 'info'),
        },
        { key: 'email', label: 'Correo', render: (r) => UI.escapeHtml(r.email || '—') },
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
      ],
      formData(values) {
        const { sellerInfo_operationType: sOp, sellerInfo_property: sProp, sellerInfo_propertyType: sPT, sellerInfo_location: sLoc, sellerInfo_hasMortgage: sMort, sellerInfo_mortgageInstitution: sMI, sellerInfo_debt: sDebt, sellerInfo_requestedPrice: sRP, sellerInfo_observations: sObs, buyerInfo_desiredZone: bZone, buyerInfo_budget: bBud, buyerInfo_paymentMethod: bPay, buyerInfo_propertyType: bPT, buyerInfo_desiredFeatures: bFeat, buyerInfo_observations: bObs, ...rest } = values;
        const body = { ...rest };
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
          budget: bBud || 0,
          paymentMethod: bPay || '',
          propertyType: bPT || null,
          desiredFeatures: bFeat || '',
          observations: bObs || '',
        };
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
      onEdit: true,
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
      lines.push(`ORG:INMOBILES`);
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
