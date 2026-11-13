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

    function openBitacora(recordId) {
      const modal = UI.openModal({
        title: 'Bitácora y checklist',
        body: '<div class="loading">Cargando...</div>',
        footer: '<button class="btn btn-secondary" type="button" data-cancel>Cerrar</button>',
        size: 720,
      });
      const bodyEl = modal.bodyEl;
      const overlay = bodyEl ? bodyEl.closest('#modal-overlay') : null;
      if (overlay) {
        const cancelBtn = overlay.querySelector('[data-cancel]');
        if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());
      }

      let item = null;

      const saveChecklist = async () => {
        try {
          const res = await API.avaluos.saveChecklist(recordId, item.checklist.map((c) => ({
            _id: c._id, text: c.text, done: c.done, createdBy: c.createdBy || null,
          })));
          item.checklist = payload(res) || [];
          draw();
        } catch (error) {
          UI.toast(error.message, 'error');
        }
      };

      const draw = () => {
        const checklist = item.checklist || [];
        const bitacora = (item.bitacora || []).slice().reverse();
        const hechos = checklist.filter((c) => c.done).length;
        const propLabel = item.property ? UI.propertyOptionLabel(item.property) : '—';
        bodyEl.innerHTML = `
          <p class="text-muted" style="margin:0 0 12px;font-size:13px;">
            ${UI.escapeHtml(propLabel)} · Valuador: ${UI.escapeHtml(item.appraiser || '—')}
          </p>
          <h4 style="margin:0 0 8px;">Checklist <small class="text-muted" style="font-weight:400;">Avance: ${hechos} de ${checklist.length}</small></h4>
          <ul style="list-style:none;padding:0;margin:0 0 10px;">
            ${checklist.length ? checklist.map((c, i) => `
              <li style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);">
                <input type="checkbox" data-check="${i}" ${c.done ? 'checked' : ''} ${canManage ? '' : 'disabled'}>
                <span style="flex:1;${c.done ? 'text-decoration:line-through;opacity:.6;' : ''}">${UI.escapeHtml(c.text)}</span>
                ${canManage ? `<button class="btn btn-danger btn-sm" type="button" data-del-check="${i}">Quitar</button>` : ''}
              </li>`).join('') : '<li class="text-muted" style="padding:6px 0;">Sin pendientes.</li>'}
          </ul>
          ${canManage ? `
            <div style="display:flex;gap:8px;margin-bottom:18px;">
              <input class="form-control" id="avaluo-check-new" maxlength="240" placeholder="Nuevo pendiente…">
              <button class="btn btn-secondary" type="button" data-add-check>Agregar</button>
            </div>` : ''}
          <h4 style="margin:0 0 8px;">Bitácora</h4>
          ${canManage ? `
            <div style="display:flex;gap:8px;margin-bottom:10px;">
              <input class="form-control" id="avaluo-note" maxlength="500" placeholder="Escribe una nota…">
              <button class="btn btn-primary" type="button" data-add-note>Agregar nota</button>
            </div>` : ''}
          <ul style="list-style:none;padding:0;margin:0;max-height:280px;overflow:auto;">
            ${bitacora.length ? bitacora.map((b) => `
              <li style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">
                <strong>${UI.escapeHtml(b.userName || 'Sistema')}</strong>
                <small class="text-muted"> · Registrado el ${Format.dateTime(b.createdAt)}</small><br>
                ${UI.escapeHtml(b.message)}
              </li>`).join('') : '<li class="text-muted" style="padding:6px 0;">Sin movimientos.</li>'}
          </ul>`;

        bodyEl.querySelectorAll('[data-check]').forEach((cb) => {
          cb.addEventListener('change', () => {
            item.checklist[Number(cb.dataset.check)].done = cb.checked;
            saveChecklist();
          });
        });
        bodyEl.querySelectorAll('[data-del-check]').forEach((btn) => {
          btn.addEventListener('click', () => {
            item.checklist.splice(Number(btn.dataset.delCheck), 1);
            saveChecklist();
          });
        });
        const addCheck = bodyEl.querySelector('[data-add-check]');
        if (addCheck) {
          addCheck.addEventListener('click', () => {
            const input = bodyEl.querySelector('#avaluo-check-new');
            const text = String(input.value || '').trim();
            if (!text) return;
            item.checklist.push({ text, done: false });
            saveChecklist();
          });
        }
        const addNote = bodyEl.querySelector('[data-add-note]');
        if (addNote) {
          addNote.addEventListener('click', async () => {
            const input = bodyEl.querySelector('#avaluo-note');
            const message = String(input.value || '').trim();
            if (!message) return;
            try {
              const res = await API.avaluos.addBitacora(recordId, message);
              item.bitacora = payload(res) || item.bitacora;
              draw();
            } catch (error) {
              UI.toast(error.message, 'error');
            }
          });
        }
      };

      (async () => {
        try {
          const res = await API.avaluos.get(recordId);
          item = payload(res);
          draw();
        } catch (error) {
          bodyEl.innerHTML = UI.errorAlert(error.message);
        }
      })();
    }

    crudPage(container, {
      title: 'Avalúo',
      newLabel: 'Nuevo avalúo',
      hideNew: !canManage,
      storageKey: 'avaluos',
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
      extraActions: () => '<button class="btn btn-secondary btn-sm" data-extra data-bitacora style="margin-left:6px;">Bitácora y checklist</button>',
      onExtraAction(record) {
        openBitacora(record._id);
      },
      submitNotice: 'Guardando avalúo…',
    });
  },
};
