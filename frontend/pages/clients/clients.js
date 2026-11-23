'use strict';

window.Pages = window.Pages || {};

// Medios en el MISMO orden y con los MISMOS valores que el enum del backend
// (models/client.model.js) para que ningún valor caiga fuera del enum.
const CLIENT_MEDIOS = ['WhatsApp', 'Facebook', 'Llamada', 'Portal', 'Portal Inmobiliario', 'Lona', 'Lona/Rótulo', 'Recomendación', 'Otro'];
// Medios donde el texto libre (medioOtro) está permitido. En "Recomendación"
// se pide QUIÉN recomendó; en "Otro" se pide especificar.
const MEDIO_OTROS = ['Recomendación', 'Recomendacion', 'Otro'];
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

function isBossUser() {
  const user = ApiClient.getStoredUser();
  return Boolean(user && user.role && ['admin', 'direccion', 'gerencia', 'asistencia', 'superadmin'].includes(user.role.code || user.role));
}

window.Pages.clients = {
  title: 'Clientes',

  async render(container) {
    if (!container) return;
    const state = {
      q: '',
      page: 1,
      servicio: '',
      tipoPropiedad: '',
      formaPago: '',
      medio: '',
      zona: '',
      minCapacity: '',
      maxCapacity: '',
      loading: false,
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
    const userOptions = UI.sortByLabel(users, (u) => u.name)
      .map((u) => ({ value: u._id, label: u.name }));

    container.innerHTML = `
      <div class="clients-toolbar">
        <input class="form-control" id="clients-search" type="search" placeholder="Buscar por nombre, teléfono o correo…">
        <button class="btn btn-primary" id="clients-add" type="button">+ Nuevo cliente</button>
        <button class="btn btn-secondary" id="clients-csv" type="button">&#11015;&nbsp; Exportar CSV</button>
        <button class="btn btn-secondary" id="clients-whatsnew" type="button">&#127881;&nbsp; Novedades</button>
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
          <label class="clients-filter" id="clients-f-pago-wrap" style="display: none;">
            <span>Forma de pago</span>
            <select class="form-control" id="clients-f-pago">
              <option value="">Todas</option>
              ${[...CLIENT_FORMAS_PAGO, ...FORMAS_PAGO_LEGADAS]
                .map((f) => `<option value="${f}">${FORMA_PAGO_LABELS[f] || f}</option>`).join('')}
            </select>
          </label>
          <label class="clients-filter">
            <span>¿Cómo se enteró?</span>
            <select class="form-control" id="clients-f-medio">
              <option value="">Todos</option>
              ${CLIENT_MEDIOS.map((m) => `<option value="${m}">${m}</option>`).join('')}
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
    const filtersBox = container.querySelector('#clients-filters-box');
    const fServicio = container.querySelector('#clients-f-servicio');
    const fTipo = container.querySelector('#clients-f-tipo');
    const fPago = container.querySelector('#clients-f-pago');
    const fPagoWrap = container.querySelector('#clients-f-pago-wrap');
    const fMedio = container.querySelector('#clients-f-medio');
    const fZona = container.querySelector('#clients-f-zona');
    const fMin = container.querySelector('#clients-f-min');
    const fMax = container.querySelector('#clients-f-max');
    const fClear = container.querySelector('#clients-f-clear');

    const esc = (v) => UI.escapeHtml(v == null ? '' : v);
    // Para valores dentro de atributos HTML. escapeHtml NO escapa comillas y
    // los data-* de abajo llevan JSON con comillas: sin esto el navegador corta
    // el atributo en la primera comilla (`data-otro-when="["`), parseWhen falla
    // y "Recomendación" no coincide con el valor por defecto ['Otro'].
    const escAttr = (v) => esc(v).replace(/"/g, '&quot;').replace(/'/g, '&#39;');

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
      const optionValues = options.map((o) => String(typeof o === 'object' ? o.value : o));
      const optsArray = options.map((o) => {
        const optValue = typeof o === 'object' ? o.value : o;
        const optLabel = typeof o === 'object' ? o.label : o;
        return `<option value="${escAttr(optValue)}"${String(optValue) === String(value) ? ' selected' : ''}>${esc(optLabel)}</option>`;
      });
      // Si el dato guardado no está en el catálogo actual (p. ej. un valor
      // legado), se agrega como opción seleccionada para que al editar no se
      // muestre otro valor y luego se sobrescriba el original.
      if (value && !optionValues.includes(String(value))) {
        optsArray.unshift(`<option value="${escAttr(value)}" selected>${esc(value)}</option>`);
      }
      const opts = optsArray.join('');
      // Etiqueta PROPIA del campo condicional. Al elegir "Recomendación" debe
      // aparecer de inmediato "¿Quién te recomendó?" (no sólo un placeholder
      // suelto debajo del select), por eso el texto vive en su propio <label>.
      const otroLabelText = otroLabels[value] || (value ? '' : '');
      return `
        <div style="${full ? 'grid-column:1/-1;' : ''}margin-bottom:16px;">
          <label for="${id}" style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;">${esc(label)}${required ? ' *' : ''}</label>
          <select class="form-control" id="${id}" name="${name}" data-otro-input="${otrosId}" data-otro-when="${escAttr(JSON.stringify(otroWhen))}" data-required-when="${escAttr(JSON.stringify(requiredWhen))}" data-otro-labels="${escAttr(JSON.stringify(otroLabels))}" data-otro-placeholders="${escAttr(JSON.stringify(otroPlaceholders))}"${required ? ' required' : ''}>${opts}</select>
          <div data-otro-box style="display:${isOtro ? 'block' : 'none'};margin-top:10px;">
            <label data-otro-label for="${otrosId}" style="display:${isOtro ? 'block' : 'none'};font-size:13px;font-weight:600;margin-bottom:4px;color:var(--warning,#b45309);">${esc(otroLabelText || 'Especifica *')}</label>
            <input class="form-control" id="${otrosId}" name="${name}Otro" type="text" value="${escAttr(otroValue)}" placeholder="${escAttr(placeholder)}" style="display:${isOtro ? 'block' : 'none'};">
          </div>
        </div>`;
    }

    // Muestra/oculta el texto "Otro" y limpia el valor cuando ya no aplica.
    function wireOtros(root) {
      root.querySelectorAll('select[data-otro-input]').forEach((select) => {
        // Se busca por id y, como respaldo, por el nombre del campo
        // (`medioOtro`, `servicioOtro`…). Así el campo de "¿Quién te
        // recomendó?" aparece aunque el navegador haya regenerado el DOM.
        const input = root.querySelector('#' + select.dataset.otroInput)
          || document.getElementById(select.dataset.otroInput)
          || root.querySelector(`[name="${select.name}Otro"]`);
        if (!input) return;
        const otroWhen = parseWhen(select.dataset.otroWhen, ['Otro']);
        const requiredWhen = parseWhen(select.dataset.requiredWhen, ['Otro']);
        const otroLabels = parseWhen(select.dataset.otroLabels, {});
        const otroPlaceholders = parseWhen(select.dataset.otroPlaceholders, {});
        // El campo condicional tiene su PROPIO label ("¿Quién te recomendó?").
        // Antes se reutilizaba el label principal del select y el aviso quedaba
        // poco claro: el usuario veía un input sin pregunta hasta guardar.
        const box = input.closest('[data-otro-box]');
        const labelEl = box ? box.querySelector('[data-otro-label]') : null;
        const baseLabel = labelEl ? labelEl.textContent : 'Especifica *';
        const basePlaceholder = input.getAttribute('placeholder') || '';
        const sync = () => {
          const show = otroWhen.includes(select.value);
          if (box) box.style.display = show ? 'block' : 'none';
          input.style.display = show ? 'block' : 'none';
          if (labelEl) labelEl.style.display = show ? 'block' : 'none';
          input.required = show && requiredWhen.includes(select.value) && select.required;
          // Texto y placeholder específicos por opción: en "Recomendación" el
          // campo pregunta claramente QUIÉN recomendó; en "Otro" pide
          // especificar cómo se enteró.
          const key = otroLabels[select.value] || otroPlaceholders[select.value] ? select.value : (select.value === 'Recomendacion' ? 'Recomendación' : select.value);
          if (labelEl) {
            labelEl.textContent = otroLabels[select.value] || otroLabels[key] || baseLabel;
          }
          if (otroPlaceholders[select.value] || otroPlaceholders[key]) {
            input.setAttribute('placeholder', otroPlaceholders[select.value] || otroPlaceholders[key]);
          } else {
            input.setAttribute('placeholder', basePlaceholder);
          }
          // Permitir escribir en ambas opciones, no limpiar
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
        // `otroWhen`/`requiredWhen` son arreglos, pero `otroLabels` y
        // `otroPlaceholders` son objetos. Antes se exigía Array siempre y los
        // textos de "Recomendación"/"Otro" se perdían.
        if (Array.isArray(fallback)) {
          return Array.isArray(parsed) && parsed.length ? parsed : fallback;
        }
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
      } catch (error) {
        return fallback;
      }
    }

    // Lleva el cursor al campo de texto que falta (p. ej. "¿Quién te
    // recomendó?") y se asegura de que esté visible antes de mostrar el aviso.
    function focusOtro(root, name) {
      if (!root) return;
      const input = root.querySelector(`[name="${name}Otro"]`);
      if (!input) return;
      const box = input.closest('[data-otro-box]');
      if (box) box.style.display = 'block';
      const labelEl = box ? box.querySelector('[data-otro-label]') : null;
      if (labelEl) labelEl.style.display = 'block';
      input.style.display = 'block';
      try { input.focus(); } catch (error) { /* noop */ }
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

    // En los filtros avanzados la forma de pago sólo aplica cuando la
    // operación seleccionada es "Comprar". Al ocultarla se limpia su valor
    // para que no quede un filtro fantasma al cambiar a "Vender" (u otra).
    function syncFiltroPagoPorServicio() {
      const visible = Boolean(fServicio && fServicio.value === 'Comprar');
      if (fPagoWrap) fPagoWrap.style.display = visible ? '' : 'none';
      if (!visible && fPago) fPago.value = '';
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

    function hasAdvancedFilters() {
      return Boolean(state.servicio || state.tipoPropiedad || state.formaPago || state.medio || state.zona || state.minCapacity || state.maxCapacity);
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
        state.formaPago && `pago: ${state.formaPago}`,
        state.medio && `medio: ${state.medio}`,
        state.zona && `zona: ${state.zona}`,
        state.minCapacity !== '' && `desde ${Format.currency(state.minCapacity)}`,
        state.maxCapacity !== '' && `hasta ${Format.currency(state.maxCapacity)}`,
      ].filter(Boolean);
      summary.textContent = activos.length ? `Filtros avanzados (${activos.length}) — ${activos.join(' · ')}` : 'Filtros avanzados';
    }

    let searchTimer = null;
    if (searchEl) searchEl.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.q = searchEl.value.trim(); state.page = 1; load(); }, 350);
    });
    if (addBtn) addBtn.addEventListener('click', () => openQuickCreate());

    // Mismos parámetros para el listado y para el CSV: así el archivo
    // exportado respeta exactamente lo que el asesor tiene en pantalla.
    function filterParams() {
      return {
        q: state.q || undefined,
        servicio: state.servicio || undefined,
        tipoPropiedad: state.tipoPropiedad || undefined,
        formaPago: state.servicio === 'Comprar' ? (state.formaPago || undefined) : undefined,
        medio: state.medio || undefined,
        zona: state.zona || undefined,
        minCapacity: state.minCapacity === '' ? undefined : state.minCapacity,
        maxCapacity: state.maxCapacity === '' ? undefined : state.maxCapacity,
      };
    }

    const csvBtn = container.querySelector('#clients-csv');
    if (csvBtn) csvBtn.addEventListener('click', async () => {
      try {
        UI.toast('Generando CSV de clientes...', 'info');
        await API.clients.exportCsv(filterParams());
        UI.toast('CSV de clientes exportado', 'success');
      } catch (error) {
        UI.toast(error.message, 'error');
      }
    });
    const whatsnewBtn = container.querySelector('#clients-whatsnew');
    if (whatsnewBtn) whatsnewBtn.addEventListener('click', () => {
      if (window.WhatsNew) window.WhatsNew.open();
    });
    function applyFilters() {
      syncFiltroPagoPorServicio();
      state.servicio = fServicio ? fServicio.value : '';
      state.tipoPropiedad = fTipo ? fTipo.value : '';
      state.formaPago = fPago ? fPago.value : '';
      state.medio = fMedio ? fMedio.value : '';
      state.zona = fZona ? fZona.value.trim() : '';
      state.minCapacity = fMin && fMin.value !== '' ? Number(fMin.value) : '';
      state.maxCapacity = fMax && fMax.value !== '' ? Number(fMax.value) : '';
      state.page = 1;
      paintFiltersSummary();
      load();
    }
    [fServicio, fTipo, fPago, fMedio].forEach((el) => { if (el) el.addEventListener('change', applyFilters); });
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
      if (fPago) fPago.value = '';
      if (fMedio) fMedio.value = '';
      if (fZona) fZona.value = '';
      if (fMin) fMin.value = '';
      if (fMax) fMax.value = '';
      applyFilters();
    });
    syncFiltroPagoPorServicio();

    async function load() {
      if (state.loading) return;
      state.loading = true;
      gridEl.innerHTML = '<div class="loading">Cargando clientes…</div>';
      try {
        const result = await API.clients.list({
          ...filterParams(),
          page: state.page,
          limit: 16,
        });
        const items = (result && result.data) || [];
        const meta = (result && result.meta) || {};
        state.page = meta.page || 1;

        if (!items.length) {
          gridEl.innerHTML = `
            <div class="clients-empty">
              ${state.q || hasAdvancedFilters()
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
      const telefono = Format.digits(c.telefono || '');
      const whatsapp = telefono ? Format.whatsappLink(telefono) : '';
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
        <article class="client-card">
          <div class="client-card-head">
            <div class="client-card-title">
              <strong>${esc(c.nombre)}</strong>
              <div class="client-card-meta">
                ${[c.email, c.asesorAsignado ? `Asesor: ${c.asesorAsignado.name || ''}` : ''].filter(Boolean).map((v) => esc(v)).join(' · ') || '—'}
              </div>
            </div>
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

          <div class="client-card-actions">
            ${whatsapp ? `<a class="btn btn-sm crm-btn-wa" href="${whatsapp}" target="_blank" rel="noopener" title="Enviar WhatsApp">WhatsApp</a>` : ''}
            <button class="btn btn-secondary btn-sm" type="button" data-action="llamada" data-record="${c._id}" title="Marcar el teléfono del cliente y registrar la llamada en su bitácora">&#128222; Llamar</button>
            <button class="btn btn-secondary btn-sm" type="button" data-action="perfil" data-record="${c._id}" title="Editar perfil inmobiliario">Editar Perfil</button>
            <button class="btn btn-primary btn-sm" type="button" data-action="nota" data-record="${c._id}" title="Agregar una nota al historial">+ Nota</button>
            <button class="btn btn-secondary btn-sm" type="button" data-action="historial" data-record="${c._id}" title="Ver historial completo">Ver Historial</button>
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
        // Normaliza el número a formato internacional (52 + 10 dígitos) para
        // que el marcador lo marque bien aunque el asesor esté en otra lada.
        const numero = Format.waNumber(record.telefono);
        if (!numero) {
          UI.toast('Este cliente no tiene un teléfono registrado.', 'warning');
          return;
        }
        // Se abre DENTRO del gesto del clic (antes de cualquier await): en
        // móvil, si se lanza el esquema tel: después de la petición, algunos
        // navegadores no abren el marcador por haber perdido ese gesto.
        const link = document.createElement('a');
        link.href = `tel:+${numero}`;
        link.style.display = 'none';
        document.body.appendChild(link);
        try { link.click(); } catch (error) { /* en escritorio puede no haber app de llamadas */ }
        link.remove();
        try {
          await API.clients.registrarLlamada(record._id);
          UI.toast('Llamada registrada en el historial del cliente', 'success');
          load();
        } catch (error) {
          UI.toast(error.message, 'error');
        }
        return;
      }
      if (action === 'perfil') return openProfileModal(record);
      if (action === 'nota') return openNotaModal(record);
      if (action === 'historial') return openHistorialModal(record);
      if (action === 'cita') { window.location.href = 'appointments.html'; return; }
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
                ${UI.field('capacidad', 'Capacidad de pago', { type: 'money', placeholder: 'Pendiente / por confirmar' })}
              </div>
              ${fieldConOtro('tipoPropiedad', '¿Qué tipo de propiedad busca?', {
                options: [{ value: '', label: '— Sin especificar —' }, ...CLIENT_TIPOS_PROPIEDAD.map((t) => ({ value: t, label: t }))],
                placeholder: 'Ej. Penthouse, predio industrial…',
              })}
              ${UI.field('zona', 'Zona de interés', { placeholder: 'Ej. Zona norte, cerca del centro…' })}
              ${fieldConOtro('medio', '¿Cómo se enteró de nosotros?', {
                options: CLIENT_MEDIOS.map((m) => ({ value: m, label: m })),
                otroWhen: ['Recomendación', 'Recomendacion', 'Otro'],
                requiredWhen: ['Recomendación', 'Recomendacion', 'Otro'],
                placeholder: 'Ej. Recomendado por el asesor Juan Pérez…',
                otroLabels: { Recomendación: '¿Quién te recomendó? *', Recomendacion: '¿Quién te recomendó? *', Otro: 'Especifica cómo se enteró *' },
                otroPlaceholders: {
                  Recomendación: 'Escribe el nombre de quien lo recomendó (cliente, asesor, familiar…)',
                  Recomendacion: 'Escribe el nombre de quien lo recomendó (cliente, asesor, familiar…)',
                  Otro: 'Ej. Volante, evento, referido por…',
                },
              })}
              ${UI.field('notasGenerales', 'Notas / observaciones de la plática', { type: 'textarea', rows: 3, full: true, placeholder: 'Qué platicaron, compromisos, seguimiento acordado…' })}
              ${isBossUser() ? UI.field('asesorAsignado', 'Asesor asignado', { type: 'select', sinOtros: true, options: [{ value: '', label: '— Yo mismo —' }, ...userOptions], hint: 'Solo administración/gerencia puede asignar.' }) : ''}
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
            focusOtro(e.target, 'servicio');
            UI.toast('Escribe qué operación quiere hacer el cliente', 'warning');
            return;
          }
          // Forma de compra: OPCIONAL (puede quedar "Pendiente"). Solo se
          // exige texto cuando se eligió "Otro". Si el cliente viene a
          // VENDER, el bloque ni se muestra y no se envía al servidor.
          if (values.formaPago === 'Otro' && !String(values.formaPagoOtro || '').trim()) {
            focusOtro(e.target, 'formaPago');
            UI.toast('Especifica la forma de pago del cliente', 'warning');
            return;
          }
          if (values.asesorAsignado === '') delete values.asesorAsignado;
          if (values.medio && !CLIENT_MEDIOS.includes(values.medio)) values.medio = 'Otro';
          if ((values.medio === 'Otro' || values.medio === 'Recomendación' || values.medio === 'Recomendacion') && !String(values.medioOtro || '').trim()) {
            focusOtro(e.target, 'medio');
            UI.toast((values.medio === 'Recomendación' || values.medio === 'Recomendacion')
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
            await API.clients.create(values);
            UI.closeModal();
            UI.toast('Cliente registrado', 'success');
            load();
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
              ${UI.field('nombre', 'Nombre completo', { required: true, full: true, value: record.nombre || '', placeholder: 'Ej. María López' })}
              ${UI.field('telefono', 'Teléfono', { type: 'tel', value: record.telefono || '' })}
              ${UI.field('email', 'Correo (opcional)', { type: 'email', value: record.email || '', placeholder: 'Puede dejarse vacío' })}
              ${fieldConOtro('medio', 'Medio de contacto', { value: record.medio || 'Otro', otroValue: record.medioOtro || record.recomendadoPor || '', options: CLIENT_MEDIOS.map((m) => ({ value: m, label: m })), otroWhen: ['Recomendación', 'Recomendacion', 'Otro'], requiredWhen: ['Recomendación', 'Recomendacion', 'Otro'], placeholder: 'Ej. Recomendado por el asesor Juan Pérez…', otroLabels: { Recomendación: '¿Quién te recomendó? *', Recomendacion: '¿Quién te recomendó? *', Otro: 'Especifica cómo se enteró *' }, otroPlaceholders: { Recomendación: 'Escribe el nombre de quien lo recomendó (cliente, asesor, familiar…)', Recomendacion: 'Escribe el nombre de quien lo recomendó (cliente, asesor, familiar…)', Otro: 'Ej. Volante, evento, referido por…' } })}
              ${fieldConOtro('servicio', 'Operación', { value: record.servicio || 'Comprar', otroValue: record.servicioOtro || '', options: CLIENT_SERVICIOS.map((s) => ({ value: s, label: s })), placeholder: 'Ej. Permuta, herencia, ampliación…' })}
              ${fieldConOtro('tipoPropiedad', 'Tipo de propiedad', { value: record.tipoPropiedad || '', otroValue: record.tipoPropiedadOtro || '', options: [{ value: '', label: '— Sin especificar —' }, ...CLIENT_TIPOS_PROPIEDAD.map((t) => ({ value: t, label: t }))], placeholder: 'Ej. Penthouse, Predio industrial…' })}
              ${UI.field('zona', 'Zona deseada', { value: record.zona || '' })}
              <div id="pago-compra-box" style="display:contents;">
                ${fieldConOtro('formaPago', 'Forma de compra / pago (opcional)', { value: record.formaPago || '', otroValue: record.formaPagoOtro || '', options: [{ value: '', label: '— Pendiente (por confirmar) —' }, ...opcionesFormaPago(record.formaPago)], placeholder: 'Ej. Pago mixto, préstamo familiar…' })}
                ${UI.field('capacidad', 'Capacidad de pago', { type: 'money', value: record.capacidad || '', placeholder: 'Pendiente / por confirmar' })}
              </div>
              ${UI.field('queBusca', '¿Qué busca?', { type: 'textarea', rows: 6, value: record.queBusca || '', full: true, placeholder: 'Ej. casa de 2 recámaras con cochera en zona norte' })}
              ${UI.field('notasGenerales', 'Notas', { type: 'textarea', rows: 4, value: record.notasGenerales || '', full: true, placeholder: 'Comentarios adicionales del cliente…' })}
              ${isBossUser() ? UI.field('asesorAsignado', 'Asesor asignado', { type: 'select', sinOtros: true, options: [{ value: '', label: '— Yo mismo —' }, ...userOptions], value: record.asesorAsignado || '', hint: 'Solo administración/gerencia puede asignar.' }) : ''}
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
          if (!String(values.nombre || '').trim()) {
            UI.toast('Escribe el nombre del cliente', 'warning');
            return;
          }
          if (values.asesorAsignado === '') delete values.asesorAsignado;
          if (values.medio && !CLIENT_MEDIOS.includes(values.medio)) values.medio = 'Otro';
          if ((values.medio === 'Otro' || values.medio === 'Recomendación' || values.medio === 'Recomendacion') && !String(values.medioOtro || '').trim()) {
            focusOtro(e.target, 'medio');
            UI.toast((values.medio === 'Recomendación' || values.medio === 'Recomendacion')
              ? 'Escribe quién recomendó al cliente (nombre del asesor o recomendador)'
              : 'Escribe cómo te contactó el cliente', 'warning');
            return;
          }
          if (values.formaPago === 'Otro' && !String(values.formaPagoOtro || '').trim()) {
            focusOtro(e.target, 'formaPago');
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

    /* ── Notas e historial único ────────────────────────────────────────── */
    function openNotaModal(record, onSaved) {
      const modal = UI.openModal({
        title: `Agregar nota — ${esc(record.nombre)}`,
        body: `
          <form id="client-nota-form" novalidate>
            <div class="form-group">
              <label for="nota-texto">Nota</label>
              <textarea class="form-control" id="nota-texto" name="nota" rows="4" required placeholder="Escribe aquí la nota, novedad o seguimiento del cliente…"></textarea>
            </div>
          </form>`,
        footer: `
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary" type="submit" form="client-nota-form">Guardar nota</button>`,
        size: 520,
      });
      const overlay = modal.bodyEl ? modal.bodyEl.closest('#modal-overlay') : null;
      const cancel = overlay ? overlay.querySelector('[data-cancel]') : null;
      if (cancel) cancel.addEventListener('click', () => UI.closeModal());
      const form = modal.bodyEl ? modal.bodyEl.querySelector('#client-nota-form') : null;
      const input = form ? form.querySelector('#nota-texto') : null;
      if (input) setTimeout(() => { try { input.focus(); } catch (e) { /* noop */ } }, 50);
      if (form) form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nota = input ? input.value.trim() : '';
        if (!nota) { UI.toast('Escribe una nota antes de guardar.', 'warning'); return; }
        try {
          await API.clients.addNota(record._id, nota);
          UI.closeModal();
          UI.toast('Nota agregada al historial', 'success');
          if (typeof onSaved === 'function') await onSaved();
          else load();
        } catch (error) {
          UI.toast(error.message, 'error');
        }
      });
    }

    /* ── Historial completo: notas, llamadas, cambios y etapas antiguas ── */
    async function openHistorialModal(record) {
      const modal = UI.openModal({
        title: `Historial — ${esc(record.nombre)}`,
        body: '<div class="loading">Cargando historial…</div>',
        size: 860,
      })
      const bodyEl = modal.bodyEl
      let items = []

      const TYPE_BADGES = {
        nota: { label: 'Nota', color: '#5B2D8E', bg: '#5B2D8E22' },
        llamada: { label: 'Llamada', color: '#0ea5e9', bg: '#0ea5e922' },
        cambio: { label: 'Cambio', color: '#d97706', bg: '#d9770622' },
        etapa: { label: 'Etapa (antigua)', color: '#64748b', bg: '#64748b22' },
      }

      const render = () => {
        const addBtnHtml = '<button class="btn btn-primary btn-sm" type="button" data-add-nota>+ Agregar nota</button>'
        if (!items.length) {
          bodyEl.innerHTML = `
            <div style="display:flex;justify-content:flex-end;margin-bottom:10px;">${addBtnHtml}</div>
            <p class="text-muted">Aún no hay movimientos en el historial de este cliente.</p>`
        } else {
          bodyEl.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
              <span class="text-muted">${items.length} registro${items.length === 1 ? '' : 's'} · más reciente primero</span>
              ${addBtnHtml}
            </div>
            <div style="overflow-x:auto;">
              <table class="table" style="min-width:660px;">
                <thead><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th><th>Nota</th><th>Registró</th></tr></thead>
                <tbody>
                  ${items.map((it) => {
                    const badge = TYPE_BADGES[it.tipo] || TYPE_BADGES.cambio
                    return `<tr>
                      <td data-label="Fecha" style="white-space:nowrap;">${esc(Format.dateTime(it.fecha))}</td>
                      <td data-label="Tipo"><span class="badge" style="background:${badge.bg};color:${badge.color};">${esc(badge.label)}</span></td>
                      <td data-label="Detalle"><strong>${esc(it.titulo || '—')}</strong>${it.detalle ? `<div class="text-muted" style="font-size:12.5px;">${esc(it.detalle)}</div>` : ''}</td>
                      <td data-label="Nota">${esc(it.nota || '—')}</td>
                      <td data-label="Registró">${esc(it.usuario || '—')}</td>
                    </tr>`
                  }).join('')}
                </tbody>
              </table>
            </div>`
        }
        const addBtn = bodyEl.querySelector('[data-add-nota]')
        // openModal() reemplaza el modal abierto: al guardar la nota volvemos a
        // abrir el historial para que el usuario vea el nuevo renglón.
        if (addBtn) addBtn.addEventListener('click', () => openNotaModal(record, () => openHistorialModal(record)))
      }

      const refresh = async () => {
        try {
          const res = await API.clients.historialCompleto(record._id)
          items = Array.isArray(res) ? res : ((res && res.data) || [])
          render()
        } catch (error) {
          bodyEl.innerHTML = UI.errorAlert(error.message)
        }
      }
      await refresh()
    }
    load();
    // Se difiere unos instantes para no apilar el aviso con la bienvenida
    // que se carga al iniciar sesión. Si hay otro overlay, maybeShow() lo omite
    // sin marcarlo como visto para que aparezca en la próxima apertura.
    setTimeout(() => {
      if (window.WhatsNew) window.WhatsNew.maybeShow();
    }, 900);
  },
};