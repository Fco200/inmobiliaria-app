'use strict';

function crudPage(container, config) {
  const state = { page: 1, q: '', status: '', records: [], meta: null };

  function renderHeader() {
    const el = document.createElement('div');
    el.className = 'page-header';
    el.innerHTML = `
      <h2>${UI.escapeHtml(config.title)}</h2>
      <button class="btn btn-primary" type="button" data-new>+ ${UI.escapeHtml(config.newLabel)}</button>
    `;
    el.querySelector('[data-new]').addEventListener('click', () => openForm());
    return el;
  }

  function renderToolbar() {
    const el = document.createElement('div');
    el.style.cssText = 'display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center;';
    let statusSelect = '';
    if (config.statusOptions) {
      const opts = config.statusOptions
        .map((o) => `<option value="${UI.escapeHtml(typeof o === 'object' ? o.value : o)}">${UI.escapeHtml(typeof o === 'object' ? o.label : o)}</option>`)
        .join('');
      statusSelect = `
        <select class="form-control" data-status style="max-width:220px;">
          <option value="">Todos los estados</option>
          ${opts}
        </select>
      `;
    }
    el.innerHTML = `
      <input class="form-control" data-search placeholder="Buscar..." style="max-width:280px;">
      ${statusSelect}
      <button class="btn btn-secondary btn-sm" type="button" data-export-xls title="Exportar a Excel">&#128196;&nbsp; Excel</button>
      <button class="btn btn-secondary btn-sm" type="button" data-export-pdf title="Exportar a PDF (imprime o guarda como PDF)">&#128424;&nbsp; PDF</button>
    `;
    el.querySelector('[data-search]').addEventListener('input', (e) => {
      state.q = e.target.value;
      state.page = 1;
      load();
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
    return el;
  }

  function currentParams() {
    const params = { page: 1, limit: 100 };
    if (state.q) params.q = state.q;
    if (state.status) params.status = state.status;
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
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 0);
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

  function exportPdf() {
    const records = state.records;
    if (!records.length) { UI.toast('No hay datos para exportar', 'warning'); return; }
    const rows = records.map((r) =>
      `<tr>${config.columns.map((c) => `<td>${UI.escapeHtml(cellText(r, c))}</td>`).join('')}</tr>`
    ).join('');
    const head = config.columns.map((c) => `<th>${UI.escapeHtml(c.label)}</th>`).join('');
    const title = UI.escapeHtml(config.title);
    const when = new Date().toLocaleString('es-MX');
    const win = window.open('', '_blank', 'width=1000,height=700');
    win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${title}</title>
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
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
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
        actions += `<button class="btn btn-secondary btn-sm" data-edit="${record._id}" style="margin-left:6px;">Editar</button>`;
      }
      if (config.onRemove) {
        actions += `<button class="btn btn-danger btn-sm" data-remove="${record._id}" style="margin-left:6px;">Eliminar</button>`;
      }
      rows += `<tr>${cells}<td data-label="Acciones">${actions}</td></tr>`;
    });

    table.innerHTML = `
      <table class="table">
        <thead><tr>${thead}<th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    table.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const record = state.records.find((r) => r._id === btn.dataset.edit);
        openForm(record);
      });
    });
    table.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const record = state.records.find((r) => r._id === btn.dataset.remove);
        const ok = await UI.confirm(`¿Eliminar este registro?`);
        if (!ok) return;
        try {
          await config.service.remove(record._id);
          UI.toast('Registro eliminado', 'success');
          load();
        } catch (error) {
          UI.toast(error.message, 'error');
        }
      });
    });

    if (config.onExtraAction) {
      table.querySelectorAll('[data-extra]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const record = state.records.find((r) => r._id === btn.dataset.record);
          config.onExtraAction(record, btn, ctx());
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

  function openForm(record) {
    const isEdit = Boolean(record);
    const fields = config.fields.map((f) => {
      const value = record
        ? (typeof f.value === 'function' ? f.value(record) : record[f.name])
        : (typeof f.value === 'function' ? '' : (f.value || ''));
      return UI.field(f.name, f.label, { ...f, value });
    });

    const footer = `
      <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
      <button class="btn btn-primary" type="submit" form="crud-form">${isEdit ? 'Guardar cambios' : 'Crear'}</button>
    `;

    const modal = UI.openModal({
      title: isEdit ? `Editar ${config.title.toLowerCase()}` : `Nuevo ${config.title.toLowerCase()}`,
      body: `
        <form id="crud-form" novalidate>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 16px;">
            ${fields.join('')}
          </div>
        </form>
      `,
      footer,
      size: config.modalSize || 720,
      onMount(bodyEl) {
        const form = bodyEl.querySelector('#crud-form');
        if (config.onFormMount) config.onFormMount(form, record, bodyEl);
        const overlay = bodyEl ? bodyEl.closest('#modal-overlay') : null;
        if (overlay) {
          const cancelBtn = overlay.querySelector('[data-cancel]');
          if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());
        }
        if (form) form.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const values = UI.collectForm(form);
            const body = config.formData ? config.formData(values, record) : values;
            if (isEdit) {
              await config.service.update(record._id, body);
              UI.toast('Cambios guardados', 'success');
            } else {
              await config.service.create(body);
              UI.toast('Registro creado', 'success');
            }
            UI.closeModal();
            load();
          } catch (error) {
            UI.toast(error.message, 'error');
          }
        });
      },
    });
  }

  async function load() {
    container.innerHTML = '';
    container.appendChild(renderHeader());
    container.appendChild(renderToolbar());

    const loading = document.createElement('div');
    loading.className = 'loading';
    loading.textContent = 'Cargando...';
    container.appendChild(loading);

    try {
      const params = { page: state.page, limit: 15 };
      if (state.q) params.q = state.q;
      if (state.status) params.status = state.status;
      if (config.defaultParams) Object.assign(params, config.defaultParams);

      const result = await config.service.list(params);
      state.records = result.data;
      state.meta = result.meta;

      loading.remove();
      container.appendChild(renderTable());

      if (state.meta && state.meta.pages > 1) {
        container.appendChild(UI.pagination(state.meta, (page) => {
          state.page = page;
          load();
        }));
      }
    } catch (error) {
      loading.remove();
      container.appendChild(UI.errorAlert(error.message));
    }
  }

  load();
}

window.crudPage = crudPage;
