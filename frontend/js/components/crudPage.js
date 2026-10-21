'use strict';

function crudPage(container, config) {
  const state = { page: 1, q: '', status: '', records: [], meta: null, filters: {} };
  let filterTimer = null;

  function renderHeader() {
    const el = document.createElement('div');
    el.className = 'page-header';
    el.innerHTML = `
      <h2>${UI.escapeHtml(config.title)}</h2>
      <button class="btn btn-primary" type="button" data-new>+ ${UI.escapeHtml(config.newLabel)}</button>
    `;
    el.querySelector('[data-new]').addEventListener('click', () => {
      if (config.onNew) config.onNew(openForm);
      else openForm();
    });
    return el;
  }

  function renderToolbar() {
    const el = document.createElement('div');
    el.style.cssText = 'display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center;';
    let statusSelect = '';
    if (config.statusOptions) {
      const opts = config.statusOptions
        .map((o) => {
          const val = typeof o === 'object' ? o.value : o;
          const lbl = typeof o === 'object' ? o.label : o;
          const sel = state.status === val ? 'selected' : '';
          return `<option value="${UI.escapeHtml(val)}" ${sel}>${UI.escapeHtml(lbl)}</option>`;
        })
        .join('');
      statusSelect = `
        <select class="form-control" data-status style="max-width:220px;">
          <option value="">Todos los estados</option>
          ${opts}
        </select>
      `;
    }
    // Filtros adicionales configurables: { key, label, placeholder, options[] | type }.
    // Cada control escribe en state.filters y recarga la página al cambiar.
    const filterControls = config.filters && config.filters.length
      ? config.filters.map((f) => {
        if (f.options) {
          const opts = f.options
            .map((o) => `<option value="${UI.escapeHtml(typeof o === 'object' ? o.value : o)}">${UI.escapeHtml(typeof o === 'object' ? o.label : o)}</option>`)
            .join('');
          return `
            <select class="form-control" data-filter="${UI.escapeHtml(f.key)}" style="max-width:${f.width || 220}px;">
              <option value="">${UI.escapeHtml(f.placeholder || `Todos los ${String(f.label).toLowerCase()}`)}</option>
              ${opts}
            </select>
          `;
        }
        return `
          <input class="form-control" data-filter="${UI.escapeHtml(f.key)}" type="${f.type || 'text'}" placeholder="${UI.escapeHtml(f.placeholder || f.label)}" style="max-width:${f.width || 200}px;">
        `;
      }).join('')
      : '';

    el.innerHTML = `
      <input class="form-control" data-search placeholder="Buscar..." style="max-width:280px;" value="${UI.escapeHtml(state.q)}">
      ${statusSelect}
      ${filterControls}
      <button class="btn btn-secondary btn-sm" type="button" data-export-xls title="Exportar a Excel">&#128196;&nbsp; Excel</button>
      <button class="btn btn-secondary btn-sm" type="button" data-export-pdf title="Exportar a PDF (imprime o guarda como PDF)">&#128424;&nbsp; PDF</button>
      ${config.csvExport ? `<button class="btn btn-secondary btn-sm" type="button" data-export-csv title="Exportar a CSV">&#11015;&nbsp; CSV</button>` : ''}
    `;
    el.querySelector('[data-search]').addEventListener('input', (e) => {
      state.q = e.target.value;
      state.page = 1;
      load();
    });
    el.querySelectorAll('[data-filter]').forEach((ctl) => {
      const key = ctl.dataset.filter;
      ctl.value = state.filters[key] || '';
      const isSelect = ctl.tagName === 'SELECT';
      ctl.addEventListener(isSelect ? 'change' : 'input', () => {
        state.filters[key] = ctl.value;
        clearTimeout(filterTimer);
        // El select aplica al instante; los inputs numéricos debouncean (300 ms).
        filterTimer = setTimeout(() => { state.page = 1; load(); }, isSelect ? 0 : 300);
      });
    });
    const statusEl = el.querySelector('[data-status]');
    if (statusEl) {
      statusEl.addEventListener('change', () => {
        state.status = statusEl.value;
        state.page = 1;
        load();
      });
    }
    el.querySelector('[data-export-xls]').addEventListener('click', () => exportXls());
    el.querySelector('[data-export-pdf]').addEventListener('click', () => exportPdf());
    const csvEl = el.querySelector('[data-export-csv]');
    if (csvEl) csvEl.addEventListener('click', () => config.csvExport());
    return el;
  }

  function currentParams() {
    const params = { page: 1, limit: 100 };
    if (state.q) params.q = state.q;
    if (state.status) params.status = state.status;
    Object.entries(state.filters).forEach(([key, value]) => {
      if (value !== '') params[key] = value;
    });
    if (config.defaultParams) Object.assign(params, config.defaultParams);
    return params;
  }

  async function fetchAllForExport() {
    const first = await config.service.list(currentParams());
    let records = first.data.slice();
    const pages = first.meta ? first.meta.pages : 1;
    for (let p = 2; p <= pages; p += 1) {
      const res = await config.service.list(Object.assign(currentParams(), { page: p }));
      records = records.concat(res.data);
    }
    return records;
  }

  function cellText(record, col) {
    if (col.render) {
      const div = document.createElement('div');
      div.innerHTML = col.render(record) || '';
      return div.textContent.replace(/\s+/g, ' ').trim();
    }
    const value = record[col.key];
    return value == null ? '' : String(value);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // Se revoca con margen: revocar en 0ms puede cancelar la descarga en
    // algunos navegadores móviles justo cuando el archivo empieza a guardarse.
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
  }

  function buildExcelXml(title, records) {
    const rowXml = records.map((r) => {
      const cells = config.columns.map((c) => {
        const text = cellText(r, c).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const isNumber = /^[0-9]+([.,][0-9]+)?$/.test(text) && !/[A-Za-z]/.test(text);
        return `<Cell><Data ss:Type="${isNumber ? 'Number' : 'String'}">${text.replace(/,/g, '.')}</Data></Cell>`;
      }).join('');
      return `<Row>${cells}</Row>`;
    }).join('');
    const headCells = config.columns.map((c) =>
      `<Cell><Data ss:Type="String">${UI.escapeHtml(c.label)}</Data></Cell>`
    ).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:x="urn:schemas-microsoft-com:office:excel">
<Worksheet ss:Name="Datos">
<Table>
<Row>${headCells}</Row>
${rowXml}
</Table>
</Worksheet>
</Workbook>`;
  }

  async function exportXls() {
    try {
      const records = await fetchAllForExport();
      if (!records.length) { UI.toast('No hay datos para exportar', 'warning'); return; }
      const xml = buildExcelXml(config.title, records);
      downloadBlob(new Blob(['\ufeff', xml], { type: 'application/vnd.ms-excel;charset=utf-8;' }),
        `${config.title.toLowerCase().replace(/\s+/g, '-')}.xls`);
      UI.toast(`${records.length} registros exportados a Excel`, 'success');
    } catch (error) {
      UI.toast(error.message, 'error');
    }
  }

  async function exportPdf() {
    let records;
    try {
      records = await fetchAllForExport();
    } catch (error) {
      UI.toast(error.message, 'error');
      return;
    }
    if (!records.length) { UI.toast('No hay datos para exportar', 'warning'); return; }
    const rows = records.map((r) =>
      `<tr>${config.columns.map((c) => `<td>${UI.escapeHtml(cellText(r, c))}</td>`).join('')}</tr>`
    ).join('');
    const head = config.columns.map((c) => `<th>${UI.escapeHtml(c.label)}</th>`).join('');
    const title = UI.escapeHtml(config.title);
    const when = new Date().toLocaleString('es-MX');
    // Se imprime en un iframe de la MISMA página (no window.open): así el móvil
    // abre el diálogo nativo de "Guardar como PDF" sin sacar al usuario de la app.
    UI.printHtmlDocument(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${title}</title>
      <style>
        body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; margin: 24px; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        .meta { font-size: 12px; color: #6b7280; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
        th { background: #1e5aa8; color: #fff; }
        tr:nth-child(even) td { background: #f9fafb; }
        @media print { body { margin: 12mm; } }
      </style></head><body>
      <h1>${title}</h1>
      <div class="meta">Generado el ${UI.escapeHtml(when)} &middot; ${records.length} registros</div>
      <table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
      </body></html>`);
  }

  function renderTable() {
    if (!state.records.length) {
      const el = document.createElement('div');
      el.className = 'card';
      el.innerHTML = '<div class="empty-state"><p>No hay registros.</p></div>';
      return el;
    }

    const table = document.createElement('div');
    table.className = 'table-wrapper card';
    const thead = config.columns.map((c) => `<th>${UI.escapeHtml(c.label)}</th>`).join('');
    let rows = '';
    const editButtons = [];
    state.records.forEach((record) => {
      const cells = config.columns
        .map((c) => {
          const label = UI.escapeHtml(c.label);
          if (c.render) {
            const rendered = c.render(record);
            return `<td data-label="${label}">${rendered == null ? '—' : rendered}</td>`;
          }
          const raw = record[c.key];
          return `<td data-label="${label}">${raw == null ? '—' : UI.escapeHtml(raw)}</td>`;
        })
        .join('');
      let actions = '';
      if (config.extraActions) actions += config.extraActions(record);
      if (config.onEdit) {
        const editHandler = typeof config.onEdit === 'function' ? config.onEdit : (rec) => openForm(rec);
        actions += `<button class="btn btn-secondary btn-sm" data-edit="${record._id}" style="margin-left:6px;">Editar</button>`;
        editButtons.push({ id: record._id, rec: record, handler: editHandler });
      }
      if (config.onRemove) {
        actions += `<button class="btn btn-danger btn-sm" data-remove="${record._id}" style="margin-left:6px;">Eliminar</button>`;
      }
      rows += `<tr data-record="${record._id}">${cells}<td data-label="Acciones">${actions}</td></tr>`;
    });

    table.innerHTML = `
      <table class="table">
        <thead><tr>${thead}<th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    for (const eb of editButtons) {
      table.querySelectorAll(`[data-edit="${eb.id}"]`).forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          eb.handler(eb.rec, openForm);
        });
      });
    }
    table.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const record = state.records.find((r) => r._id === btn.dataset.remove);
        const ok = await UI.confirm(`¿Eliminar este registro?`);
        if (!ok) return;
        try {
          await config.service.remove(record._id);
          UI.toast('Registro eliminado', 'success');
          if (window.Sounds) window.Sounds.confirmation().catch(() => {});
          load();
        } catch (error) {
          UI.toast(error.message, 'error');
        }
      });
    });

    if (config.onExtraAction) {
      // El registro puede venir en el propio botón (data-record) o en la fila
      // (data-record del <tr>), así cualquier control de la fila lo resuelve.
      const recordFor = (el) => {
        const holder = el.dataset.record ? el : (el.closest('[data-record]') || {});
        const id = el.dataset.record || (holder.dataset ? holder.dataset.record : '');
        return state.records.find((r) => r._id === id);
      };
      table.querySelectorAll('[data-extra]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          config.onExtraAction(recordFor(btn), btn, ctx());
        });
      });
      // Guardado rápido: selects marcados con data-extra-auto guardan al
      // cambiar de valor, sin necesidad de pulsar un botón.
      table.querySelectorAll('select[data-extra-auto]').forEach((sel) => {
        sel.addEventListener('change', (e) => {
          e.stopPropagation();
          const record = recordFor(sel);
          if (!record) return;
          const current = sel.dataset.currentValue !== undefined
            ? sel.dataset.currentValue
            : (record[sel.dataset.field || ''] ?? '');
          if (String(current) === sel.value) return;
          sel.disabled = true;
          config.onExtraAction(record, sel, {
            ...ctx(),
            reload: () => { sel.disabled = false; load(); },
          });
          setTimeout(() => { if (document.contains(sel)) sel.disabled = false; }, 4000);
        });
      });
    }

    return table;
  }

  function ctx() {
    return {
      reload: load,
      toast: UI.toast,
    };
  }

  function openForm(record, options) {
    const opts = options || {};
    const isEdit = Boolean(record);
    const allowedNames = opts.allowedNames || null;
    const fieldList = allowedNames
      ? config.fields.filter((f) => allowedNames.includes(f.name))
      : config.fields;
    const fields = fieldList.map((f) => {
      const value = record
        ? (typeof f.value === 'function' ? f.value(record) : record[f.name])
        : (typeof f.value === 'function' ? '' : (f.value || ''));
      // Los campos marcados con `search: true` se dibujan como select con
      // buscador (para listas largas como clientes/propiedades). Si además
      // traen `searchSource`, el buscador consulta al servidor (modo remoto).
      if (f.search) return UI.searchSelect(f.name, f.label, { ...f, source: f.searchSource || null, value });
      return UI.field(f.name, f.label, { ...f, value });
    });

    const footer = `
      <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
      <button class="btn btn-primary" type="submit" form="crud-form">${isEdit ? 'Guardar cambios' : 'Crear'}</button>
    `;

    const modal = UI.openModal({
      title: opts.title || (isEdit ? `Editar ${config.title.toLowerCase()}` : `Nuevo ${config.title.toLowerCase()}`),
      body: `
        <form id="crud-form" novalidate>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 16px;">
            ${fields.join('')}
            ${opts.hiddenFields || ''}
          </div>
        </form>
      `,
      footer,
      size: config.modalSize || 720,
      onMount(bodyEl) {
        const form = bodyEl.querySelector('#crud-form');
        if (typeof UI !== 'undefined' && UI.wireSearchSelects) UI.wireSearchSelects(form || bodyEl);
        if (config.onFormMount) config.onFormMount(form, record, bodyEl);
        if (opts.mount) opts.mount(form, record, bodyEl);
        if (typeof UI !== 'undefined' && UI.syncOtros) UI.syncOtros(form);
        const overlay = bodyEl ? bodyEl.closest('#modal-overlay') : null;
        if (overlay) {
          const cancelBtn = overlay.querySelector('[data-cancel]');
          if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());
        }
        if (form) form.addEventListener('submit', async (e) => {
          e.preventDefault();
          // Valida los campos requeridos (HTML5) pese a que el form tenga
          // 'novalidate', para que ningún dato obligatorio quede vacío.
          if (form.reportValidity && !form.checkValidity()) {
            form.reportValidity();
            return;
          }
          const submitBtn = form.querySelector('[type="submit"]');
          if (submitBtn && submitBtn.disabled) return;
          if (submitBtn) submitBtn.disabled = true;
          try {
            const values = UI.collectForm(form);
            const body = config.formData ? config.formData(values, record, form) : values;
            if (isEdit) {
              await config.service.update(record._id, body);
              UI.toast('Cambios guardados', 'success');
            } else {
              await config.service.create(body);
              UI.toast('Registro creado', 'success');
            }
            if (window.Sounds) window.Sounds.confirmation().catch(() => {});
            UI.closeModal();
            load();
          } catch (error) {
            UI.toast(error.message, 'error');
            if (submitBtn) submitBtn.disabled = false;
          }
        });
      },
    });
  }

  async function load() {
    // El encabezado y la barra de búsqueda/filtros se pintan UNA sola vez:
    // reconstruirlos en cada carga hacía perder el foco del buscador y
    // re-ejecutar los listeners de los filtros.
    if (!container.querySelector('[data-crud-body]')) {
      container.innerHTML = '';
      container.appendChild(renderHeader());
      container.appendChild(renderToolbar());
      const body = document.createElement('div');
      body.setAttribute('data-crud-body', '');
      container.appendChild(body);
    }
    const body = container.querySelector('[data-crud-body]');
    body.innerHTML = '';

    const loading = document.createElement('div');
    loading.className = 'loading';
    loading.textContent = 'Cargando...';
    body.appendChild(loading);

    try {
      const params = { page: state.page, limit: 15 };
      if (state.q) params.q = state.q;
      if (state.status) params.status = state.status;
      Object.entries(state.filters).forEach(([key, value]) => {
        if (value !== '') params[key] = value;
      });
      if (config.defaultParams) Object.assign(params, config.defaultParams);

      const result = await config.service.list(params);
      state.records = result.data;
      state.meta = result.meta;

      loading.remove();
      body.appendChild(renderTable());

      if (state.meta && state.meta.pages > 1) {
        body.appendChild(UI.pagination(state.meta, (page) => {
          state.page = page;
          load();
        }));
      }
    } catch (error) {
      loading.remove();
      body.appendChild(UI.errorAlert(error.message));
    }
  }

  load();
}

window.crudPage = crudPage;
