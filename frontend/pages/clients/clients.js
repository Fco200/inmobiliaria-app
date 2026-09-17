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

const CLIENT_MEDIOS = ['WhatsApp', 'Facebook', 'Llamada', 'Portal Inmobiliario', 'Lona/Rótulo', 'Recomendación', 'Otro'];
const CLIENT_SERVICIOS = ['Comprar', 'Vender', 'Rentar', 'Otro'];
const CLIENT_FORMAS_PAGO = ['Contado', 'Infonavit', 'Fovissste', 'Bancario', 'Otro'];

function stageInfo(key) {
  return CLIENT_STAGES.find((s) => s.key === key) || { key: key || 'PROSPECTO', label: key || 'Prospecto', color: '#64748b' };
}

function isBossUser() {
  const user = ApiClient.getStoredUser();
  return Boolean(user && user.role && ['admin', 'gerencia'].includes(user.role.code));
}

window.Pages.clients = {
  title: 'Clientes',

  async render(container) {
    if (!container) return;
    const state = { q: '', page: 1, etapaActual: '', loading: false };
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
      <div class="clients-toolbar">
        <input class="form-control" id="clients-search" type="search" placeholder="Buscar por nombre, teléfono o correo…">
        <select class="form-control" id="clients-stage-filter">
          <option value="">Todas las etapas</option>
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

    let searchTimer = null;
    if (searchEl) searchEl.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.q = searchEl.value.trim(); state.page = 1; load(); }, 350);
    });
    if (filterEl) filterEl.addEventListener('change', () => { state.etapaActual = filterEl.value; state.page = 1; load(); });
    if (addBtn) addBtn.addEventListener('click', () => openQuickCreate());

    const esc = (v) => UI.escapeHtml(v == null ? '' : v);

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
          </div>

          ${perfil.length ? `<div class="client-card-profile">${perfil.map((p) => `<span><small>${esc(p.label)}</small> ${esc(p.value)}</span>`).join('')}</div>` : ''}
          ${c.notasGenerales ? `<div class="client-card-notes">${esc(c.notasGenerales)}</div>` : ''}

          <div class="client-card-line" style="color:var(--text-muted);font-size:12px;">
            Registro: ${c.fechaRegistro ? Format.date(c.fechaRegistro) : '—'}
          </div>

          <div class="client-card-actions">
            ${whatsapp ? `<a class="btn btn-sm crm-btn-wa" href="${whatsapp}" target="_blank" rel="noopener" title="Enviar WhatsApp">WhatsApp</a>` : ''}
            <button class="btn btn-secondary btn-sm" type="button" data-action="llamada" data-record="${c._id}" title="Registrar una llamada">+1 Llamada</button>
            <button class="btn btn-secondary btn-sm" type="button" data-action="perfil" data-record="${c._id}" title="Editar perfil inmobiliario">Editar Perfil</button>
            <button class="btn btn-primary btn-sm" type="button" data-action="etapa" data-record="${c._id}" title="Mover de etapa">Mover Etapa</button>
            <button class="btn btn-secondary btn-sm" type="button" data-action="historial" data-record="${c._id}" title="Ver bitácora de etapas">Ver Bitácora</button>
            ${c.negocioId ? `<button class="btn btn-secondary btn-sm" type="button" data-action="negocio" data-record="${c._id}" title="Abrir el negocio vinculado">Ver en Negocios</button>` : ''}
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
        } catch (error) {
          UI.toast(error.message, 'error');
        }
        return;
      }
      if (action === 'perfil') return openProfileModal(record);
      if (action === 'etapa') return openStageModal(record);
      if (action === 'historial') return openHistorialModal(record);
      if (action === 'negocio') { window.location.href = 'businesses.html'; return; }
      if (action === 'eliminar') {
        const ok = await UI.confirm(`¿Eliminar al cliente "${record.nombre}"?`);
        if (!ok) return;
        try {
          await API.clients.remove(record._id);
          UI.toast('Cliente eliminado', 'success');
          load();
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
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 14px;">
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
          await API.clients.create(values);
          UI.toast('Cliente registrado como Prospecto', 'success');
          UI.closeModal();
          load();
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
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 14px;">
              ${UI.field('telefono', 'Teléfono', { type: 'tel', value: record.telefono || '' })}
              ${UI.field('email', 'Correo', { type: 'email', value: record.email || '' })}
              ${UI.field('medio', 'Medio de contacto', { type: 'select', value: record.medio || 'Otro', options: CLIENT_MEDIOS.map((m) => ({ value: m, label: m })) })}
              ${UI.field('servicio', 'Servicio', { type: 'select', value: record.servicio || 'Comprar', options: CLIENT_SERVICIOS.map((s) => ({ value: s, label: s })) })}
              ${UI.field('zona', 'Zona deseada', { value: record.zona || '' })}
              ${UI.field('capacidad', 'Capacidad de pago ($)', { type: 'number', value: record.capacidad || 0 })}
              ${UI.field('formaPago', 'Forma de pago', { type: 'select', value: record.formaPago || 'Otro', options: CLIENT_FORMAS_PAGO.map((f) => ({ value: f, label: f })) })}
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
        if (values.formaPago && !CLIENT_FORMAS_PAGO.includes(values.formaPago)) values.formaPago = 'Otro';
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

    /* ── Mover de etapa ───────────────────────────────────────────────── */
    function openStageModal(record) {
      const options = CLIENT_STAGES
        .filter((s) => s.key !== record.etapaActual)
        .map((s) => ({ value: s.key, label: s.label }));
      const modal = UI.openModal({
        title: `Mover de etapa — ${esc(record.nombre)}`,
        body: `
          <p class="text-muted" style="margin-top:0;">El avance queda registrado en la bitácora del cliente.</p>
          <form id="client-stage-form" novalidate>
            ${UI.field('etapa', 'Nueva etapa', { type: 'select', options, required: true })}
            ${UI.field('nota', 'Nota del cambio (obligatoria)', { type: 'textarea', required: true, full: true, placeholder: 'Ej. Agendó visita para el sábado por la tarde…' })}
          </form>
        `,
        footer: `
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary" type="submit" form="client-stage-form">Guardar cambio</button>
        `,
        size: 560,
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
        try {
          const result = await API.clients.changeEtapa(record._id, { etapa: values.etapa, nota });
          UI.toast(`Cliente movido a "${stageInfo(values.etapa).label}"`, 'success');
          if (result && result.newNegocioId) {
            UI.toast('Se generó automáticamente el negocio de esta operación', 'info');
          }
          UI.closeModal();
          load();
        } catch (error) {
          UI.toast(error.message, 'error');
        }
      });
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
            ${items.map((h) => `
              <li>
                <strong>${esc(h.etapaAnterior ? `${stageInfo(h.etapaAnterior).label} → ${stageInfo(h.etapaNueva || h.etapa).label}` : `Registro en ${stageInfo(h.etapaNueva || h.etapa).label}`)}</strong>
                <div class="text-muted" style="font-size:12px;">${Format.dateTime(h.fecha)}${h.usuario ? ` · ${esc(h.usuario.name || '')}` : ''}</div>
                <div style="font-size:13px;">${esc(h.nota || '')}</div>
              </li>`).join('')}
          </ul>
        `;
      } catch (error) {
        bodyEl.innerHTML = UI.errorAlert(error.message);
      }
    }

    load();
  },
};