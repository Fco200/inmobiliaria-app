'use strict';

window.Pages = window.Pages || {};

// Etapas del embudo inmobiliario con su etiqueta y color de tarjeta.
const CLIENT_STAGES = [
  { key: 'PROSPECTO', label: 'Prospecto', color: '#64748b' },
  { key: 'PERFILADO', label: 'Perfilado', color: '#5B2D8E' },
  { key: 'SEGUIMIENTO', label: 'Seguimiento', color: '#0ea5e9' },
  { key: 'CITA', label: 'Cita', color: '#d97706' },
  { key: 'NEGOCIACION_CIERRE', label: 'Negociación / Cierre', color: '#1f9d55' },
  { key: 'POSTVENTA', label: 'Postventa', color: '#9333ea' },
  { key: 'DESCARTADO', label: 'Descartado', color: '#dc2626' },
];

const FLOW_ORDER = ['PROSPECTO', 'PERFILADO', 'SEGUIMIENTO', 'CITA', 'NEGOCIACION_CIERRE', 'POSTVENTA'];
const CLIENT_MEDIOS = ['WhatsApp', 'Facebook', 'Llamada', 'Portal', 'Lona', 'Recomendación', 'Otro'];
const CLIENT_SERVICIOS = ['Comprar', 'Vender', 'Rentar', 'Otro'];
const CLIENT_FORMAS_PAGO = ['Contado', 'Efectivo', 'Infonavit', 'Fovissste', 'Bancario', 'Otro'];

function stageInfo(key) {
  return CLIENT_STAGES.find((s) => s.key === key) || { key: key || 'PROSPECTO', label: key || 'Prospecto', color: '#64748b' };
}

function flowIndexOf(key) {
  return FLOW_ORDER.indexOf(key);
}

function previousOf(key) {
  const i = flowIndexOf(key);
  return i > 0 ? FLOW_ORDER[i - 1] : null;
}

function nextOf(key) {
  const i = flowIndexOf(key);
  return i >= 0 && i < FLOW_ORDER.length - 1 ? FLOW_ORDER[i + 1] : null;
}

function isBossUser() {
  const user = ApiClient.getStoredUser();
  return Boolean(user && user.role && ['admin', 'gerencia'].includes(user.role.code));
}

window.Pages.clients = {
  title: 'Clientes',

  async render(container) {
    if (!container) return;
    const state = { q: '', page: 1, etapaActual: '', loading: false, counts: {} };
    let users = [];
    if (isBossUser()) {
      try {
        const result = await API.users.list({ limit: 100 });
        users = (result && result.data) || [];
      } catch (error) {
        users = [];
      }
    }
    const userOptions = users.map((u) => ({ value: u._id, label: u.name }));

    container.innerHTML = `
      <div class="pipeline-strip" id="clients-pipeline">${pipelineHTML()}</div>
      <div class="clients-toolbar">
        <input class="form-control" id="clients-search" type="search" placeholder="Buscar por nombre, teléfono o correo…">
        <select class="form-control" id="clients-stage-filter">
          <option value="">Ver Todos</option>
          ${CLIENT_STAGES.map((s) => `<option value="${s.key}">${s.label}</option>`).join('')}
        </select>
        <button class="btn btn-primary" id="clients-add" type="button">+ Nuevo cliente</button>
      </div>
      <div id="clients-grid" class="client-grid"></div>
      <div id="clients-pagination"></div>
    `;

    const gridEl = container.querySelector('#clients-grid');
    const paginationEl = container.querySelector('#clients-pagination');
    const searchEl = container.querySelector('#clients-search');
    const filterEl = container.querySelector('#clients-stage-filter');
    const addBtn = container.querySelector('#clients-add');
    const pipelineEl = container.querySelector('#clients-pipeline');

    const esc = (v) => UI.escapeHtml(v == null ? '' : v);

    function pipelineHTML() {
      return `
        <button class="pipeline-step pipeline-all${state.etapaActual === '' ? ' is-active' : ''}" data-stage="" type="button" style="--pipeline-color:var(--primary);">
          <span class="pipeline-label">Ver Todos</span>
          <span class="pipeline-count" data-count="total">0</span>
        </button>
        ${CLIENT_STAGES.map((s) => `
          <button class="pipeline-step${state.etapaActual === s.key ? ' is-active' : ''}" data-stage="${s.key}" type="button" style="--pipeline-color:${s.color};">
            <span class="pipeline-label">${s.label}</span>
            <span class="pipeline-count" data-count="${s.key}">0</span>
          </button>`).join('')}
      `;
    }

    function renderPipelineActive() {
      pipelineEl.querySelectorAll('.pipeline-step').forEach((btn) => {
        const active = btn.dataset.stage === state.etapaActual;
        btn.classList.toggle('is-active', active);
      });
      if (filterEl) filterEl.value = state.etapaActual;
    }

    async function loadCounts() {
      try {
        const result = await API.clients.conteoEtapas();
        state.counts = (result && result.data) || {};
      } catch (error) {
        state.counts = {};
      }
      const total = state.counts.total
        || CLIENT_STAGES.reduce((sum, s) => sum + (Number(state.counts[s.key]) || 0), 0);
      pipelineEl.querySelectorAll('.pipeline-count').forEach((el) => {
        el.textContent = el.dataset.count === 'total'
          ? String(total)
          : String(Number(state.counts[el.dataset.count]) || 0);
      });
    }

    let searchTimer = null;
    if (searchEl) searchEl.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.q = searchEl.value.trim(); state.page = 1; load(); }, 350);
    });
    if (filterEl) filterEl.addEventListener('change', () => {
      state.etapaActual = filterEl.value;
      state.page = 1;
      renderPipelineActive();
      load();
    });
    if (addBtn) addBtn.addEventListener('click', () => openQuickCreate());
    if (pipelineEl) pipelineEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.pipeline-step');
      if (!btn || !pipelineEl.contains(btn)) return;
      state.etapaActual = btn.dataset.stage || '';
      state.page = 1;
      renderPipelineActive();
      load();
    });

    async function load() {
      if (state.loading) return;
      state.loading = true;
      gridEl.innerHTML = '<div class="loading">Cargando clientes…</div>';
      try {
        const result = await API.clients.list({ q: state.q || undefined, page: state.page, limit: 16, etapaActual: state.etapaActual || undefined });
        const items = (result && result.data) || [];
        const meta = (result && result.meta) || {};
        state.page = meta.page || 1;

        if (!items.length) {
          gridEl.innerHTML = `
            <div class="clients-empty">
              ${state.q || state.etapaActual
                ? '<p class="text-muted">Sin resultados para los filtros actuales.</p>'
                : '<p class="text-muted">Sin clientes aún. Registra tu primer cliente.</p>'}
            </div>`;
          paginationEl.innerHTML = '';
          return;
        }

        gridEl.innerHTML = items.map((c) => cardHTML(c)).join('');

        gridEl.querySelectorAll('[data-action]').forEach((btn) => {
          const record = items.find((it) => String(it._id) === String(btn.dataset.record));
          btn.addEventListener('click', () => onAction(btn.dataset.action, record));
        });

        if (paginationEl) {
          paginationEl.innerHTML = '';
          for (let p = 1; p <= (meta.pages || 1); p += 1) {
            const pageBtn = document.createElement('button');
            pageBtn.className = 'btn btn-secondary btn-sm';
            pageBtn.textContent = String(p);
            if (p === state.page) pageBtn.style.cssText = 'background:var(--primary);color:#fff;margin-right:3px;';
            else pageBtn.style.marginRight = '3px';
            pageBtn.addEventListener('click', () => { state.page = p; load(); });
            paginationEl.appendChild(pageBtn);
          }
        }
      } catch (error) {
        gridEl.innerHTML = UI.errorAlert(error.message);
      } finally {
        state.loading = false;
      }
    }

    function cardHTML(c) {
      const stage = stageInfo(c.etapaActual);
      const telefono = Format.digits(c.telefono || '');
      const whatsapp = telefono ? Format.whatsappLink(telefono) : '';
      const discarded = c.etapaActual === 'DESCARTADO';
      const canBack = previousOf(c.etapaActual);
      const canNext = nextOf(c.etapaActual);
      const perfil = [
        c.servicio ? { label: 'Servicio', value: c.servicio } : null,
        c.zona ? { label: 'Zona', value: c.zona } : null,
        c.capacidad ? { label: 'Capacidad', value: Format.currency(c.capacidad) } : null,
        c.formaPago ? { label: 'Pago', value: c.formaPago } : null,
        c.vigencia ? { label: 'Vigencia', value: c.vigencia } : null,
      ].filter(Boolean);
      return `
        <article class="client-card" style="--stage-color:${stage.color};">
          <div class="client-card-head">
            <div class="client-card-title">
              <strong>${esc(c.nombre)}</strong>
              <div class="client-card-meta">
                ${esc(c.email || '—')}${c.asesorAsignado ? ` · Asesor: ${esc(c.asesorAsignado.name || '')}` : ''}
              </div>
            </div>
            <span class="stage-badge" style="background:${stage.color}22;color:${stage.color};border:1px solid ${stage.color}55;">${esc(stage.label)}</span>
          </div>

          <div class="client-card-line">
            <span class="client-card-media">${esc(c.medio || 'Otro')}</span>
            <span>${esc(c.telefono || '—')}</span>
          </div>

          <div class="client-card-extra">
            <span>Último contacto: <strong>${c.ultVez ? Format.dateTime(c.ultVez) : '—'}</strong></span>
            <span>Llamadas: <strong>${Number(c.totalLlamadas) || 0}</strong></span>
            ${c.negocioId ? '<span class="stage-badge" style="background:#1f9d5522;color:#1f9d55;">Negocio vinculado</span>' : ''}
            ${c.ultimaCitaId ? '<span class="stage-badge" style="background:#2563eb22;color:#2563eb;">Cita programada</span>' : ''}
          </div>

          ${perfil.length ? `<div class="client-card-profile">${perfil.map((p) => `<span><small>${esc(p.label)}</small> ${esc(p.value)}</span>`).join('')}</div>` : ''}
          ${c.notasGenerales ? `<div class="client-card-notes">${esc(c.notasGenerales)}</div>` : ''}

          ${discarded ? '' : `
          <div class="client-card-nav">
            ${canBack ? `<button class="btn btn-secondary btn-sm" type="button" data-action="back" data-record="${c._id}" title="Regresar a ${esc(stageInfo(canBack).label)}">◀ Regresar</button>` : ''}
            ${canNext ? `<button class="btn btn-primary btn-sm" type="button" data-action="next" data-record="${c._id}" title="Avanzar a ${esc(stageInfo(canNext).label)}">Avanzar ▶</button>` : ''}
          </div>`}

          <div class="client-card-actions">
            ${discarded
              ? `<button class="btn btn-secondary btn-sm" type="button" data-action="reactivate" data-record="${c._id}" title="Reactivar el cliente">↻ Reactivar</button>`
              : `<button class="btn btn-secondary btn-sm" type="button" data-action="discard" data-record="${c._id}" title="Descartar cliente">✕ Descartar</button>`}
            ${whatsapp ? `<a class="btn btn-sm crm-btn-wa" href="${whatsapp}" target="_blank" rel="noopener" title="Enviar WhatsApp">WhatsApp</a>` : ''}
            <button class="btn btn-secondary btn-sm" type="button" data-action="llamada" data-record="${c._id}" title="Registrar una llamada">+1 Llamada</button>
            <button class="btn btn-secondary btn-sm" type="button" data-action="perfil" data-record="${c._id}" title="Editar perfil inmobiliario">Editar Perfil</button>
            <button class="btn btn-secondary btn-sm" type="button" data-action="historial" data-record="${c._id}" title="Ver bitácora de etapas">Ver Bitácora</button>
            ${c.ultimaCitaId ? `<button class="btn btn-secondary btn-sm" type="button" data-action="cita" data-record="${c._id}" title="Abrir la cita vinculada">Ver Cita</button>` : ''}
            ${c.negocioId ? `<button class="btn btn-secondary btn-sm" type="button" data-action="negocio" data-record="${c._id}" title="Abrir el negocio vinculado">Ver Negocio</button>` : ''}
            <button class="icon-btn" type="button" data-action="eliminar" data-record="${c._id}" title="Eliminar cliente">&times;</button>
          </div>
        </article>
      `;
    }

    async function onAction(action, record) {
      if (!record) return;
      if (action === 'llamada') {
        try {
          await API.clients.registrarLlamada(record._id);
          UI.toast('Llamada registrada', 'success');
          load();
          loadCounts();
        } catch (error) {
          UI.toast(error.message, 'error');
        }
        return;
      }
      if (action === 'perfil') return openProfileModal(record);
      if (action === 'historial') return openHistorialModal(record);
      if (action === 'cita') { window.location.href = 'appointments.html'; return; }
      if (action === 'negocio') { window.location.href = 'businesses.html'; return; }
      if (['next', 'back', 'discard', 'reactivate'].includes(action)) return openTransition(record, action);
      if (action === 'eliminar') {
        const ok = await UI.confirm(`¿Eliminar al cliente "${record.nombre}"?`);
        if (!ok) return;
        try {
          await API.clients.remove(record._id);
          UI.toast('Cliente eliminado', 'success');
          load();
          loadCounts();
        } catch (error) {
          UI.toast(error.message, 'error');
        }
      }
    }

    /* ── Registro rápido (nuevo cliente) ─────────────────────────────── */
    function openQuickCreate() {
      const modal = UI.openModal({
        title: 'Nuevo cliente',
        body: `
          <form id="client-quick-form" novalidate>
            <div class="stage-input-grid">
              ${UI.field('nombre', 'Nombre completo', { required: true, full: true, placeholder: 'Ej. María López' })}
              ${UI.field('telefono', 'Teléfono (con lada)', { type: 'tel', placeholder: '6121234567' })}
              ${UI.field('email', 'Correo', { type: 'email' })}
              ${UI.field('medio', '¿Cómo nos contactó?', { type: 'select', options: CLIENT_MEDIOS.map((m) => ({ value: m, label: m })) })}
              ${isBossUser() ? UI.field('asesorAsignado', 'Asesor asignado', { type: 'select', options: [{ value: '', label: '— Yo mismo —' }, ...userOptions], hint: 'Solo administración/gerencia puede asignar.' }) : ''}
            </div>
          </form>
        `,
        footer: `
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary" type="submit" form="client-quick-form">Guardar cliente</button>
        `,
        size: 640,
      });

      const overlay = modal.bodyEl ? modal.bodyEl.closest('#modal-overlay') : null;
      const cancelBtn = overlay ? overlay.querySelector('[data-cancel]') : null;
      if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());

      const form = modal.bodyEl ? modal.bodyEl.querySelector('#client-quick-form') : null;
      if (form) form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const values = UI.collectForm(e.target);
        if (values.asesorAsignado === '') delete values.asesorAsignado;
        if (values.medio && !CLIENT_MEDIOS.includes(values.medio)) values.medio = 'Otro';
        try {
          const created = await API.clients.create(values);
          UI.closeModal();
          load();
          loadCounts();
          const nombre = (created && created.data && created.data.nombre) || 'El cliente';
          verifyCenter({ title: 'Cliente registrado', message: `${esc(nombre)} quedó como <strong>Prospecto</strong> y ya forma parte de tu embudo de ventas.` });
        } catch (error) {
          UI.toast(error.message, 'error');
        }
      });
    }

    /* ── Editar perfil inmobiliario ───────────────────────────────────── */
    function openProfileModal(record) {
      const modal = UI.openModal({
        title: `Editar perfil — ${esc(record.nombre)}`,
        body: `
          <form id="client-profile-form" novalidate>
            <div class="stage-input-grid">
              ${UI.field('telefono', 'Teléfono', { type: 'tel', value: record.telefono || '' })}
              ${UI.field('email', 'Correo', { type: 'email', value: record.email || '' })}
              ${UI.field('medio', 'Medio de contacto', { type: 'select', value: record.medio || 'Otro', options: CLIENT_MEDIOS.map((m) => ({ value: m, label: m })) })}
              ${UI.field('servicio', 'Servicio', { type: 'select', value: record.servicio || 'Comprar', options: CLIENT_SERVICIOS.map((s) => ({ value: s, label: s })) })}
              ${UI.field('zona', 'Zona deseada', { value: record.zona || '' })}
              ${UI.field('capacidad', 'Capacidad de pago ($)', { type: 'number', value: record.capacidad || 0 })}
              ${UI.field('formaPago', 'Forma de pago', { type: 'select', value: record.formaPago || 'Contado', options: CLIENT_FORMAS_PAGO.map((f) => ({ value: f, label: f })) })}
              ${UI.field('vigencia', 'Vigencia', { value: record.vigencia || 'Inmediata', hint: 'Ej. 6 meses' })}
              ${UI.field('queBusca', '¿Qué busca?', { type: 'textarea', value: record.queBusca || '', full: true, placeholder: 'Ej. casa de 2 recámaras con cochera en zona norte' })}
              ${UI.field('notasGenerales', 'Notas', { type: 'textarea', value: record.notasGenerales || '', full: true, placeholder: 'Comentarios adicionales del cliente…' })}
            </div>
          </form>
        `,
        footer: `
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary" type="submit" form="client-profile-form">Guardar cambios</button>
        `,
        size: 720,
      });

      const overlay = modal.bodyEl ? modal.bodyEl.closest('#modal-overlay') : null;
      const cancelBtn = overlay ? overlay.querySelector('[data-cancel]') : null;
      if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());

      const form = modal.bodyEl ? modal.bodyEl.querySelector('#client-profile-form') : null;
      if (form) form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const values = UI.collectForm(e.target);
        if (values.medio && !CLIENT_MEDIOS.includes(values.medio)) values.medio = 'Otro';
        if (values.servicio && !CLIENT_SERVICIOS.includes(values.servicio)) values.servicio = 'Otro';
        try {
          await API.clients.update(record._id, values);
          UI.toast('Perfil actualizado', 'success');
          UI.closeModal();
          load();
        } catch (error) {
          UI.toast(error.message, 'error');
        }
      });
    }

    /* ── Transición de etapa (avanzar / regresar / descartar / reactivar) ── */
    function openTransition(record, direction) {
      const current = record.etapaActual || 'PROSPECTO';
      let target = '';
      if (direction === 'next') target = nextOf(current);
      else if (direction === 'back') target = previousOf(current);
      else if (direction === 'discard') target = 'DESCARTADO';
      else if (direction === 'reactivate') {
        const hist = Array.isArray(record.historialEtapas) ? record.historialEtapas : [];
        const last = hist[hist.length - 1];
        target = (last && last.etapaAnterior) || 'PROSPECTO';
      }
      if (!target) {
        UI.toast('No hay un destino válido para esta etapa', 'warning');
        return;
      }

      const targetInfo = stageInfo(target);
      const notaHint = direction === 'discard'
        ? 'Ej. No es viable por ahora, se descarta el seguimiento…'
        : direction === 'reactivate'
          ? 'Ej. Retomó contacto, reactivamos su seguimiento…'
          : direction === 'back'
            ? 'Ej. Necesita más tiempo, regresamos a esta etapa…'
            : (target === 'PERFILADO'
                ? 'Ej. Completé su perfil: busca casa de 2 recámaras en zona norte…'
                : target === 'CITA'
                  ? 'Ej. Agendó visita para revisar las opciones disponibles…'
                  : 'Ej. Aceptó la propuesta, se inicia la formalización…');

      let extraFields = '';
      let notice = '';
      if (target === 'PERFILADO') {
        notice = '<div class="stage-notice">🙋 Completa el perfil del cliente para mejorar el filtrado de propiedades.</div>';
        extraFields = `
          <div class="stage-input-grid">
            ${UI.field('servicio', 'Servicio', { type: 'select', value: record.servicio || 'Comprar', options: CLIENT_SERVICIOS.map((s) => ({ value: s, label: s })) })}
            ${UI.field('zona', 'Zona deseada', { value: record.zona || '', placeholder: 'Ej. Zona norte' })}
            ${UI.field('capacidad', 'Capacidad de pago ($)', { type: 'number', value: record.capacidad || 0 })}
            ${UI.field('formaPago', 'Forma de pago', { type: 'select', value: record.formaPago || 'Contado', options: CLIENT_FORMAS_PAGO.map((f) => ({ value: f, label: f })) })}
            ${UI.field('vigencia', 'Vigencia', { value: record.vigencia || 'Inmediata', hint: 'Ej. 6 meses' })}
            ${UI.field('queBusca', '¿Qué busca?', { type: 'textarea', value: record.queBusca || '', full: true, placeholder: 'Ej. casa de 2 recámaras con cochera en zona norte' })}
          </div>`;
      } else if (target === 'CITA') {
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        notice = '<div class="stage-notice">📅 La cita se registrará y se sincronizará automáticamente con tu <strong>Calendario</strong>.</div>';
        extraFields = `
          <div class="stage-input-grid">
            ${UI.field('fechaCita', 'Fecha de la cita', { type: 'date', value: dateStr, required: true })}
            ${UI.field('horaCita', 'Hora', { type: 'time', value: '12:00' })}
            ${UI.field('lugarPropiedad', 'Ubicación / referencia', { value: record.zona || '', placeholder: 'Ej. Oficina central o dirección de la propiedad' })}
            ${UI.field('asunto', 'Asunto', { value: '', placeholder: 'Ej. Visita a casa modelo' })}
          </div>`;
      } else if (target === 'NEGOCIACION_CIERRE') {
        notice = record.negocioId
          ? '<div class="stage-notice">⚠️ Este cliente ya tiene un negocio vinculado en <strong>Negocios</strong>.</div>'
          : '<div class="stage-notice">💼 Al confirmar se creará y vinculará automáticamente la operación en <strong>Negocios</strong>.</div>';
        extraFields = `
          <div class="stage-input-grid">
            ${UI.field('capacidad', 'Confirma monto / presupuesto de la operación ($)', { type: 'number', value: record.capacidad || 0, required: true })}
          </div>`;
      }

      const modal = UI.openModal({
        title: `${direction === 'next' ? 'Avanzar' : direction === 'back' ? 'Regresar' : direction === 'discard' ? 'Descartar' : 'Reactivar'} de etapa — ${esc(record.nombre)}`,
        body: `
          <p class="text-muted" style="margin-top:0;">${esc(stageInfo(current).label)} → <strong>${esc(targetInfo.label)}</strong></p>
          ${notice}
          <form id="client-stage-form" novalidate>
            ${extraFields}
            ${UI.field('nota', 'Nota del cambio (obligatoria)', { type: 'textarea', required: true, full: true, placeholder: notaHint })}
          </form>
        `,
        footer: `
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary" type="submit" form="client-stage-form">Confirmar cambio</button>
        `,
        size: 620,
      });

      const overlay = modal.bodyEl ? modal.bodyEl.closest('#modal-overlay') : null;
      const cancelBtn = overlay ? overlay.querySelector('[data-cancel]') : null;
      if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());

      const form = modal.bodyEl ? modal.bodyEl.querySelector('#client-stage-form') : null;
      if (form) form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const values = UI.collectForm(e.target);
        const nota = String(values.nota || '').trim();
        if (!nota) {
          UI.toast('La nota es obligatoria para mover de etapa', 'warning');
          return;
        }
        const payload = { etapaNueva: target, nota };
        const datosEtapa = {};
        if (target === 'PERFILADO') {
          ['servicio', 'queBusca', 'zona', 'capacidad', 'formaPago', 'vigencia'].forEach((k) => {
            if (values[k] !== undefined && String(values[k]).trim() !== '') datosEtapa[k] = values[k];
          });
        } else if (target === 'CITA') {
          ['fechaCita', 'horaCita', 'lugarPropiedad', 'asunto'].forEach((k) => {
            if (values[k] !== undefined && String(values[k]).trim() !== '') datosEtapa[k] = values[k];
          });
        } else if (target === 'NEGOCIACION_CIERRE' && values.capacidad !== undefined && String(values.capacidad).trim() !== '') {
          datosEtapa.capacidad = values.capacidad;
        }
        if (Object.keys(datosEtapa).length) payload.datosEtapa = datosEtapa;
        try {
          const result = await API.clients.changeEtapa(record._id, payload);
          UI.closeModal();
          load();
          loadCounts();
          showVerify(record, target, result, direction);
        } catch (error) {
          UI.toast(error.message, 'error');
        }
      });
    }

    /* ── Confirmación / verificación centrada en pantalla ────────────── */
    function showVerify(record, target, result, direction) {
      const targetInfo = stageInfo(target);
      const lines = [];
      if (direction === 'discard') lines.push(`"${esc(record.nombre)}" quedó en la etapa <strong>Descartado</strong>.`);
      else lines.push(`"${esc(record.nombre)}" ${direction === 'back' ? 'regresó a la etapa' : 'avanzó a la etapa'} <strong>«${esc(targetInfo.label)}»</strong>.`);
      lines.push('La nota del cambio quedó registrada en la bitácora del cliente.');

      const actions = [];
      if (result && result.newCita) {
        const d = new Date(result.newCita.date);
        const fechaTxt = isNaN(d.getTime()) ? 'fecha programada' : Format.dateTime(d);
        lines.push(`📅 Cita agendada: <strong>${esc(fechaTxt)}</strong>${result.newCita.place ? ` — ${esc(result.newCita.place)}` : ''} y sincronizada con tu Calendario.`);
        actions.push({ label: 'Ver mis Citas', href: 'appointments.html' });
        actions.push({ label: 'Ver Calendario', href: 'calendar.html' });
      }
      if (result && result.newNegocioId) {
        lines.push('💼 El negocio de la operación fue <strong>creado y vinculado</strong> automáticamente.');
        actions.push({ label: 'Ver Negocio', href: 'businesses.html' });
      }

      verifyCenter({
        title: direction === 'discard' ? 'Cliente descartado' : 'Cambio de etapa confirmado',
        message: lines.join('<br>'),
        actions,
      });
    }

    function verifyCenter({ title = 'Confirmado', message = '', actions = [] }) {
      const prev = document.querySelector('.verify-overlay');
      if (prev) prev.remove();
      const overlay = document.createElement('div');
      overlay.className = 'verify-overlay';
      const actionButtons = actions.map((a) => `<a class="btn btn-primary" href="${a.href}">${esc(a.label)}</a>`).join('');
      overlay.innerHTML = `
        <div class="verify-panel" role="dialog" aria-modal="true" tabindex="-1">
          <div class="verify-icon success">✔</div>
          <h3>${esc(title)}</h3>
          <p>${message}</p>
          <div class="verify-actions">
            ${actionButtons}
            <button class="btn btn-secondary" data-close type="button">Entendido</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      const okBtn = overlay.querySelector('[data-close]');
      if (okBtn) okBtn.addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
      const panel = overlay.querySelector('.verify-panel');
      if (panel) { panel.focus(); panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); }); }
      return { overlay, close };
    }

    /* ── Bitácora de etapas ───────────────────────────────────────────── */
    async function openHistorialModal(record) {
      const modal = UI.openModal({
        title: `Bitácora — ${esc(record.nombre)}`,
        body: '<div class="loading">Cargando historial…</div>',
        size: 640,
      });
      const bodyEl = modal.bodyEl;
      try {
        const items = (await API.clients.historial(record._id)) || [];
        if (!Array.isArray(items) || !items.length) {
          bodyEl.innerHTML = '<p class="text-muted">Aún no hay movimientos en la bitácora.</p>';
          return;
        }
        bodyEl.innerHTML = `
          <ul class="timeline">
            ${items.map((h) => {
              const who = h.usuario && typeof h.usuario === 'object' && h.usuario.name ? h.usuario.name : (h.usuario ? h.usuario : 'Admin');
              return `
              <li>
                <strong>${esc(h.etapaAnterior ? `${stageInfo(h.etapaAnterior).label} → ${stageInfo(h.etapaNueva || h.etapa).label}` : `Registro en ${stageInfo(h.etapaNueva || h.etapa).label}`)}</strong>
                <div class="text-muted" style="font-size:12px;">${Format.dateTime(h.fecha)} · ${esc(who)}</div>
                <div style="font-size:13px;">${esc(h.nota || '')}</div>
              </li>`;
            }).join('')}
          </ul>
        `;
      } catch (error) {
        bodyEl.innerHTML = UI.errorAlert(error.message);
      }
    }

    loadCounts();
    load();
  },
};