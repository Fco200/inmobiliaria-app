'use strict';

window.Pages = window.Pages || {};

// Etapas del embudo inmobiliario con su etiqueta y color de tarjeta.
// "Perfilado" se recorre ANTES de la cita: primero se perfila al cliente
// (operación, presupuesto, zona) y sólo después se agenda.
const CLIENT_STAGES = [
  { key: 'PROSPECTO', label: 'Prospecto', color: '#64748b' },
  { key: 'PERFILADO', label: 'Perfilado', color: '#5B2D8E' },
  { key: 'CITA', label: 'Cita', color: '#d97706' },
  { key: 'SEGUIMIENTO', label: 'Seguimiento', color: '#0ea5e9' },
  { key: 'NEGOCIACION_CIERRE', label: 'Negociación / Cierre', color: '#1f9d55' },
  { key: 'POSTVENTA', label: 'Postventa', color: '#9333ea' },
  { key: 'DESCARTADO', label: 'Descartado', color: '#dc2626' },
];

const FLOW_ORDER = ['PROSPECTO', 'PERFILADO', 'CITA', 'SEGUIMIENTO', 'NEGOCIACION_CIERRE', 'POSTVENTA'];
const CLIENT_MEDIOS = ['WhatsApp', 'Facebook', 'Llamada', 'Portal', 'Lona', 'Recomendación', 'Otro'];
// Cinco operaciones exactas: "Alquilar" antes de "Otro".
const CLIENT_SERVICIOS = ['Vender', 'Comprar', 'Rentar', 'Alquilar', 'Otro'];
// "Efectivo" se retiró: queda "Contado" como pago contra entrega.
const CLIENT_FORMAS_PAGO = ['Contado', 'Infonavit', 'Fovissste', 'Bancario', 'Otro'];
const CLIENT_TIPOS_PROPIEDAD = ['Casa', 'Departamento', 'Terreno', 'Local', 'Bodega', 'Rancho', 'Playa', 'Otro'];
// Sin alias de etapa: "PERFILADO" volvió a ser una etapa real del embudo.
const STAGE_ALIASES = {};

function stageInfo(key) {
  const normalized = STAGE_ALIASES[key] || key;
  return CLIENT_STAGES.find((s) => s.key === normalized) || { key: normalized || 'PROSPECTO', label: normalized || 'Prospecto', color: '#64748b' };
}

function flowIndexOf(key) {
  return FLOW_ORDER.indexOf(STAGE_ALIASES[key] || key);
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
    const state = {
      q: '',
      page: 1,
      etapaActual: '',
      servicio: '',
      tipoPropiedad: '',
      zona: '',
      minCapacity: '',
      maxCapacity: '',
      loading: false,
      counts: {},
    };
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
        <button class="btn btn-primary" id="clients-add" type="button">+ Nuevo cliente</button>
      </div>
      <details class="clients-filters" id="clients-filters-box">
        <summary>Filtros avanzados</summary>
        <div class="clients-filters-grid">
          <label class="clients-filter">
            <span>Operación</span>
            <select class="form-control" id="clients-f-servicio">
              <option value="">Todas</option>
              ${CLIENT_SERVICIOS.map((s) => `<option value="${s}">${s}</option>`).join('')}
            </select>
          </label>
          <label class="clients-filter">
            <span>Tipo de propiedad</span>
            <select class="form-control" id="clients-f-tipo">
              <option value="">Todos</option>
              ${CLIENT_TIPOS_PROPIEDAD.map((t) => `<option value="${t}">${t}</option>`).join('')}
            </select>
          </label>
          <label class="clients-filter">
            <span>Zona</span>
            <input class="form-control" id="clients-f-zona" type="search" placeholder="Ej. zona norte">
          </label>
          <label class="clients-filter">
            <span>Presupuesto mínimo ($)</span>
            <input class="form-control" id="clients-f-min" type="number" min="0" step="1000" placeholder="0">
          </label>
          <label class="clients-filter">
            <span>Presupuesto máximo ($)</span>
            <input class="form-control" id="clients-f-max" type="number" min="0" step="1000" placeholder="Sin límite">
          </label>
        </div>
        <div class="clients-filters-actions">
          <button class="btn btn-secondary btn-sm" type="button" id="clients-f-clear">Limpiar filtros</button>
        </div>
      </details>
      <div id="clients-grid" class="client-grid"></div>
      <div id="clients-pagination"></div>
    `;

    const gridEl = container.querySelector('#clients-grid');
    const paginationEl = container.querySelector('#clients-pagination');
    const searchEl = container.querySelector('#clients-search');
    const addBtn = container.querySelector('#clients-add');
    const pipelineEl = container.querySelector('#clients-pipeline');
    const filtersBox = container.querySelector('#clients-filters-box');
    const fServicio = container.querySelector('#clients-f-servicio');
    const fTipo = container.querySelector('#clients-f-tipo');
    const fZona = container.querySelector('#clients-f-zona');
    const fMin = container.querySelector('#clients-f-min');
    const fMax = container.querySelector('#clients-f-max');
    const fClear = container.querySelector('#clients-f-clear');

    const esc = (v) => UI.escapeHtml(v == null ? '' : v);

    // Select con opción "Otro" y campo de texto condicional PROPIO. No se usa
    // el "Otros (especificar)" genérico de UI.field porque aquí el texto vive
    // en un campo separado (servicioOtro / formaPagoOtro / tipoPropiedadOtro),
    // lo que mantiene el valor del select siempre dentro de su enum.
    function fieldConOtro(name, label, { value = '', otroValue = '', options = [], placeholder = 'Especifica…', full = false, required = false } = {}) {
      const id = `fld-${name}`;
      const otrosId = `otros-${id}`;
      const isOtro = value === 'Otro';
      const opts = options.map((o) => {
        const optValue = typeof o === 'object' ? o.value : o;
        const optLabel = typeof o === 'object' ? o.label : o;
        return `<option value="${esc(optValue)}"${String(optValue) === String(value) ? ' selected' : ''}>${esc(optLabel)}</option>`;
      }).join('');
      return `
        <div style="${full ? 'grid-column:1/-1;' : ''}margin-bottom:16px;">
          <label for="${id}" style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;">${esc(label)}${required ? ' *' : ''}</label>
          <select class="form-control" id="${id}" name="${name}" data-otro-input="${otrosId}"${required ? ' required' : ''}>${opts}</select>
          <input class="form-control" id="${otrosId}" name="${name}Otro" type="text" value="${esc(otroValue)}" placeholder="${esc(placeholder)}" style="display:${isOtro ? 'block' : 'none'};margin-top:8px;">
        </div>`;
    }

    // Muestra/oculta el texto "Otro" y limpia el valor cuando ya no aplica.
    function wireOtros(root) {
      root.querySelectorAll('select[data-otro-input]').forEach((select) => {
        const input = root.querySelector('#' + select.dataset.otroInput)
          || document.getElementById(select.dataset.otroInput);
        if (!input) return;
        const sync = () => {
          const isOtro = select.value === 'Otro';
          input.style.display = isOtro ? 'block' : 'none';
          input.required = isOtro && select.required;
          if (!isOtro) input.value = '';
        };
        select.addEventListener('change', sync);
        sync();
      });
    }

    // Elimina los campos "…Otro" que no aplican antes de enviar al servidor.
    function limpiarOtros(values, names) {
      names.forEach((name) => {
        if (values[name] !== 'Otro') delete values[`${name}Otro`];
        else if (!String(values[`${name}Otro`] || '').trim()) {
          delete values[`${name}Otro`];
          values[name] = 'Otro';
        }
      });
      return values;
    }

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
    }

    function hasAdvancedFilters() {
      return Boolean(state.servicio || state.tipoPropiedad || state.zona || state.minCapacity || state.maxCapacity);
    }

    // Refleja en el encabezado cuántos filtros avanzados hay activos, para que
    // no queden ocultos dentro del panel colapsado.
    function paintFiltersSummary() {
      if (!filtersBox) return;
      const summary = filtersBox.querySelector('summary');
      if (!summary) return;
      const activos = [
        state.servicio && `operación: ${state.servicio}`,
        state.tipoPropiedad && `propiedad: ${state.tipoPropiedad}`,
        state.zona && `zona: ${state.zona}`,
        state.minCapacity !== '' && `desde ${Format.currency(state.minCapacity)}`,
        state.maxCapacity !== '' && `hasta ${Format.currency(state.maxCapacity)}`,
      ].filter(Boolean);
      summary.textContent = activos.length ? `Filtros avanzados (${activos.length}) — ${activos.join(' · ')}` : 'Filtros avanzados';
    }

    // Los contadores ya llegan "desenvueltos" desde el cliente HTTP: el
    // endpoint responde { success, data: counts } y unwrap() devuelve ese
    // objeto. Antes se leía result.data y por eso todos mostraban 0.
    async function loadCounts() {
      try {
        const result = await API.clients.conteoEtapas();
        // El endpoint responde { success, data: counts } y `unwrap()` ya devuelve
        // ese objeto plano. Se acepta también la forma envuelta para que un
        // cambio en el cliente HTTP nunca deje el embudo entero en cero.
        const counts = result && typeof result === 'object' && !Array.isArray(result)
          ? (result.data && typeof result.data === 'object' && !Array.isArray(result.data) ? result.data : result)
          : {};
        state.counts = counts;
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
    if (addBtn) addBtn.addEventListener('click', () => openQuickCreate());
    if (pipelineEl) pipelineEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.pipeline-step');
      if (!btn || !pipelineEl.contains(btn)) return;
      state.etapaActual = btn.dataset.stage || '';
      state.page = 1;
      renderPipelineActive();
      load();
    });

    function applyFilters() {
      state.servicio = fServicio ? fServicio.value : '';
      state.tipoPropiedad = fTipo ? fTipo.value : '';
      state.zona = fZona ? fZona.value.trim() : '';
      state.minCapacity = fMin && fMin.value !== '' ? Number(fMin.value) : '';
      state.maxCapacity = fMax && fMax.value !== '' ? Number(fMax.value) : '';
      state.page = 1;
      paintFiltersSummary();
      load();
    }
    [fServicio, fTipo].forEach((el) => { if (el) el.addEventListener('change', applyFilters); });
    let filterTimer = null;
    [fZona].forEach((el) => {
      if (!el) return;
      el.addEventListener('input', () => {
        clearTimeout(filterTimer);
        filterTimer = setTimeout(applyFilters, 350);
      });
    });
    [fMin, fMax].forEach((el) => {
      if (!el) return;
      el.addEventListener('change', applyFilters);
      el.addEventListener('input', () => {
        clearTimeout(filterTimer);
        filterTimer = setTimeout(applyFilters, 500);
      });
    });
    if (fClear) fClear.addEventListener('click', () => {
      if (fServicio) fServicio.value = '';
      if (fTipo) fTipo.value = '';
      if (fZona) fZona.value = '';
      if (fMin) fMin.value = '';
      if (fMax) fMax.value = '';
      applyFilters();
    });

    async function load() {
      if (state.loading) return;
      state.loading = true;
      gridEl.innerHTML = '<div class="loading">Cargando clientes…</div>';
      try {
        const result = await API.clients.list({
          q: state.q || undefined,
          page: state.page,
          limit: 16,
          etapaActual: state.etapaActual || undefined,
          servicio: state.servicio || undefined,
          tipoPropiedad: state.tipoPropiedad || undefined,
          zona: state.zona || undefined,
          minCapacity: state.minCapacity === '' ? undefined : state.minCapacity,
          maxCapacity: state.maxCapacity === '' ? undefined : state.maxCapacity,
        });
        const items = (result && result.data) || [];
        const meta = (result && result.meta) || {};
        state.page = meta.page || 1;

        if (!items.length) {
          gridEl.innerHTML = `
            <div class="clients-empty">
              ${state.q || state.etapaActual || hasAdvancedFilters()
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
        c.servicio ? { label: 'Operación', value: c.servicio === 'Otro' ? (c.servicioOtro || 'Otro') : c.servicio } : null,
        c.tipoPropiedad ? { label: 'Propiedad', value: c.tipoPropiedad === 'Otro' ? (c.tipoPropiedadOtro || 'Otro') : c.tipoPropiedad } : null,
        c.zona ? { label: 'Zona', value: c.zona } : null,
        c.capacidad ? { label: 'Capacidad', value: Format.currency(c.capacidad) } : null,
        c.formaPago ? { label: 'Pago', value: c.formaPago === 'Otro' ? (c.formaPagoOtro || 'Otro') : c.formaPago } : null,
      ].filter(Boolean);
      return `
        <article class="client-card" style="--stage-color:${stage.color};">
          <div class="client-card-head">
            <div class="client-card-title">
              <strong>${esc(c.nombre)}</strong>
              <div class="client-card-meta">
                ${[c.email, c.asesorAsignado ? `Asesor: ${c.asesorAsignado.name || ''}` : ''].filter(Boolean).map((v) => esc(v)).join(' · ') || '—'}
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
              ${fieldConOtro('servicio', '¿Qué quiere hacer el cliente?', {
                required: true,
                full: true,
                options: [{ value: '', label: '— Selecciona una operación —' }, ...CLIENT_SERVICIOS.map((s) => ({ value: s, label: s }))],
                placeholder: 'Ej. Permuta, herencia, ampliación…',
              })}
              ${UI.field('telefono', 'Teléfono (con lada)', { type: 'tel', placeholder: '6121234567' })}
              ${UI.field('medio', '¿Cómo nos contactó?', { type: 'select', options: CLIENT_MEDIOS.map((m) => ({ value: m, label: m })) })}
              ${isBossUser() ? UI.field('asesorAsignado', 'Asesor asignado', { type: 'select', options: [{ value: '', label: '— Yo mismo —' }, ...userOptions], hint: 'Solo administración/gerencia puede asignar.' }) : ''}
            </div>
            <p class="text-muted" style="font-size:12px;margin:0;">El correo y el resto del perfil inmobiliario se completan después desde <strong>Editar perfil</strong>.</p>
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
      if (form) {
        wireOtros(form);
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const values = UI.collectForm(e.target);
          if (!String(values.nombre || '').trim()) {
            UI.toast('Escribe el nombre del cliente', 'warning');
            return;
          }
          if (!values.servicio) {
            UI.toast('Selecciona si el cliente quiere comprar, vender, rentar o alquilar', 'warning');
            return;
          }
          if (values.servicio === 'Otro' && !String(values.servicioOtro || '').trim()) {
            UI.toast('Escribe qué operación quiere hacer el cliente', 'warning');
            return;
          }
          if (values.asesorAsignado === '') delete values.asesorAsignado;
          if (values.medio && !CLIENT_MEDIOS.includes(values.medio)) values.medio = 'Otro';
          if (!CLIENT_SERVICIOS.includes(values.servicio)) values.servicio = 'Otro';
          limpiarOtros(values, ['servicio']);
          try {
            const created = await API.clients.create(values);
            UI.closeModal();
            load();
            loadCounts();
            const nombre = (created && created.data && created.data.nombre) || 'El cliente';
            verifyCenter({ title: 'Cliente registrado', message: `${esc(nombre)} quedó como <strong>Prospecto</strong>. El siguiente paso es <strong>Perfilarlo</strong> antes de agendar la cita.` });
          } catch (error) {
            UI.toast(error.message, 'error');
          }
        });
      }
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
              ${fieldConOtro('servicio', 'Operación', { value: record.servicio || 'Comprar', otroValue: record.servicioOtro || '', options: CLIENT_SERVICIOS.map((s) => ({ value: s, label: s })), placeholder: 'Ej. Permuta, herencia, ampliación…' })}
              ${fieldConOtro('tipoPropiedad', 'Tipo de propiedad', { value: record.tipoPropiedad || '', otroValue: record.tipoPropiedadOtro || '', options: [{ value: '', label: '— Sin especificar —' }, ...CLIENT_TIPOS_PROPIEDAD.map((t) => ({ value: t, label: t }))], placeholder: 'Ej. Penthouse, Predio industrial…' })}
              ${UI.field('zona', 'Zona deseada', { value: record.zona || '' })}
              ${UI.field('capacidad', 'Capacidad de pago ($)', { type: 'number', value: record.capacidad || 0 })}
              ${fieldConOtro('formaPago', 'Forma de pago', { value: record.formaPago || 'Contado', otroValue: record.formaPagoOtro || '', options: CLIENT_FORMAS_PAGO.map((f) => ({ value: f, label: f })), placeholder: 'Ej. Pago mixto, uro, préstamo familiar…' })}
              ${UI.field('queBusca', '¿Qué busca?', { type: 'textarea', rows: 6, value: record.queBusca || '', full: true, placeholder: 'Ej. casa de 2 recámaras con cochera en zona norte' })}
              ${UI.field('notasGenerales', 'Notas', { type: 'textarea', rows: 4, value: record.notasGenerales || '', full: true, placeholder: 'Comentarios adicionales del cliente…' })}
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
      if (form) {
        wireOtros(form);
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const values = UI.collectForm(e.target);
          if (values.medio && !CLIENT_MEDIOS.includes(values.medio)) values.medio = 'Otro';
          if (values.servicio && !CLIENT_SERVICIOS.includes(values.servicio)) values.servicio = 'Otro';
          if (values.tipoPropiedad !== null && values.tipoPropiedad !== undefined
            && !CLIENT_TIPOS_PROPIEDAD.includes(values.tipoPropiedad)) values.tipoPropiedad = 'Otro';
          limpiarOtros(values, ['servicio', 'tipoPropiedad', 'formaPago']);
          // `vigencia` ya no existe en el modelo.
          delete values.vigencia;
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
    }

    /* ── Transición de etapa (avanzar / regresar / descartar / reactivar) ── */
    function openTransition(record, direction) {
      const current = STAGE_ALIASES[record.etapaActual] || record.etapaActual || 'PROSPECTO';
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
                ? 'Ej. Se perfila al cliente: operación, presupuesto, zona y tipo de propiedad…'
                : target === 'SEGUIMIENTO'
                  ? 'Ej. Asistió a la cita, seguimos en contacto con opciones…'
                  : target === 'CITA'
                    ? 'Ej. Agendó visita para revisar las opciones disponibles…'
                    : 'Ej. Aceptó la propuesta, se inicia la formalización…');

      let extraFields = '';
      let notice = '';
      if (target === 'PERFILADO') {
        notice = '<div class="stage-notice">📋 Aquí se perfila al cliente antes de agendar. Puedes dejar campos en blanco y completarlos luego con <strong>Editar Perfil</strong>.</div>';
        extraFields = `
          <div class="stage-input-grid">
            ${fieldConOtro('servicio', 'Operación', { value: record.servicio || '', otroValue: record.servicioOtro || '', options: [{ value: '', label: '— Sin especificar —' }, ...CLIENT_SERVICIOS.map((s) => ({ value: s, label: s }))], placeholder: 'Ej. Permuta, herencia…' })}
            ${UI.field('zona', 'Zona deseada', { value: record.zona || '' })}
            ${UI.field('capacidad', 'Capacidad de pago ($)', { type: 'number', value: record.capacidad || 0 })}
            ${UI.field('queBusca', '¿Qué busca?', { type: 'textarea', rows: 3, value: record.queBusca || '', full: true, placeholder: 'Ej. casa de 2 recámaras con cochera en zona norte' })}
          </div>`;
      } else if (target === 'SEGUIMIENTO') {
        notice = '<div class="stage-notice">🙋 <strong>Una sola nota</strong> es obligatoria. Si necesitas ajustar el perfil inmobiliario, usa <strong>Editar Perfil</strong> en la tarjeta.</div>';
        extraFields = '';
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
          : '<div class="stage-notice">💼 Los negocios se crean <strong>únicamente de forma manual</strong> desde el módulo <strong>Negocios</strong>: avanzar de etapa ya no genera ninguno automáticamente.</div>';
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
      if (form) {
        wireOtros(form);
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const values = UI.collectForm(e.target);
          const nota = String(values.nota || '').trim();
          if (!nota) {
            UI.toast('La nota es obligatoria para mover de etapa', 'warning');
            return;
          }
          const payload = { etapaNueva: target, nota };
          const datosEtapa = {};
          const putIfFilled = (key) => {
            const value = values[key];
            if (value !== null && value !== undefined && String(value).trim() !== '') datosEtapa[key] = value;
          };
          if (target === 'PERFILADO') {
            limpiarOtros(values, ['servicio']);
            ['servicio', 'servicioOtro', 'zona', 'capacidad', 'queBusca'].forEach(putIfFilled);
          } else if (target === 'CITA') {
            ['fechaCita', 'horaCita', 'lugarPropiedad', 'asunto'].forEach(putIfFilled);
          } else if (target === 'NEGOCIACION_CIERRE' && values.capacidad !== undefined && values.capacidad !== null && String(values.capacidad).trim() !== '') {
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
      if (target === 'NEGOCIACION_CIERRE') {
        lines.push('💼 Recuerda: el negocio se crea <strong>manualmente</strong> desde <strong>Negocios</strong>; avanzar de etapa no lo genera solo.');
      }
      if (result && result.newNegocioId) {
        lines.push('💼 Negocio ya vinculado a este cliente.');
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