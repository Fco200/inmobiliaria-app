'use strict';

window.Pages = window.Pages || {};

window.Pages.avaluo = {
  title: 'Avalúo',

  async render(container) {
    const user = ApiClient.getStoredUser() || {};
    const roleCode = String((user.role && (user.role.code || user.role)) || '');
    const permissions = (user.role && Array.isArray(user.role.permissions)) ? user.role.permissions : [];
    // Asesores: solo consulta. Administración, gerencia, asistencia y escrituración: CRUD completo.
    const canManage = ['admin', 'direccion', 'gerencia', 'superadmin', 'asistencia', 'escrituracion'].includes(roleCode)
      || permissions.includes('appraisals_manage');

    // Llega desde el botón "Avalúo" de la lista de negocios: la propiedad y el negocio.
    const prefill = (() => {
      try {
        const raw = sessionStorage.getItem('avaluoPropiedad');
        sessionStorage.removeItem('avaluoPropiedad');
        return raw ? JSON.parse(raw) : null;
      } catch (error) {
        return null;
      }
    })();

    let properties = [];
    try {
      const res = await API.properties.list({ limit: 100 });
      properties = res.data || [];
    } catch (error) {
      // sin opciones
    }
    if (prefill && prefill.propertyId && !properties.some((p) => String(p._id) === String(prefill.propertyId))) {
      try {
        const res = await ApiClient.get(`/properties/${prefill.propertyId}`);
        if (res && res.data) properties.unshift(res.data);
      } catch (error) {
        // la propiedad no está disponible: se captura sin preseleccionar
      }
    }
    const propertyOptions = UI.sortByLabel(properties, UI.propertyOptionLabel)
      .map((p) => ({ value: p._id, label: UI.propertyOptionLabel(p) }));

    const fmtDate = (value) => (value ? Format.date(value) : '—');
    const numberOrEmpty = (value) => (value || value === 0 ? value : '');

    const fields = [
      {
        name: 'property', label: 'Propiedad', type: 'select', required: true, sinOtros: true, search: true,
        searchSource: UI.remoteSources.property,
        options: [{ value: '', label: '— Selecciona la propiedad —' }, ...propertyOptions],
        value: (r) => (r.property ? (r.property._id || r.property) : ''),
      },
      { name: 'appraisalDate', label: 'Fecha de avalúo', type: 'date', required: true, value: (r) => (r.appraisalDate ? Format.toDateInput(r.appraisalDate) : '') },
      { name: 'appraiser', label: 'Valuador', type: 'text', required: true, value: (r) => r.appraiser || '' },
      { name: 'appraiserCP', label: 'Código postal del valuador', type: 'text', placeholder: '5 dígitos', value: (r) => r.appraiserCP || '' },
      { name: 'constructionM2', label: 'm² de construcción', type: 'number', value: (r) => numberOrEmpty(r.constructionM2) },
      { name: 'landM2', label: 'm² de terreno', type: 'number', value: (r) => numberOrEmpty(r.landM2) },
      { name: 'concludedValue', label: 'Valor concluido', type: 'money', value: (r) => numberOrEmpty(r.concludedValue) },
      { name: 'notes', label: 'Observaciones', type: 'textarea', full: true, value: (r) => r.notes || '' },
    ];

    // ApiClient.unwrap ya quita el envoltorio {data}: el get devuelve el avalúo y
    // las listas (checklist, bitácora) llegan como arreglo directo.
    const payload = (res) => (res && res.data !== undefined ? res.data : res);

    const fmtDateTime = (value) => (value ? Format.dateTime(value) : '—');
    const appraisalPropertyLabel = (item) => (item && item.property ? UI.propertyOptionLabel(item.property) : '—');
    const bitacoraEntryKind = (entry) => {
      const action = String((entry && entry.action) || 'nota');
      if (action === 'creacion') return 'Creación';
      if (action === 'actualizacion') return 'Actualización';
      if (action === 'nota') return 'Nota';
      return action.charAt(0).toUpperCase() + action.slice(1);
    };

    // Vista limpia de impresión / guardado como PDF con el mismo diseño que
    // la bitácora de negocios: datos del avalúo, checklist e historial.
    async function printBitacora(recordId) {
      const win = window.open('', '_blank');
      if (!win) {
        UI.toast('Permite las ventanas emergentes para imprimir la bitácora.', 'warning');
        return;
      }
      win.document.write('<!doctype html><title>Preparando bitácora…</title><p style="font-family:Arial;padding:24px;">Preparando bitácora…</p>');

      try {
        const item = payload(await API.avaluos.get(recordId));
        if (!item) throw new Error('No se encontró el avalúo.');
        const checklist = Array.isArray(item.checklist) ? item.checklist : [];
        const entries = (Array.isArray(item.bitacora) ? item.bitacora : [])
          .slice()
          .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
        const hechos = checklist.filter((c) => c.done).length;
        const esc = (value) => UI.escapeHtml(String(value == null ? '' : value));
        const fmt = (value) => (value ? new Date(value).toLocaleString('es-MX', { timeZone: 'America/Hermosillo', dateStyle: 'medium', timeStyle: 'short' }) : '—');
        const propertyLine = appraisalPropertyLabel(item);

        const checklistRows = checklist.map((c) => `
          <tr>
            <td class="check">${c.done ? '&#9745;' : '&#9744;'}</td>
            <td>${esc(c.text)}</td>
          </tr>`).join('');

        const bitacoraRows = entries.map((entry) => `
          <tr>
            <td class="date">${esc(fmt(entry.createdAt))}</td>
            <td><span class="kind">${esc(bitacoraEntryKind(entry))}</span><div class="text">${esc(entry.message)}</div></td>
            <td>${esc(entry.userName || 'Sistema')}</td>
          </tr>`).join('');

        win.document.open();
        win.document.write(`<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Bitácora - ${esc(propertyLine)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 28px; font-size: 13px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .muted { color: #666; font-size: 12px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin: 16px 0; border: 1px solid #ddd; border-radius: 6px; padding: 12px 14px; }
  .grid div { overflow-wrap: anywhere; }
  .grid div b { color: #444; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { border-bottom: 1px solid #ddd; padding: 7px 6px; vertical-align: top; text-align: left; overflow-wrap: anywhere; }
  th { background: #f4f1f8; font-size: 12px; }
  td.date { white-space: nowrap; width: 150px; }
  td.check { width: 34px; text-align: center; font-size: 16px; }
  .kind { font-size: 11px; color: #555; }
  .text { white-space: pre-wrap; margin-top: 3px; }
  .toolbar { display: flex; justify-content: flex-end; gap: 12px; margin-bottom: 12px; }
  .toolbar button { padding: 7px 14px; font-size: 13px; cursor: pointer; }
  @media print { body { margin: 12mm; } .no-print { display: none !important; } tr { page-break-inside: avoid; } }
</style></head>
<body>
  <div class="toolbar no-print">
    <button type="button" id="avaluo-print-now">Imprimir / Guardar PDF</button>
  </div>
  <h1>Bitácora del avalúo</h1>
  <div class="muted">Generada el ${esc(new Date().toLocaleString('es-MX', { timeZone: 'America/Hermosillo' }))}</div>
  <div class="grid">
    <div><b>Propiedad:</b> ${esc(propertyLine)}</div>
    <div><b>Fecha de avalúo:</b> ${esc(fmtDate(item.appraisalDate))}</div>
    <div><b>Valuador:</b> ${esc(item.appraiser || '—')}</div>
    <div><b>C.P. del valuador:</b> ${esc(item.appraiserCP || '—')}</div>
    <div><b>m² de construcción:</b> ${esc(item.constructionM2 || 0)}</div>
    <div><b>m² de terreno:</b> ${esc(item.landM2 || 0)}</div>
    <div><b>Valor concluido:</b> ${esc(Format.currency(item.concludedValue))}</div>
    <div style="grid-column:1/-1;"><b>Observaciones:</b> ${esc(item.notes || '—')}</div>
  </div>
  <h3 style="margin:18px 0 0;">Checklist (${hechos} de ${checklist.length} completados)</h3>
  ${checklist.length ? `
  <table>
    <thead><tr><th>Estado</th><th>Pendiente</th></tr></thead>
    <tbody>${checklistRows}</tbody>
  </table>` : '<p class="muted">Este avalúo no tiene checklist.</p>'}
  <h3 style="margin:18px 0 0;">Historial cronológico (${entries.length})</h3>
  ${entries.length ? `
  <table>
    <thead><tr><th>Fecha</th><th>Registro</th><th>Responsable</th></tr></thead>
    <tbody>${bitacoraRows}</tbody>
  </table>` : '<p class="muted">No hay registros en la bitácora.</p>'}
</body></html>`);
        win.document.close();
        // La impresión se dispara desde la ventana que abrió la vista para
        // evitar que la CSP bloquee el script y deje la página sin imprimir.
        const printBtn = win.document.getElementById('avaluo-print-now');
        if (printBtn) printBtn.addEventListener('click', () => win.print());
        setTimeout(() => {
          if (!win.closed) {
            try {
              win.focus();
              win.print();
            } catch (error) {
              // Si el navegador bloquea la impresión automática, el botón visible sigue disponible.
            }
          }
        }, 400);
      } catch (error) {
        win.close();
        UI.toast(error.message || 'No se pudo preparar la bitácora.', 'error');
      }
    }

    function openBitacoraModal(recordId) {
      const modal = UI.openModal({
        title: 'Bitácora del avalúo',
        body: `
          <div style="display:flex;justify-content:flex-end;margin-bottom:10px;">
            <button class="btn btn-secondary btn-sm" type="button" data-print-bitacora>&#128424;&nbsp; Imprimir / Guardar PDF</button>
          </div>
          <div id="avaluo-bitacora-container"><div class="loading">Cargando bitácora...</div></div>`,
        size: 640,
      });

      const printBtn = modal.bodyEl.querySelector('[data-print-bitacora]');
      if (printBtn) printBtn.addEventListener('click', () => printBitacora(recordId));

      const containerEl = () => modal.bodyEl.querySelector('#avaluo-bitacora-container');

      function render(item) {
        const el = containerEl();
        if (!el) return;
        const entries = (Array.isArray(item.bitacora) ? item.bitacora : [])
          .slice()
          .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        el.innerHTML = `
          <p class="text-muted" style="margin:0 0 12px;font-size:13px;">
            ${UI.escapeHtml(appraisalPropertyLabel(item))} · Valuador: ${UI.escapeHtml(item.appraiser || '—')}
          </p>
          ${canManage ? `
            <form data-add-bitacora style="margin-bottom:16px;display:flex;gap:8px;">
              <input type="text" class="form-control" name="message" maxlength="500" placeholder="Escribe una nueva nota..." required />
              <button class="btn btn-primary" type="submit">Agregar</button>
            </form>` : ''}
          <div style="max-height:420px;overflow-y:auto;padding-right:4px;">
            ${entries.length ? entries.map((entry) => {
              const id = String(entry._id || '');
              const editable = canManage && entry.action === 'nota';
              return `
                <div data-bitacora-card="${UI.escapeHtml(id)}" style="padding:10px;margin-bottom:8px;border:1px solid var(--border-color,#e2e8f0);border-radius:6px;background:var(--bg-card,#fff);">
                  <div data-bitacora-view>
                    <div style="font-size:10px;font-weight:700;letter-spacing:.04em;color:var(--text-muted);margin-bottom:3px;">${UI.escapeHtml(bitacoraEntryKind(entry))}</div>
                    <div style="font-size:13px;margin-bottom:4px;white-space:pre-wrap;overflow-wrap:anywhere;">${UI.escapeHtml(entry.message || '')}</div>
                    <div class="text-muted" style="font-size:11px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                      <span>${UI.escapeHtml(entry.userName || 'Sistema')} · ${fmtDateTime(entry.createdAt)}</span>
                      ${editable ? `
                        <span style="display:flex;gap:6px;flex-shrink:0;">
                          <button class="btn btn-secondary btn-sm" type="button" data-bitacora-edit="${UI.escapeHtml(id)}">Editar</button>
                          <button class="btn btn-danger btn-sm" type="button" data-bitacora-delete="${UI.escapeHtml(id)}">Eliminar</button>
                        </span>` : ''}
                    </div>
                  </div>
                  <form data-bitacora-edit-form="${UI.escapeHtml(id)}" style="display:none;flex-direction:column;gap:8px;margin-top:8px;">
                    <textarea class="form-control" name="message" rows="3" maxlength="500" required>${UI.escapeHtml(entry.message || '')}</textarea>
                    <div style="display:flex;gap:8px;justify-content:flex-end;">
                      <button class="btn btn-secondary btn-sm" type="button" data-bitacora-cancel="${UI.escapeHtml(id)}">Cancelar</button>
                      <button class="btn btn-primary btn-sm" type="submit">Guardar cambios</button>
                    </div>
                  </form>
                </div>`;
            }).join('') : '<p class="text-muted">No hay registros en la bitácora.</p>'}
          </div>`;

        const addForm = el.querySelector('[data-add-bitacora]');
        if (addForm) {
          addForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const values = UI.collectForm(addForm);
            const message = String(values.message || '').trim();
            if (!message) return;
            try {
              await API.avaluos.addBitacora(recordId, message);
              UI.toast('Nota agregada', 'success');
              await load();
            } catch (error) {
              UI.toast(error.message, 'error');
            }
          });
        }

        el.querySelectorAll('[data-bitacora-edit]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const card = btn.closest('[data-bitacora-card]');
            if (!card) return;
            const view = card.querySelector('[data-bitacora-view]');
            const form = card.querySelector('[data-bitacora-edit-form]');
            if (!view || !form) return;
            view.style.display = 'none';
            form.style.display = 'flex';
            const textarea = form.querySelector('textarea');
            if (textarea) {
              textarea.focus();
              textarea.setSelectionRange(textarea.value.length, textarea.value.length);
            }
          });
        });

        el.querySelectorAll('[data-bitacora-cancel]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const card = btn.closest('[data-bitacora-card]');
            if (!card) return;
            const view = card.querySelector('[data-bitacora-view]');
            const form = card.querySelector('[data-bitacora-edit-form]');
            if (view) view.style.display = '';
            if (form) form.style.display = 'none';
          });
        });

        el.querySelectorAll('[data-bitacora-edit-form]').forEach((form) => {
          form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const entryId = form.dataset.bitacoraEditForm;
            const message = String((form.querySelector('textarea') || {}).value || '').trim();
            if (!entryId || !message) return;
            try {
              await API.avaluos.updateBitacora(recordId, entryId, message);
              UI.toast('Nota actualizada', 'success');
              await load();
            } catch (error) {
              UI.toast(error.message, 'error');
            }
          });
        });

        el.querySelectorAll('[data-bitacora-delete]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const entryId = btn.dataset.bitacoraDelete;
            if (!entryId) return;
            // confirm() nativo: el modal de UI reemplazaría la bitácora abierta.
            if (!confirm('¿Eliminar esta nota de la bitácora?')) return;
            try {
              await API.avaluos.removeBitacora(recordId, entryId);
              UI.toast('Nota eliminada', 'success');
              await load();
            } catch (error) {
              UI.toast(error.message, 'error');
            }
          });
        });
      }

      async function load() {
        const el = containerEl();
        if (!el) return;
        try {
          const res = await API.avaluos.get(recordId);
          const item = payload(res);
          if (!item) throw new Error('No se encontró el avalúo.');
          render(item);
        } catch (error) {
          el.innerHTML = UI.errorAlert(error.message);
        }
      }

      load();
    }

    function openChecklistModal(recordId) {
      const modal = UI.openModal({
        title: 'Checklist del avalúo',
        body: '<div id="avaluo-checklist-container"><div class="loading">Cargando checklist...</div></div>',
        size: 600,
      });

      const containerEl = () => modal.bodyEl.querySelector('#avaluo-checklist-container');

      const saveChecklist = async (checklist) => {
        const res = await API.avaluos.saveChecklist(recordId, checklist.map((c) => ({
          _id: c._id, text: c.text, done: c.done, createdBy: c.createdBy || null,
        })));
        return payload(res) || [];
      };

      function render(item) {
        const el = containerEl();
        if (!el) return;
        const checklist = Array.isArray(item.checklist) ? item.checklist : [];
        item.checklist = checklist;
        const hechos = checklist.filter((c) => c.done).length;
        el.innerHTML = `
          <p class="text-muted" style="margin:0 0 10px;font-size:13px;">
            ${UI.escapeHtml(appraisalPropertyLabel(item))} · Valuador: ${UI.escapeHtml(item.appraiser || '—')}
          </p>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;font-size:13px;">
            <span class="text-muted">Avance</span>
            <strong>${hechos} de ${checklist.length}</strong>
          </div>
          ${canManage ? `
            <form data-add-check style="margin-bottom:16px;display:flex;flex-wrap:wrap;gap:8px;">
              <input type="text" class="form-control" name="text" maxlength="240" placeholder="Nuevo pendiente..." required style="flex:1 1 180px;min-width:0;" />
              <button class="btn btn-primary" type="submit">Agregar</button>
            </form>` : ''}
          <div style="max-height:60vh;overflow-y:auto;padding-right:4px;">
            ${checklist.length ? checklist.map((c, i) => `
              <div data-check-row="${i}" style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;">
                <input type="checkbox" data-check="${i}" ${c.done ? 'checked' : ''} ${canManage ? '' : 'disabled'} />
                <span data-check-text="${i}" style="flex:1;min-width:150px;overflow-wrap:anywhere;${c.done ? 'text-decoration:line-through;opacity:.6;' : ''}">${UI.escapeHtml(c.text)}</span>
                <input class="form-control" data-check-input="${i}" value="${UI.escapeHtml(c.text)}" maxlength="240" style="display:none;flex:1;min-width:150px;" />
                ${canManage ? `
                  <span style="display:flex;gap:6px;flex-shrink:0;">
                    <button class="btn btn-secondary btn-sm" type="button" data-edit-check="${i}">Editar</button>
                    <button class="btn btn-primary btn-sm" type="button" data-save-check="${i}" style="display:none;">Guardar</button>
                    <button class="btn btn-secondary btn-sm" type="button" data-cancel-check="${i}" style="display:none;">Cancelar</button>
                    <button class="btn btn-danger btn-sm" type="button" data-del-check="${i}">Quitar</button>
                  </span>` : ''}
              </div>`).join('') : '<p class="text-muted">No hay elementos en el checklist.</p>'}
          </div>`;

        const addForm = el.querySelector('[data-add-check]');
        if (addForm) {
          addForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const values = UI.collectForm(addForm);
            const text = String(values.text || '').trim();
            if (!text) return;
            try {
              item.checklist = await saveChecklist(item.checklist.concat([{ text, done: false }]));
              render(item);
            } catch (error) {
              UI.toast(error.message, 'error');
            }
          });
        }

        el.querySelectorAll('[data-check]').forEach((checkbox) => {
          checkbox.addEventListener('change', async () => {
            const index = Number(checkbox.dataset.check);
            const next = item.checklist.map((c, i) => (i === index ? { ...c, done: checkbox.checked } : c));
            try {
              item.checklist = await saveChecklist(next);
              render(item);
            } catch (error) {
              checkbox.checked = !checkbox.checked;
              UI.toast(error.message, 'error');
            }
          });
        });

        el.querySelectorAll('[data-edit-check]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const row = btn.closest('[data-check-row]');
            if (!row) return;
            const text = row.querySelector('[data-check-text]');
            const input = row.querySelector('[data-check-input]');
            if (text) text.style.display = 'none';
            if (input) {
              input.style.display = '';
              input.focus();
              input.setSelectionRange(input.value.length, input.value.length);
            }
            const editBtn = row.querySelector('[data-edit-check]');
            const saveBtn = row.querySelector('[data-save-check]');
            const cancelBtn = row.querySelector('[data-cancel-check]');
            const delBtn = row.querySelector('[data-del-check]');
            if (editBtn) editBtn.style.display = 'none';
            if (saveBtn) saveBtn.style.display = '';
            if (cancelBtn) cancelBtn.style.display = '';
            if (delBtn) delBtn.style.display = 'none';
          });
        });

        el.querySelectorAll('[data-cancel-check]').forEach((btn) => {
          btn.addEventListener('click', () => render(item));
        });

        el.querySelectorAll('[data-save-check]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const row = btn.closest('[data-check-row]');
            const input = row ? row.querySelector('[data-check-input]') : null;
            const text = String((input && input.value) || '').trim();
            if (!text) {
              UI.toast('Escribe el pendiente.', 'warning');
              return;
            }
            const index = Number(btn.dataset.saveCheck);
            const next = item.checklist.map((c, i) => (i === index ? { ...c, text } : c));
            try {
              item.checklist = await saveChecklist(next);
              render(item);
            } catch (error) {
              UI.toast(error.message, 'error');
            }
          });
        });

        el.querySelectorAll('[data-del-check]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const index = Number(btn.dataset.delCheck);
            if (!confirm('¿Quitar este pendiente del checklist?')) return;
            try {
              item.checklist = await saveChecklist(item.checklist.filter((c, i) => i !== index));
              render(item);
            } catch (error) {
              UI.toast(error.message, 'error');
            }
          });
        });
      }

      async function load() {
        const el = containerEl();
        if (!el) return;
        try {
          const res = await API.avaluos.get(recordId);
          const item = payload(res);
          if (!item) throw new Error('No se encontró el avalúo.');
          render(item);
        } catch (error) {
          el.innerHTML = UI.errorAlert(error.message);
        }
      }

      load();
    }

    crudPage(container, {
      title: 'Avalúo',
      newLabel: 'Nuevo avalúo',
      hideNew: !canManage,
      storageKey: 'avaluos',
      // Filas compactas y acciones en cuadrícula para que la tabla no se
      // estire a la derecha; el usuario puede ajustar anchos y alto de fila.
      compactRows: true,
      actionsGrid: true,
      serverLayout: (user.uiPrefs && user.uiPrefs['crud-layout:avaluos']) || null,
      onLayoutSave: (layout) => API.auth.saveUiPref('crud-layout:avaluos', layout),
      service: {
        list: (params) => API.avaluos.list(params),
        create: (body) => API.avaluos.create(body),
        update: (id, body) => API.avaluos.update(id, body),
        remove: (id) => API.avaluos.remove(id),
      },
      filters: [
        { key: 'property', label: 'Propiedad', placeholder: 'Todas las propiedades', searchSource: UI.remoteSources.property, options: propertyOptions },
        { key: 'appraiser', label: 'Valuador', placeholder: 'Nombre del valuador' },
        { key: 'appraiserCP', label: 'Código postal', placeholder: 'Código postal' },
        { key: 'dateFrom', label: 'Desde (fecha)', type: 'date' },
        { key: 'dateTo', label: 'Hasta (fecha)', type: 'date' },
        { key: 'minValue', label: 'Valor mín. ($)', type: 'number' },
        { key: 'maxValue', label: 'Valor máx. ($)', type: 'number' },
        { key: 'minConstruction', label: 'm² constr. mín.', type: 'number' },
        { key: 'maxConstruction', label: 'm² constr. máx.', type: 'number' },
        { key: 'minLand', label: 'm² terreno mín.', type: 'number' },
        { key: 'maxLand', label: 'm² terreno máx.', type: 'number' },
      ],
      columns: [
        { key: 'appraisalDate', label: 'Fecha', render: (r) => fmtDate(r.appraisalDate) },
        { key: 'property', label: 'Propiedad', render: (r) => (r.property ? UI.escapeHtml(UI.propertyOptionLabel(r.property)) : '—') },
        { key: 'appraiser', label: 'Valuador', render: (r) => UI.escapeHtml(r.appraiser || '—') },
        { key: 'appraiserCP', label: 'C.P.', render: (r) => UI.escapeHtml(r.appraiserCP || '—') },
        { key: 'constructionM2', label: 'm² constr.', render: (r) => `${Number(r.constructionM2) || 0}` },
        { key: 'landM2', label: 'm² terreno', render: (r) => `${Number(r.landM2) || 0}` },
        { key: 'concludedValue', label: 'Valor concluido', render: (r) => Format.currency(r.concludedValue) },
      ],
      fields,
      formData(values, record) {
        const cp = String(values.appraiserCP || '').trim();
        if (cp && !/^\d{5}$/.test(cp)) throw new Error('El código postal del valuador debe tener 5 dígitos.');
        const body = {
          property: values.property || null,
          appraisalDate: Format.fromDateInput(values.appraisalDate),
          appraiser: values.appraiser,
          appraiserCP: values.appraiserCP,
          constructionM2: Number(values.constructionM2) || 0,
          landM2: Number(values.landM2) || 0,
          concludedValue: Number(values.concludedValue) || 0,
          notes: values.notes,
        };
        if (!record && prefill && prefill.businessId) body.business = prefill.businessId;
        return body;
      },
      onFormMount(form, record) {
        if (record || !prefill || !prefill.propertyId || !form) return;
        const select = form.querySelector('#fld-property');
        if (select) {
          select.value = prefill.propertyId;
          select.dispatchEvent(new Event('change'));
        }
      },
      onReady(open) {
        if (prefill && prefill.propertyId && canManage) open();
      },
      onEdit: canManage ? true : undefined,
      onRemove: canManage ? true : undefined,
      extraActions: () => `
        <button class="btn btn-secondary btn-sm" data-extra data-bitacora>Ver bitácora</button>
        <button class="btn btn-secondary btn-sm" data-extra data-print-bitacora>&#128424; Imprimir bitácora</button>
        <button class="btn btn-secondary btn-sm" data-extra data-checklist>Checklist</button>
      `,
      onExtraAction(record, control) {
        if (control.dataset.bitacora !== undefined) {
          openBitacoraModal(record._id);
          return;
        }
        if (control.dataset.printBitacora !== undefined) {
          printBitacora(record._id);
          return;
        }
        if (control.dataset.checklist !== undefined) {
          openChecklistModal(record._id);
          return;
        }
      },
      submitNotice: 'Guardando avalúo…',
    });
  },
};
