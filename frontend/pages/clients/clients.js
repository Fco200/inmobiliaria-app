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
// Medios en el MISMO orden y con los MISMOS valores que el enum del backend
// (models/client.model.js) para que ningún valor caiga fuera del enum.
const CLIENT_MEDIOS = ['WhatsApp', 'Facebook', 'Llamada', 'Portal', 'Portal Inmobiliario', 'Lona', 'Lona/Rótulo', 'Recomendación', 'Otro'];
// Medios donde el texto libre (medioOtro) está permitido. En "Recomendación"
// es opcional (puede quedarse "Recomendación" a secas); en "Otro" es obligatorio.
const MEDIO_OTROS = ['Otro', 'Recomendación'];
// Cinco operaciones exactas: "Alquilar" antes de "Otro".
const CLIENT_SERVICIOS = ['Vender', 'Comprar', 'Rentar', 'Alquilar', 'Otro'];
// Formas de compra/crédito explícitas que pidió el equipo comercial. El campo
// es texto libre en el backend, así que aquí se ofrece el catálogo oficial.
const CLIENT_FORMAS_PAGO = ['Contado', 'Infonavit', 'Banco', 'Fovissste', 'Otro'];
// Valores antiguos que siguen guardados en clientes previos (p. ej.
// "Bancario"): se agregan como opción extra en modo edición para que el
// select nunca muestre vacío un dato que ya existe.
const FORMAS_PAGO_LEGADAS = ['Bancario'];

// Etiquetas visibles del catálogo de formas de pago. El valor interno sigue
// siendo 'Otro' (para el campo de texto libre), pero al asesor se le muestra
// como "Otros", tal como se pidió.
const FORMA_PAGO_LABELS = { Otro: 'Otros' };

// Opciones del select de forma de pago, incluyendo el valor legado del
// registro cuando no pertenece al catálogo vigente.
function opcionesFormaPago(current) {
  const list = CLIENT_FORMAS_PAGO.slice();
  const value = String(current || '').trim();
  if (value && !list.includes(value) && FORMAS_PAGO_LEGADAS.includes(value)) list.push(value);
  return list.map((f) => ({ value: f, label: FORMA_PAGO_LABELS[f] || f }));
}
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
        <button class="btn btn-secondary" id="clients-csv" type="button">&#11015;&nbsp; Exportar CSV</button>
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
    //   otroWhen:     valores del select donde se MUESTRA el texto libre.
    //   requiredWhen: valores del select donde el texto libre es OBLIGATORIO.
    function fieldConOtro(name, label, { value = '', otroValue = '', options = [], placeholder = 'Especifica…', full = false, required = false, otroWhen = ['Otro'], requiredWhen = ['Otro'], otroLabels = {}, otroPlaceholders = {} } = {}) {
      const id = `fld-${name}`;
      const otrosId = `otros-${id}`;
      const isOtro = otroWhen.includes(value);
      const opts = options.map((o) => {
        const optValue = typeof o === 'object' ? o.value : o;
        const optLabel = typeof o === 'object' ? o.label : o;
        return `<option value="${esc(optValue)}"${String(optValue) === String(value) ? ' selected' : ''}>${esc(optLabel)}</option>`;
      }).join('');
      return `
        <div style="${full ? 'grid-column:1/-1;' : ''}margin-bottom:16px;">
          <label for="${id}" style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;">${esc(label)}${required ? ' *' : ''}</label>
          <select class="form-control" id="${id}" name="${name}" data-otro-input="${otrosId}" data-otro-when="${esc(JSON.stringify(otroWhen))}" data-required-when="${esc(JSON.stringify(requiredWhen))}" data-otro-labels="${esc(JSON.stringify(otroLabels))}" data-otro-placeholders="${esc(JSON.stringify(otroPlaceholders))}"${required ? ' required' : ''}>${opts}</select>
          <input class="form-control" id="${otrosId}" name="${name}Otro" type="text" value="${esc(otroValue)}" placeholder="${esc(placeholder)}" style="display:${isOtro ? 'block' : 'none'};margin-top:8px;">
        </div>`;
    }

    // Muestra/oculta el texto "Otro" y limpia el valor cuando ya no aplica.
    function wireOtros(root) {
      root.querySelectorAll('select[data-otro-input]').forEach((select) => {
        const input = root.querySelector('#' + select.dataset.otroInput)
          || document.getElementById(select.dataset.otroInput);
        if (!input) return;
        const otroWhen = parseWhen(select.dataset.otroWhen, ['Otro']);
        const requiredWhen = parseWhen(select.dataset.requiredWhen, ['Otro']);
        const otroLabels = parseWhen(select.dataset.otroLabels, {});
        const otroPlaceholders = parseWhen(select.dataset.otroPlaceholders, {});
        // Guarda el label del campo para restaurarlo cuando el select no va
        // acompañado de un texto libre por opción.
        const labelEl = select.previousElementSibling;
        const baseLabel = labelEl ? labelEl.textContent : '';
        const basePlaceholder = input.getAttribute('placeholder') || '';
        const sync = () => {
          const show = otroWhen.includes(select.value);
          input.style.display = show ? 'block' : 'none';
          input.required = show && requiredWhen.includes(select.value) && select.required;
          // Texto y label específicos por opción: en "Recomendación" el campo
          // pregunta claramente QUIÉN recomendó (antes solo salía "Otro").
          if (labelEl && otroLabels[select.value]) {
            labelEl.textContent = otroLabels[select.value];
          } else if (labelEl) {
            labelEl.textContent = baseLabel;
          }
          if (otroPlaceholders[select.value]) {
            input.setAttribute('placeholder', otroPlaceholders[select.value]);
          } else {
            input.setAttribute('placeholder', basePlaceholder);
          }
          if (!show) input.value = '';
        };
        select.addEventListener('change', sync);
        sync();
      });
    }

    // Los valores de data-*-when se serializan como JSON; si algo los rompe
    // se cae a la lista por defecto (["Otro"]) en vez de fallar.
    function parseWhen(raw, fallback) {
      if (!raw) return fallback;
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) && parsed.length ? parsed : fallback;
      } catch (error) {
        return fallback;
      }
    }

    // Elimina los campos "…Otro" que no aplican antes de enviar al servidor.
    // `root` es el formulario donde viven los selects (para leer su data-otro-when).
    function limpiarOtros(values, names, root) {
      const scope = root || document;
      names.forEach((name) => {
        const select = scope.querySelector(`select[name="${name}"]`);
        const otroWhen = select ? parseWhen(select.dataset.otroWhen, ['Otro']) : ['Otro'];
        if (!otroWhen.includes(values[name])) delete values[`${name}Otro`];
        else if (!String(values[`${name}Otro`] || '').trim()) {
          delete values[`${name}Otro`];
        }
      });
      return values;
    }

    // La forma de compra y la capacidad de pago aplican a un cliente que
    // COMPRA. Si su operación es "Vender" no tienen sentido: se ocultan
    // automáticamente del formulario y NO se envían al servidor.
    // El bloque de esos dos campos se marca con `id="pago-compra-box"` y
    // `display:contents` para que sus hijos sigan fluyendo en la rejilla.
    function wirePagoPorServicio(form) {
      const box = form.querySelector('#pago-compra-box');
      const sel = form.querySelector('select[name="servicio"]');
      if (!box || !sel) return;
      const sync = () => { box.style.display = sel.value === 'Vender' ? 'none' : 'contents'; };
      sel.addEventListener('change', sync);
      sync();
    }

    function limpiarPagoSiVende(values) {
      if (values.servicio === 'Vender') {
        delete values.formaPago;
        delete values.formaPagoOtro;
        delete values.capacidad;
      }
    }

    // Texto del medio para presentar en tarjeta: "Otro" muestra lo escrito y
    // "Recomendación" lo anexa sólo si escribió algo.
    function medioLabel(c) {
      const medio = c.medio || 'Otro';
      const otro = String(c.medioOtro || '').trim();
      if (medio === 'Otro') return otro || medio;
      if (medio === 'Recomendación' && otro) return `Recomendación · ${otro}`;
      return medio;
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
    const csvBtn = container.querySelector('#clients-csv');
    if (csvBtn) csvBtn.addEventListener('click', async () => {
      try {
        UI.toast('Generando CSV de clientes...', 'info');
        await API.clients.exportCsv();
        UI.toast('CSV de clientes exportado', 'success');
      } catch (error) {
        UI.toast(error.message, 'error');
      }
    });
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
      // Forma de pago y capacidad de pago solo aplican a quien COMPRA. En un
      // cliente que viene a VENDER no se muestran (aunque un registro viejo
      // los conserve), para no confundir al asesor.
      const aplicaPago = c.servicio !== 'Vender';
      const perfil = [
        c.servicio ? { label: 'Operación', value: c.servicio === 'Otro' ? (c.servicioOtro || 'Otro') : c.servicio } : null,
        c.tipoPropiedad ? { label: 'Propiedad', value: c.tipoPropiedad === 'Otro' ? (c.tipoPropiedadOtro || 'Otro') : c.tipoPropiedad } : null,
        c.zona ? { label: 'Zona', value: c.zona } : null,
        aplicaPago && c.capacidad ? { label: 'Capacidad', value: Format.currency(c.capacidad) } : null,
        aplicaPago && c.formaPago ? { label: 'Pago', value: c.formaPago === 'Otro' ? (c.formaPagoOtro || 'Otro') : c.formaPago } : null,
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
            <span class="client-card-media">${esc(medioLabel(c))}</span>
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
    // Alta pensada para una llamada telefónica: todos los campos esenciales
    // del perfil inmobiliario en un solo paso. La fecha de registro es
    // automática. La forma de compra es OPCIONAL (puede quedar "Pendiente")
    // y, si el cliente VIENE A VENDER, se ocultan forma de compra y
    // capacidad de pago porque no aplican a un vendedor.
    function openQuickCreate() {
      const hoy = Format.date(new Date());
      const modal = UI.openModal({
        title: 'Nuevo cliente',
        body: `
          <form id="client-quick-form" novalidate>
            <div class="stage-input-grid">
              <div style="margin-bottom:16px;">
                <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;">Fecha de registro</label>
                <input class="form-control" type="text" value="${UI.escapeHtml(hoy)} (automática)" disabled>
              </div>
              ${UI.field('nombre', 'Nombre completo', { required: true, full: true, placeholder: 'Ej. María López' })}
              ${UI.field('telefono', 'Número de teléfono', { type: 'tel', required: true, placeholder: 'Ej. 6121234567' })}
              ${fieldConOtro('servicio', '¿Qué quiere hacer el cliente?', {
                required: true,
                options: [{ value: '', label: '— Selecciona una operación —' }, ...CLIENT_SERVICIOS.map((s) => ({ value: s, label: s }))],
                placeholder: 'Ej. Permuta, herencia, ampliación…',
              })}
              <div id="pago-compra-box" style="display:contents;">
                ${fieldConOtro('formaPago', 'Forma de compra / pago (opcional)', {
                  options: [{ value: '', label: '— Pendiente (por confirmar) —' }, ...opcionesFormaPago('')],
                  placeholder: 'Ej. Pago mixto, préstamo familiar…',
                })}
                ${UI.field('capacidad', 'Capacidad de pago ($)', { type: 'number', placeholder: 'Pendiente / por confirmar' })}
              </div>
              ${fieldConOtro('tipoPropiedad', '¿Qué tipo de propiedad busca?', {
                options: [{ value: '', label: '— Sin especificar —' }, ...CLIENT_TIPOS_PROPIEDAD.map((t) => ({ value: t, label: t }))],
                placeholder: 'Ej. Penthouse, predio industrial…',
              })}
              ${UI.field('zona', 'Zona de interés', { placeholder: 'Ej. Zona norte, cerca del centro…' })}
              ${fieldConOtro('medio', '¿Cómo se enteró de nosotros?', {
                options: CLIENT_MEDIOS.map((m) => ({ value: m, label: m })),
                otroWhen: MEDIO_OTROS,
                requiredWhen: ['Otro', 'Recomendación'],
                placeholder: 'Ej. Recomendado por el asesor Juan Pérez…',
                otroLabels: { Recomendación: '¿Quién te recomendó? *', Otro: 'Especifica cómo se enteró' },
                otroPlaceholders: {
                  Recomendación: 'Escribe el nombre de quien lo recomendó (cliente, asesor, familiar…)',
                  Otro: 'Ej. Volante, evento, referido por…',
                },
              })}
              ${UI.field('notasGenerales', 'Notas / observaciones de la plática', { type: 'textarea', rows: 3, full: true, placeholder: 'Qué platicaron, compromisos, seguimiento acordado…' })}
              ${isBossUser() ? UI.field('asesorAsignado', 'Asesor asignado', { type: 'select', options: [{ value: '', label: '— Yo mismo —' }, ...userOptions], hint: 'Solo administración/gerencia puede asignar.' }) : ''}
            </div>
            <p class="text-muted" style="font-size:12px;margin:0;">El correo y los detalles finales pueden completarse después desde <strong>Editar perfil</strong>.</p>
          </form>
        `,
        footer: `
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary" type="submit" form="client-quick-form">Guardar cliente</button>
        `,
        size: 760,
      });

      const overlay = modal.bodyEl ? modal.bodyEl.closest('#modal-overlay') : null;
      const cancelBtn = overlay ? overlay.querySelector('[data-cancel]') : null;
      if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());

      const form = modal.bodyEl ? modal.bodyEl.querySelector('#client-quick-form') : null;
      if (form) {
        wireOtros(form);
        wirePagoPorServicio(form);
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const values = UI.collectForm(e.target);
          if (!String(values.nombre || '').trim()) {
            UI.toast('Escribe el nombre del cliente', 'warning');
            return;
          }
          if (!String(values.telefono || '').trim()) {
            UI.toast('Escribe el número de teléfono del cliente', 'warning');
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
          // Forma de compra: OPCIONAL (puede quedar "Pendiente"). Solo se
          // exige texto cuando se eligió "Otro". Si el cliente viene a
          // VENDER, el bloque ni se muestra y no se envía al servidor.
          if (values.formaPago === 'Otro' && !String(values.formaPagoOtro || '').trim()) {
            UI.toast('Especifica la forma de pago del cliente', 'warning');
            return;
          }
          if (values.asesorAsignado === '') delete values.asesorAsignado;
          if (values.medio && !CLIENT_MEDIOS.includes(values.medio)) values.medio = 'Otro';
          if ((values.medio === 'Otro' || values.medio === 'Recomendación') && !String(values.medioOtro || '').trim()) {
            UI.toast(values.medio === 'Recomendación'
              ? 'Escribe quién recomendó al cliente (nombre del asesor o recomendador)'
              : 'Escribe cómo te contactó el cliente', 'warning');
            return;
          }
          if (!CLIENT_SERVICIOS.includes(values.servicio)) values.servicio = 'Otro';
          if (values.tipoPropiedad && !CLIENT_TIPOS_PROPIEDAD.includes(values.tipoPropiedad)) values.tipoPropiedad = 'Otro';
          // Capacidad de pago vacía = pendiente: no se envía (no se guarda 0).
          if (values.capacidad === null || values.capacidad === undefined) delete values.capacidad;
          limpiarPagoSiVende(values);
          limpiarOtros(values, ['servicio', 'formaPago', 'tipoPropiedad', 'medio'], e.target);
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
              ${UI.field('email', 'Correo (opcional)', { type: 'email', value: record.email || '', placeholder: 'Puede dejarse vacío' })}
              ${fieldConOtro('medio', 'Medio de contacto', { value: record.medio || 'Otro', otroValue: record.medioOtro || '', options: CLIENT_MEDIOS.map((m) => ({ value: m, label: m })), otroWhen: MEDIO_OTROS, requiredWhen: ['Otro', 'Recomendación'], placeholder: 'Ej. Recomendado por el asesor Juan Pérez…', otroLabels: { Recomendación: '¿Quién te recomendó? *', Otro: 'Especifica cómo se enteró' }, otroPlaceholders: { Recomendación: 'Escribe el nombre de quien lo recomendó (cliente, asesor, familiar…)', Otro: 'Ej. Volante, evento, referido por…' } })}
              ${fieldConOtro('servicio', 'Operación', { value: record.servicio || 'Comprar', otroValue: record.servicioOtro || '', options: CLIENT_SERVICIOS.map((s) => ({ value: s, label: s })), placeholder: 'Ej. Permuta, herencia, ampliación…' })}
              ${fieldConOtro('tipoPropiedad', 'Tipo de propiedad', { value: record.tipoPropiedad || '', otroValue: record.tipoPropiedadOtro || '', options: [{ value: '', label: '— Sin especificar —' }, ...CLIENT_TIPOS_PROPIEDAD.map((t) => ({ value: t, label: t }))], placeholder: 'Ej. Penthouse, Predio industrial…' })}
              ${UI.field('zona', 'Zona deseada', { value: record.zona || '' })}
              <div id="pago-compra-box" style="display:contents;">
                ${fieldConOtro('formaPago', 'Forma de compra / pago (opcional)', { value: record.formaPago || '', otroValue: record.formaPagoOtro || '', options: [{ value: '', label: '— Pendiente (por confirmar) —' }, ...opcionesFormaPago(record.formaPago)], placeholder: 'Ej. Pago mixto, préstamo familiar…' })}
                ${UI.field('capacidad', 'Capacidad de pago ($)', { type: 'number', value: record.capacidad || '', placeholder: 'Pendiente / por confirmar' })}
              </div>
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
        wirePagoPorServicio(form);
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const values = UI.collectForm(e.target);
          // Los campos vacíos llegan como `null`: no se envían, para que
          // dejar algo en blanco (p. ej. el correo) no bloquee el guardado
          // ni borre lo que ya tenía guardado el cliente.
          Object.keys(values).forEach((key) => {
            if (values[key] === null) delete values[key];
          });
          if (values.medio && !CLIENT_MEDIOS.includes(values.medio)) values.medio = 'Otro';
          if ((values.medio === 'Otro' || values.medio === 'Recomendación') && !String(values.medioOtro || '').trim()) {
            UI.toast(values.medio === 'Recomendación'
              ? 'Escribe quién recomendó al cliente (nombre del asesor o recomendador)'
              : 'Escribe cómo te contactó el cliente', 'warning');
            return;
          }
          if (values.formaPago === 'Otro' && !String(values.formaPagoOtro || '').trim()) {
            UI.toast('Especifica la forma de pago del cliente', 'warning');
            return;
          }
          if (values.servicio && !CLIENT_SERVICIOS.includes(values.servicio)) values.servicio = 'Otro';
          if (values.tipoPropiedad !== null && values.tipoPropiedad !== undefined
            && !CLIENT_TIPOS_PROPIEDAD.includes(values.tipoPropiedad)) values.tipoPropiedad = 'Otro';
          limpiarPagoSiVende(values);
          limpiarOtros(values, ['servicio', 'tipoPropiedad', 'formaPago', 'medio'], e.target);
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
            <div id="pago-compra-box" style="display:contents;">
              ${fieldConOtro('formaPago', 'Forma de compra (opcional)', { value: record.formaPago || '', otroValue: record.formaPagoOtro || '', options: [{ value: '', label: '— Pendiente (por confirmar) —' }, ...opcionesFormaPago(record.formaPago)], placeholder: 'Ej. Pago mixto, préstamo familiar…' })}
              ${UI.field('capacidad', 'Capacidad de pago ($)', { type: 'number', value: record.capacidad || '', placeholder: 'Pendiente / por confirmar' })}
            </div>
            ${fieldConOtro('tipoPropiedad', 'Tipo de propiedad', { value: record.tipoPropiedad || '', otroValue: record.tipoPropiedadOtro || '', options: [{ value: '', label: '— Sin especificar —' }, ...CLIENT_TIPOS_PROPIEDAD.map((t) => ({ value: t, label: t }))], placeholder: 'Ej. Penthouse, predio industrial…' })}
            ${UI.field('zona', 'Zona deseada', { value: record.zona || '' })}
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
        wirePagoPorServicio(form);
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
            limpiarPagoSiVende(values);
            limpiarOtros(values, ['servicio', 'formaPago', 'tipoPropiedad'], e.target);
            ['servicio', 'servicioOtro', 'formaPago', 'formaPagoOtro', 'tipoPropiedad', 'tipoPropiedadOtro', 'zona', 'capacidad', 'queBusca'].forEach(putIfFilled);
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
        title: `Historial — ${esc(record.nombre)}`,
        body: '<div class="loading">Cargando historial…</div>',
        size: 680,
      });
      const bodyEl = modal.bodyEl;
      try {
        const [etapas, cambios] = await Promise.all([
          API.clients.historial(record._id).catch(() => []),
          API.clients.historialCambios(record._id).catch(() => []),
        ]);
        const etapasArr = Array.isArray(etapas) ? etapas : [];
        const cambiosArr = Array.isArray(cambios) ? cambios : [];

        if (!etapasArr.length && !cambiosArr.length) {
          bodyEl.innerHTML = '<p class="text-muted">Aún no hay movimientos en el historial.</p>';
          return;
        }

        const etapaItems = etapasArr.map((h) => {
          const who = h.usuario && typeof h.usuario === 'object' && h.usuario.name ? h.usuario.name : (h.usuario ? h.usuario : 'Admin');
          return `
            <li>
              <strong>${esc(h.etapaAnterior ? `${stageInfo(h.etapaAnterior).label} → ${stageInfo(h.etapaNueva || h.etapa).label}` : `Registro en ${stageInfo(h.etapaNueva || h.etapa).label}`)}</strong>
              <div class="text-muted" style="font-size:12px;">${Format.dateTime(h.fecha)} · ${esc(who)}</div>
              <div style="font-size:13px;">${esc(h.nota || '')}</div>
            </li>`;
        });

        const cambioItems = cambiosArr.map((c) => {
          const who = c.usuario && typeof c.usuario === 'object' && c.usuario.name ? c.usuario.name : (c.usuario ? c.usuario : 'Admin');
          const anterior = c.anterior === null || c.anterior === undefined || c.anterior === '' ? '<em class="text-muted">vacío</em>' : esc(String(c.anterior));
          const nuevo = c.nuevo === null || c.nuevo === undefined || c.nuevo === '' ? '<em class="text-muted">vacío</em>' : esc(String(c.nuevo));
          return `
            <li>
              <strong>${esc(c.campoLabel || c.campo)}</strong>: ${anterior} <span class="text-muted">→</span> ${nuevo}
              <div class="text-muted" style="font-size:12px;">${Format.dateTime(c.fecha)} · ${esc(who)}</div>
            </li>`;
        });

        bodyEl.innerHTML = `
          ${cambioItems.length ? `
            <h4 style="margin:0 0 10px;color:var(--primary);">✎ Cambios de perfil</h4>
            <ul class="timeline" style="margin-bottom:22px;">${cambioItems.join('')}</ul>
          ` : ''}
          ${etapaItems.length ? `
            <h4 style="margin:0 0 10px;color:var(--primary);">🔀 Movimientos de etapa</h4>
            <ul class="timeline">${etapaItems.join('')}</ul>
          ` : ''}
        `;
      } catch (error) {
        bodyEl.innerHTML = UI.errorAlert(error.message);
      }
    }

    loadCounts();
    load();
  },
};