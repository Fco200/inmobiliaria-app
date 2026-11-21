'use strict';

window.Pages = window.Pages || {};

window.Pages.documents = {
  title: 'Formatos',

  async render(container) {
    let clients = [];
    let properties = [];
    let businesses = [];
    try {
      const [c, p, b] = await Promise.all([
        API.clients.list({ limit: 100 }).catch(() => ({ data: [] })),
        API.properties.list({ limit: 100 }).catch(() => ({ data: [] })),
        API.businesses.list({ limit: 100 }).catch(() => ({ data: [] })),
      ]);
      clients = c.data;
      properties = p.data;
      businesses = b.data;
    } catch (error) {
      // sin opciones
    }

    const clientOptions = UI.sortByLabel(clients, (x) => x.name)
      .map((x) => ({ value: x._id, label: x.name }));
    const propertyOptions = UI.sortByLabel(properties, UI.propertyOptionLabel)
      .map((x) => ({ value: x._id, label: UI.propertyOptionLabel(x) }));
    const businessOptions = UI.sortByLabel(businesses, (x) => x.name)
      .map((x) => ({ value: x._id, label: x.name }));

    const TYPES = [
      { value: 'formato', label: 'Formato' },
      { value: 'contrato', label: 'Contrato' },
      { value: 'identificacion', label: 'Identificación / INE' },
      { value: 'datos_personales', label: 'Datos personales' },
      { value: 'escrituras', label: 'Escrituras' },
      { value: 'avaluo', label: 'Avalúo' },
      { value: 'comprobantes', label: 'Comprobantes' },
      { value: 'bancario', label: 'Bancario / pago' },
      { value: 'legal', label: 'Documentación legal' },
      { value: 'otros', label: 'Otros' },
    ];
    const STATUS = ['pendiente', 'recibido', 'validado', 'rechazado'];
    const roleCode = (() => {
      const user = ApiClient.getStoredUser();
      const role = user && user.role;
      return (role && (role.code || role)) || '';
    })();
    // Coincide con isBoss() del backend: dirección/gerencia/administración.
    const boss = ['admin', 'direccion', 'gerencia', 'superadmin'].includes(roleCode);
    // Los formatos compartidos los sube el mismo personal que puede gestionar documentos.
    const canUploadShared = boss || ['asistencia', 'escrituracion'].includes(roleCode);
    const canUpload = canUploadShared || roleCode === 'asesor';
    // El backend permite editar/borrar documentos al autor o al personal de documentos.
    const canManageDocs = boss || roleCode === 'asistencia' || roleCode === 'escrituracion';
    const typeLabel = (t) => {
      const found = TYPES.find((x) => x.value === t);
      return found ? found.label : (t || 'otros');
    };

    container.innerHTML = `
      <div class="page-header">
        <h2>Formatos</h2>
        <button class="btn btn-secondary" type="button" data-hoja-visita>&#128221; Hoja de Visita</button>
      </div>
      <div class="card" id="shared-formats" style="padding:16px;margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
          <div>
            <h4 style="margin:0 0 4px;font-size:15px;">Formatos compartidos</h4>
            <p class="text-muted" style="margin:0 0 12px;font-size:13px;">Sube cualquier archivo (PDF, Word, Excel o imagen, hasta 15 MB). Queda disponible para todo el equipo.</p>
          </div>
          <span id="shared-count" class="badge badge-info" style="display:none;"></span>
        </div>
        ${canUploadShared ? `
          <form id="shared-form" class="shared-form" novalidate style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr) auto;gap:10px;align-items:end;margin-bottom:10px;">
            <div style="min-width:0;">
              <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;" for="shared-name">Nombre del formato</label>
              <input class="form-control" id="shared-name" name="name" maxlength="160" placeholder="Ej. Carta de intención" required>
            </div>
            <div style="min-width:0;">
              <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;" for="shared-file">Archivo</label>
              <label class="shared-drop" id="shared-drop" for="shared-file" style="display:block;border:1.5px dashed var(--border);border-radius:8px;padding:10px 12px;cursor:pointer;background:var(--white);text-align:center;">
                <input class="shared-file-input" id="shared-file" name="archivo" type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.webp,.gif" style="position:absolute;width:1px;height:1px;opacity:0;">
                <span id="shared-drop-text" style="font-size:12.5px;color:var(--text-muted);">Arrastra el archivo aquí o haz clic para elegirlo</span>
                <small id="shared-file-name" style="display:block;font-size:12px;font-weight:600;color:var(--primary);margin-top:2px;"></small>
              </label>
            </div>
            <button class="btn btn-primary" type="submit" id="shared-submit" style="height:42px;">Guardar formato</button>
          </form>
          <p id="shared-msg" class="text-muted" style="margin:0 0 12px;font-size:12.5px;"></p>` : ''}
        <div style="margin:0 0 10px;max-width:340px;">
          <input class="form-control" id="shared-search" type="search" placeholder="Buscar por nombre, archivo o quién lo subió…">
        </div>
        <div id="shared-list"><div class="loading">Cargando formatos compartidos...</div></div>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
        <input class="form-control" id="doc-search" placeholder="Buscar formato..." style="max-width:240px;">
        <select class="form-control" id="doc-status" style="max-width:180px;">
          <option value="">Todos los estados</option>
          ${STATUS.map((s) => `<option value="${s}">${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}
        </select>
        <div style="max-width:280px;min-width:220px;" id="doc-client-wrap">
          ${UI.searchSelect('doc-client', 'Cliente', {
            source: UI.remoteSources.client,
            placeholder: 'Escribe un nombre o teléfono…',
            options: [{ value: '', label: 'Todos los clientes' }, ...clientOptions],
          })}
        </div>
      </div>
      <div id="doc-list"><div class="loading">Cargando formatos...</div></div>
    `;

    // ============ FORMATOS COMPARTIDOS (cualquier archivo) ============
    const sharedListEl = container.querySelector('#shared-list');
    const sharedForm = container.querySelector('#shared-form');
    const sharedMsg = container.querySelector('#shared-msg');
    const sharedSubmit = container.querySelector('#shared-submit');
    const sharedSearchEl = container.querySelector('#shared-search');
    const sharedCountEl = container.querySelector('#shared-count');
    const sharedDrop = container.querySelector('#shared-drop');
    const sharedFileEl = container.querySelector('#shared-file');
    const sharedFileName = container.querySelector('#shared-file-name');
    const sharedDropText = container.querySelector('#shared-drop-text');
    const currentUserId = String((ApiClient.getStoredUser() || {})._id || (ApiClient.getStoredUser() || {}).id || '');
    let sharedItems = [];
    let sharedQuery = '';

    const sharedSize = (bytes) => {
      const n = Number(bytes) || 0;
      if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
      if (n >= 1024) return `${Math.round(n / 1024)} KB`;
      return `${n} B`;
    };
    const sharedExt = (item) => String(item.fileName || item.name || '').split('.').pop().toLowerCase();
    const sharedIcon = (item) => {
      const ext = sharedExt(item);
      if (ext === 'pdf') return '&#128196;';
      if (['doc', 'docx', 'txt'].includes(ext)) return '&#128221;';
      if (['xls', 'xlsx', 'csv'].includes(ext)) return '&#128202;';
      if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext)) return '&#128444;&#65039;';
      return '&#128193;';
    };

    function renderSharedList() {
      if (!sharedListEl) return;
      const q = sharedQuery.trim().toLowerCase();
      const items = q
        ? sharedItems.filter((item) => [
          item.name,
          item.fileName,
          item.uploadedBy && (item.uploadedBy.name || item.uploadedBy.username),
        ].filter(Boolean).join(' ').toLowerCase().includes(q))
        : sharedItems;

      if (sharedCountEl) {
        sharedCountEl.style.display = sharedItems.length ? '' : 'none';
        sharedCountEl.textContent = `${sharedItems.length} formato${sharedItems.length === 1 ? '' : 's'}`;
      }

      if (!sharedItems.length) {
        sharedListEl.innerHTML = '<p class="text-muted" style="margin:0;font-size:13px;">Aún no hay formatos compartidos. Sube el primero con el formulario de arriba.</p>';
        return;
      }
      if (!items.length) {
        sharedListEl.innerHTML = '<p class="text-muted" style="margin:0;font-size:13px;">No hay formatos que coincidan con la búsqueda.</p>';
        return;
      }

      sharedListEl.innerHTML = `
        <div class="table-responsive">
          <table class="table">
            <thead><tr><th>Formato</th><th>Archivo</th><th>Subido por</th><th>Fecha</th><th></th></tr></thead>
            <tbody>
              ${items.map((item) => {
                const uploaderId = String((item.uploadedBy && (item.uploadedBy._id || item.uploadedBy)) || '');
                const canDelete = canUploadShared || uploaderId === currentUserId;
                return `
                  <tr>
                    <td><strong>${sharedIcon(item)} ${UI.escapeHtml(item.name)}</strong></td>
                    <td><small class="text-muted">${UI.escapeHtml(item.fileName || '')} · ${sharedSize(item.size)} · ${UI.escapeHtml(sharedExt(item).toUpperCase() || 'ARCHIVO')}</small></td>
                    <td>${UI.escapeHtml((item.uploadedBy && (item.uploadedBy.name || item.uploadedBy.username)) || '—')}</td>
                    <td>${new Date(item.createdAt).toLocaleDateString('es-MX', { timeZone: 'America/Hermosillo' })}</td>
                    <td style="white-space:nowrap;text-align:right;">
                      <button class="btn btn-secondary btn-sm" type="button" data-shared-view="${item._id}">Ver</button>
                      <button class="btn btn-secondary btn-sm" type="button" data-shared-download="${item._id}">Descargar</button>
                      ${canDelete ? `<button class="btn btn-secondary btn-sm" type="button" data-shared-edit="${item._id}">Editar</button>` : ''}
                      ${canDelete ? `<button class="btn btn-danger btn-sm" type="button" data-shared-del="${item._id}">Eliminar</button>` : ''}
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;

      const download = async (id, mode, btn) => {
        const item = sharedItems.find((x) => String(x._id) === String(id));
        if (!item) return;
        const label = btn.textContent;
        btn.disabled = true;
        btn.textContent = mode === 'view' ? 'Abriendo…' : 'Descargando…';
        try {
          const blob = await API.formatos.descargarCompartido(id);
          const url = URL.createObjectURL(blob);
          if (mode === 'view') {
            // Visor dentro de la plataforma (PDF / imágenes); otros formatos ofrecen descarga.
            UI.openFileViewer({
              title: item.name || 'Documento',
              src: url,
              fileName: item.fileName || item.name || '',
              downloadName: item.fileName || item.name || 'formato',
            });
            setTimeout(() => URL.revokeObjectURL(url), 600000);
          } else {
            const a = document.createElement('a');
            a.href = url;
            a.download = item.fileName || item.name || 'formato';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
          }
        } catch (error) {
          UI.toast(error.message || 'No se pudo descargar el archivo.', 'error');
        } finally {
          btn.disabled = false;
          btn.textContent = label;
        }
      };

      sharedListEl.querySelectorAll('[data-shared-view]').forEach((btn) => {
        btn.addEventListener('click', () => download(btn.dataset.sharedView, 'view', btn));
      });
      sharedListEl.querySelectorAll('[data-shared-download]').forEach((btn) => {
        btn.addEventListener('click', () => download(btn.dataset.sharedDownload, 'download', btn));
      });
      const editShared = (item) => {
        const modal = UI.openModal({
          title: 'Editar formato',
          body: `
            <form id="shared-edit-form" novalidate>
              <div class="form-field form-field-full">
                <label for="shared-edit-name">Nombre del formato</label>
                <input id="shared-edit-name" type="text" value="${UI.escapeHtml(item.name)}" maxlength="160">
              </div>
              <div class="form-field form-field-full">
                <label for="shared-edit-file">Reemplazar archivo (opcional)</label>
                <input id="shared-edit-file" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp">
                <small class="text-muted">Archivo actual: ${UI.escapeHtml(item.fileName || '')}</small>
              </div>
            </form>
          `,
          footer: `
            <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
            <button class="btn btn-primary" type="button" data-save>Guardar cambios</button>
          `,
        });
        const overlay = modal.bodyEl ? modal.bodyEl.closest('#modal-overlay') : null;
        if (!overlay) return;
        overlay.querySelector('[data-cancel]').addEventListener('click', () => UI.closeModal());
        overlay.querySelector('[data-save]').addEventListener('click', async (event) => {
          const name = (overlay.querySelector('#shared-edit-name').value || '').trim();
          const file = overlay.querySelector('#shared-edit-file').files[0] || null;
          if (!name) {
            UI.toast('Escribe el nombre del formato.', 'error');
            return;
          }
          const btn = event.currentTarget;
          btn.disabled = true;
          try {
            await API.formatos.actualizarCompartido(item._id, name, file);
            UI.toast('Formato actualizado', 'success');
            UI.closeModal();
            loadShared();
          } catch (error) {
            btn.disabled = false;
            UI.toast(error.message, 'error');
          }
        });
      };
      sharedListEl.querySelectorAll('[data-shared-edit]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const item = sharedItems.find((x) => String(x._id) === String(btn.dataset.sharedEdit));
          if (item) editShared(item);
        });
      });
      sharedListEl.querySelectorAll('[data-shared-del]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const ok = await UI.confirm('¿Eliminar este formato compartido? Se borrará del sistema y de la base de datos, y dejará de estar disponible para el equipo. Esta acción no se puede deshacer.');
          if (!ok) return;
          btn.disabled = true;
          try {
            await API.formatos.eliminarCompartido(btn.dataset.sharedDel);
            UI.toast('Formato eliminado', 'success');
            loadShared();
          } catch (error) {
            btn.disabled = false;
            UI.toast(error.message, 'error');
          }
        });
      });
    }

    async function loadShared() {
      if (!sharedListEl) return;
      try {
        sharedItems = (await API.formatos.listarCompartidos()) || [];
        renderSharedList();
      } catch (error) {
        sharedListEl.innerHTML = `<p class="text-muted" style="margin:0;font-size:13px;color:#b91c1c;">${UI.escapeHtml(error.message)}</p>`;
      }
    }

    if (sharedSearchEl) {
      sharedSearchEl.addEventListener('input', () => {
        sharedQuery = sharedSearchEl.value || '';
        renderSharedList();
      });
    }

    // Arrastrar y soltar archivos sobre la zona de carga.
    if (sharedDrop && sharedFileEl) {
      const showFileName = () => {
        const file = sharedFileEl.files && sharedFileEl.files[0];
        if (sharedFileName) sharedFileName.textContent = file ? `${file.name} (${sharedSize(file.size)})` : '';
        if (sharedDropText) sharedDropText.textContent = file ? 'Archivo seleccionado. Puedes cambiarlo.' : 'Arrastra el archivo aquí o haz clic para elegirlo';
      };
      sharedFileEl.addEventListener('change', showFileName);
      ['dragenter', 'dragover'].forEach((evt) => sharedDrop.addEventListener(evt, (event) => {
        event.preventDefault();
        sharedDrop.style.borderColor = 'var(--primary)';
        sharedDrop.style.background = 'var(--icon-bg)';
      }));
      ['dragleave', 'drop'].forEach((evt) => sharedDrop.addEventListener(evt, () => {
        sharedDrop.style.borderColor = 'var(--border)';
        sharedDrop.style.background = 'var(--white)';
      }));
      sharedDrop.addEventListener('drop', (event) => {
        event.preventDefault();
        const files = event.dataTransfer && event.dataTransfer.files;
        if (!files || !files.length) return;
        try {
          const transfer = new DataTransfer();
          transfer.items.add(files[0]);
          sharedFileEl.files = transfer.files;
          showFileName();
        } catch (error) {
          UI.toast('No se pudo tomar el archivo. Usa el selector.', 'warning');
        }
      });
    }

    if (sharedForm) {
      sharedForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const nameEl = sharedForm.querySelector('#shared-name');
        const fileEl = sharedForm.querySelector('#shared-file');
        const name = String(nameEl.value || '').trim();
        const file = fileEl.files && fileEl.files[0];
        if (!name) {
          if (sharedMsg) sharedMsg.textContent = 'Escribe el nombre del formato.';
          nameEl.focus();
          return;
        }
        if (!file) {
          if (sharedMsg) sharedMsg.textContent = 'Selecciona el archivo que quieres subir.';
          return;
        }
        if (file.size > 15 * 1024 * 1024) {
          if (sharedMsg) sharedMsg.textContent = 'El archivo supera los 15 MB. Comprime el archivo o usa una versión más ligera.';
          return;
        }
        sharedSubmit.disabled = true;
        sharedSubmit.textContent = 'Guardando…';
        if (sharedMsg) sharedMsg.textContent = 'Subiendo archivo, espera un momento…';
        try {
          await API.formatos.subirCompartido(name, file);
          sharedForm.reset();
          if (sharedFileName) sharedFileName.textContent = '';
          if (sharedDropText) sharedDropText.textContent = 'Arrastra el archivo aquí o haz clic para elegirlo';
          sharedQuery = '';
          if (sharedSearchEl) sharedSearchEl.value = '';
          if (sharedMsg) sharedMsg.textContent = '';
          UI.toast('Formato guardado. Ya está disponible para el equipo.', 'success');
          loadShared();
        } catch (error) {
          if (sharedMsg) sharedMsg.textContent = error.message || 'No se pudo guardar el formato.';
          UI.toast(error.message || 'No se pudo guardar el formato.', 'error');
        } finally {
          sharedSubmit.disabled = false;
          sharedSubmit.textContent = 'Guardar formato';
        }
      });
    }
    loadShared();

    const listEl = container.querySelector('#doc-list');
    const searchEl = container.querySelector('#doc-search');
    const statusEl = container.querySelector('#doc-status');
    const clientEl = container.querySelector('#fld-doc-client');
    if (clientEl && UI.wireSearchSelects) UI.wireSearchSelects(container.querySelector('#doc-client-wrap'));
    let records = [];
    let currentEntityFilter = null;

    async function load() {
      listEl.innerHTML = '<div class="loading">Cargando formatos...</div>';
      const params = {};
      if (searchEl.value) params.q = searchEl.value;
      if (statusEl.value) params.status = statusEl.value;
      if (clientEl && clientEl.value) params.client = clientEl.value;
      if (currentEntityFilter) {
        params[currentEntityFilter.type] = currentEntityFilter.id;
      }
      try {
        const result = await API.documents.list(params);
        records = result.data || [];
        if (!records.length) {
          listEl.innerHTML = '<div class="card"><div class="empty-state"><p>No hay formatos registrados.</p></div></div>';
          return;
        }
        listEl.innerHTML = `
          <div class="table-wrapper card">
            <table class="table">
              <thead><tr><th>Formato</th><th>Tipo</th><th>Vinculado a</th><th>Estado</th><th>Archivo</th><th>Fecha</th><th></th></tr></thead>
              <tbody>${records.map((d) => `
                <tr>
                  <td><strong>${UI.escapeHtml(d.name)}</strong>${d.observations ? `<br><small class="text-muted">${UI.escapeHtml(d.observations)}</small>` : ''}</td>
                  <td>${UI.badge(typeLabel(d.type), 'info')}</td>
                  <td>
                    ${d.client ? `Cliente: ${UI.escapeHtml(d.client.name)}<br>` : ''}
                    ${d.property ? `Propiedad: ${UI.escapeHtml(UI.propertyOptionLabel(d.property))}<br>` : ''}
                    ${d.business ? `Negocio: ${UI.escapeHtml(d.business.name)}` : ''}
                    ${!d.client && !d.property && !d.business ? '<span class="text-muted">—</span>' : ''}
                  </td>
                  <td>${UI.statusBadge(d.status)}</td>
                  <td>
                    ${d.fileUrl ? `
                      <button type="button" class="btn btn-secondary btn-sm" data-doc-view="${d._id}">Ver</button>
                      <a href="${window.AppConfig.resolveUrl(d.fileUrl)}" download class="btn btn-secondary btn-sm">Descargar</a>
                    ` : '<span class="text-muted">—</span>'}
                  </td>
                  <td>${Format.date(d.date)}</td>
                  <td>
                    ${canManageDocs && (d.status === 'pendiente' || d.status === 'recibido') ? `
                      <button class="btn btn-success btn-sm" data-validate="${d._id}" title="Validar formato">✓</button>
                      <button class="btn btn-danger btn-sm" data-reject="${d._id}" title="Rechazar formato">✗</button>
                    ` : ''}
                    ${canManageDocs ? `<button class="btn btn-secondary btn-sm" data-edit="${d._id}" style="margin-left:6px;">Editar</button>` : ''}
                    ${canManageDocs ? `<button class="btn btn-danger btn-sm" data-remove="${d._id}" style="margin-left:6px;">Eliminar</button>` : ''}
                  </td>
                </tr>`).join('')}</tbody>
            </table>
          </div>
        `;
        const setStatus = (id, status) => API.documents.update(id, { status });

        listEl.querySelectorAll('[data-validate]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              await setStatus(btn.dataset.validate, 'validado');
              UI.toast('Formato validado', 'success');
              load();
            } catch (error) {
              UI.toast(error.message, 'error');
            }
          });
        });
        listEl.querySelectorAll('[data-reject]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              await setStatus(btn.dataset.reject, 'rechazado');
              UI.toast('Formato rechazado', 'success');
              load();
            } catch (error) {
              UI.toast(error.message, 'error');
            }
          });
        });
        listEl.querySelectorAll('[data-edit]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const record = records.find((r) => r._id === btn.dataset.edit);
            openForm(record);
          });
        });
        listEl.querySelectorAll('[data-remove]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const record = records.find((r) => r._id === btn.dataset.remove);
            const ok = await UI.confirm('¿Eliminar este formato? Se borrará del sistema y de la base de datos. Esta acción no se puede deshacer.');
            if (!ok) return;
            try {
              await API.documents.remove(record._id);
              UI.toast('Formato eliminado', 'success');
              load();
            } catch (error) {
              UI.toast(error.message, 'error');
            }
          });
        });
        listEl.querySelectorAll('[data-doc-view]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const record = records.find((r) => r._id === btn.dataset.docView);
            if (!record || !record.fileUrl) return;
            UI.openFileViewer({
              title: record.name || 'Documento',
              src: window.AppConfig.resolveUrl(record.fileUrl),
              fileName: record.fileName || record.fileUrl,
              downloadName: record.fileName || record.name || 'documento',
            });
          });
        });
      } catch (error) {
        listEl.innerHTML = UI.errorAlert(error.message);
      }
    }

    async function openForm(record) {
      const isEdit = Boolean(record);
      if (isEdit ? !canManageDocs : !canUpload) return;
      const restricted = !canManageDocs;
      const fields = restricted ? [
        { name: 'name', label: 'Nombre del formato', type: 'text', required: true, full: true, value: '' },
        { name: 'file', label: 'Adjuntar archivo', type: 'file', value: '' },
        { name: 'observations', label: 'Observaciones', type: 'textarea', full: true, value: '' },
      ] : [
        { name: 'name', label: 'Nombre del formato', type: 'text', required: true, full: true, value: record ? record.name : '' },
        { name: 'type', label: 'Tipo', type: 'select', options: TYPES, value: record ? record.type : 'formato' },
        { name: 'status', label: 'Estado', type: 'select', options: STATUS, value: record ? record.status : 'pendiente' },
        { name: 'client', label: 'Cliente', type: 'select', sinOtros: true, search: true, searchSource: UI.remoteSources.client, options: [{ value: '', label: '— Sin cliente —' }, ...clientOptions], value: record && record.client ? (record.client._id || record.client) : '' },
        { name: 'property', label: 'Propiedad', type: 'select', sinOtros: true, search: true, searchSource: UI.remoteSources.property, options: [{ value: '', label: '— Sin propiedad —' }, ...propertyOptions], value: record && record.property ? (record.property._id || record.property) : '' },
        { name: 'business', label: 'Negocio', type: 'select', sinOtros: true, search: true, searchSource: UI.remoteSources.business, options: [{ value: '', label: '— Sin negocio —' }, ...businessOptions], value: record && record.business ? (record.business._id || record.business) : '' },
        { name: 'file', label: 'Adjuntar archivo', type: 'file', value: '' },
        { name: 'observations', label: 'Observaciones', type: 'textarea', full: true, value: record ? record.observations : '' },
      ];
      const renderField = (f) => (f.search
        ? UI.searchSelect(f.name, f.label, { ...f, source: f.searchSource || null, value: f.value })
        : UI.field(f.name, f.label, { ...f, value: f.value }));
      const modal = UI.openModal({
        title: isEdit ? 'Editar formato' : 'Subir formato',
        body: `
          <form id="doc-form" novalidate>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 16px;">
              ${fields.map(renderField).join('')}
            </div>
            ${record && record.fileUrl ? `<p class="text-muted" style="font-size:12px;">Archivo actual: <a href="${window.AppConfig.resolveUrl(record.fileUrl)}" target="_blank" rel="noopener">${UI.escapeHtml(record.fileName || record.fileUrl)}</a></p>` : ''}
          </form>
        `,
        footer: `
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary" type="submit" form="doc-form">${isEdit ? 'Guardar cambios' : 'Registrar'}</button>
        `,
        size: 780,
      });
      const bodyEl = modal.bodyEl;
      const overlay = bodyEl ? bodyEl.closest('#modal-overlay') : null;
      if (overlay) {
        const cancelBtn = overlay.querySelector('[data-cancel]');
        if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());
      }
      const form = bodyEl ? bodyEl.querySelector('#doc-form') : null;
      if (form) {
        if (UI.wireSearchSelects) UI.wireSearchSelects(form);
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const values = UI.collectForm(e.target);
          const { file, ...rest } = values;
          const body = restricted
            ? { name: rest.name, observations: rest.observations, type: 'formato', status: 'pendiente' }
            : { ...rest };
          for (const key of ['client', 'property', 'business']) {
            if (!body[key]) body[key] = null;
          }
          try {
            if (file) {
              const uploadResult = await API.documents.upload(file);
              body.fileUrl = uploadResult.fileUrl;
              body.fileName = uploadResult.originalName;
            }
            if (isEdit) {
              await API.documents.update(record._id, body);
            } else {
              await API.documents.create(body);
            }
            UI.toast(isEdit ? 'Cambios guardados' : 'Formato registrado', 'success');
            if (window.Sounds) window.Sounds.confirmation().catch(() => {});
            UI.closeModal();
            load();
          } catch (error) {
            UI.toast(error.message, 'error');
          }
        });
      }
    }

    if (searchEl) searchEl.addEventListener('input', () => load());
    if (statusEl) statusEl.addEventListener('change', () => load());
    if (clientEl) clientEl.addEventListener('change', () => load());

    // Hoja de Visita: formulario propio (sin plantillas ni PDFs del repositorio).
    const hojaVisitaBtn = container.querySelector('[data-hoja-visita]');
    if (hojaVisitaBtn) {
      hojaVisitaBtn.addEventListener('click', () => openHojaDeVisita());
    }

    load();

    const VISITA_MOTIVOS = [
      'Solicitar información',
      'Realizar cotización',
      'Entrega de llaves',
      'Firmar documentos',
      'Visita a la propiedad',
      'Otro',
    ];

    // Bloque de firma digital reutilizable (puente con el componente signature.js).
    function signatureSectionHTML() {
      return `
        <div class="formato-section" style="margin-bottom:8px;">
          <h4 style="margin:0 0 12px;color:var(--primary);">&#9997;&#65039; Firma</h4>
          <div style="border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;background:#fff;">
            <canvas data-signature-pad height="150" style="width:100%;height:150px;display:block;touch-action:none;cursor:crosshair;"></canvas>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;flex-wrap:wrap;gap:6px;">
            <button class="btn btn-secondary btn-sm" type="button" data-signature-clear>Limpiar firma</button>
            <small class="text-muted">Firma con el dedo o el ratón</small>
          </div>
          <input type="hidden" name="firma" value="">
        </div>
      `;
    }

    function attachSignature(root) {
      if (!root || typeof window.SignaturePad === 'undefined') return null;
      const canvas = root.querySelector('canvas[data-signature-pad]');
      if (!canvas) return null;
      const pad = window.SignaturePad.create({ canvas });
      if (!pad) return null;
      const clearBtn = root.querySelector('[data-signature-clear]');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          pad.clear();
          const hidden = root.querySelector('[name="firma"]');
          if (hidden) hidden.value = '';
        });
      }
      return pad;
    }

    function validarHojaVisita(values, pad) {
      const problemas = [];
      if (!values.cliente) problemas.push('nombre del visitante');
      if (!values.fecha_visita) problemas.push('fecha de la visita');
      if (values.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.correo)) problemas.push('correo electrónico');
      if (values.telefono && !/^\+?[\d\s().-]{7,}$/.test(values.telefono)) problemas.push('teléfono');
      if (!pad || pad.isEmpty()) problemas.push('firma');
      return problemas;
    }

    // Abre el diálogo de impresión (Ctrl+P / Guardar como PDF) con la cabecera
    // de INMOBLES, las secciones de datos y la firma, desde un iframe oculto de
    // la MISMA página (en el móvil window.open dejaba atrapado al usuario).
    function openPrintPreview(titulo, secciones, values, firma) {
      const firmaData = firma || (values && values.firma) || '';
      const cells = (secciones || []).map((sec) => `
        <h3>${UI.escapeHtml(sec.titulo)}</h3>
        <table>
          ${(sec.campos || []).map((c) => `
            <tr><td>${UI.escapeHtml(c.label)}</td><td>${c.value == null || c.value === '' ? '—' : UI.escapeHtml(String(c.value))}</td></tr>
          `).join('')}
        </table>
      `).join('');
      const hoy = new Date().toLocaleDateString('es-MX', { timeZone: 'America/Hermosillo', year: 'numeric', month: 'long', day: 'numeric' });
      UI.printHtmlDocument(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${UI.escapeHtml(titulo)} · INMOBLES</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, Arial, sans-serif; color: #1f2937; background: #fff; margin: 0; }
  .no-print { background: #f3f4f6; padding: 12px 24px; display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 13px; }
  .no-print button { background: #2d1048; color: #fff; border: 0; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; }
  .header { display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; border-bottom: 3px solid #2d1048; }
  .header .brand { font-size: 20px; font-weight: 800; color: #2d1048; letter-spacing: 1px; }
  .header .brand small { display: block; font-size: 11px; font-weight: 400; color: #6b7280; }
  .content { padding: 24px; }
  h1 { margin: 0; font-size: 18px; color: #2d1048; }
  h3 { margin: 20px 0 8px; font-size: 13px; color: #2d1048; text-transform: uppercase; letter-spacing: .5px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-size: 13px; vertical-align: top; }
  td:first-child { width: 34%; color: #4b5563; font-weight: 600; }
  .firma-block { margin-top: 28px; }
  .firma-block img { max-width: 260px; max-height: 120px; border: 1px solid #ddd; border-radius: 6px; background: #fff; padding: 8px; }
  .firma-line { margin-top: 30px; border-top: 1px solid #1f2937; padding-top: 6px; font-size: 12px; color: #4b5563; max-width: 260px; }
  .foot { margin-top: 36px; padding-top: 10px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 11px; }
  @page { margin: 18mm; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>
  <div class="no-print">
    <span>Se abrirá el diálogo de impresión: elige <strong>Guardar como PDF</strong>.</span>
  </div>
  <div class="header">
    <div class="brand">&#127968; INMOBLES<small>Gestión inmobiliaria profesional</small></div>
    <div style="text-align:right;">
      <h1>${UI.escapeHtml(titulo)}</h1>
      <div style="font-size:12px;color:#6b7280;">${hoy}</div>
    </div>
  </div>
  <div class="content">
    ${cells}
    ${firmaData ? `
      <div class="firma-block">
        <h3>Firma</h3>
        <img src="${firmaData}" alt="Firma">
        <div class="firma-line">Firma</div>
      </div>` : ''}
    <div class="foot">Documento generado con INMOBLES el ${hoy}.</div>
  </div>
</body>
</html>`);
    }

    // Hoja de Visita: formulario + firma + vista previa imprimible.
    function openHojaDeVisita() {
      const modal = UI.openModal({
        title: 'Hoja de Visita',
        body: `
          <form id="hoja-visita-form" novalidate>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 16px;">
              ${UI.field('cliente', 'Nombre del visitante', { required: true })}
              ${UI.field('telefono', 'Teléfono', { type: 'tel' })}
              ${UI.field('correo', 'Correo electrónico', { type: 'email' })}
              ${UI.field('fecha_visita', 'Fecha de la visita', { type: 'date', required: true })}
              ${UI.field('para_visita', 'Motivo de la visita', { type: 'select', options: VISITA_MOTIVOS })}
              ${UI.field('propiedad', 'Propiedad', { type: 'select', sinOtros: true, options: [{ value: '', label: '— Sin especificar —' }, ...propertyOptions] })}
              ${UI.field('observaciones', 'Observaciones', { type: 'textarea', full: true })}
            </div>
            ${signatureSectionHTML()}
          </form>
        `,
        footer: `
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-right:auto;cursor:pointer;">
            <input type="checkbox" data-registrar> Registrar copia en el sistema
          </label>
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary" type="submit" form="hoja-visita-form">&#128196; Previsualizar / PDF</button>
        `,
        size: 780,
      });
      const bodyEl = modal.bodyEl;
      const overlay = bodyEl ? bodyEl.closest('#modal-overlay') : null;
      if (overlay) {
        const cancelBtn = overlay.querySelector('[data-cancel]');
        if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());
      }
      const pad = attachSignature(bodyEl);
      const form = bodyEl ? bodyEl.querySelector('#hoja-visita-form') : null;
      if (!form) return;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const values = UI.collectForm(e.target);
        const problemas = validarHojaVisita(values, pad);
        if (problemas.length) {
          UI.toast('Faltan datos: ' + problemas.join(', '), 'warning');
          return;
        }
        if (pad && !pad.isEmpty()) values.firma = pad.save();

        const registrar = overlay ? overlay.querySelector('[data-registrar]') : null;
        if (registrar && registrar.checked) {
          try {
            await API.documents.create({
              name: `Hoja de Visita — ${values.cliente}`,
              type: 'formato',
              status: 'pendiente',
              observations: `Registrada desde formato rápido el ${new Date().toLocaleDateString('es-MX', { timeZone: 'America/Hermosillo' })}`,
            });
            UI.toast('Copia registrada en el sistema', 'success');
          } catch (error) { /* registro best-effort */ }
        }

        const propiedadLabel = values.propiedad
          ? ((propertyOptions.find((o) => o.value === values.propiedad) || {}).label || values.propiedad)
          : '';
        const secciones = [
          {
            titulo: 'Datos de la visita',
            campos: [
              { label: 'Visitante', value: values.cliente },
              { label: 'Teléfono', value: values.telefono },
              { label: 'Correo electrónico', value: values.correo },
              { label: 'Fecha de la visita', value: values.fecha_visita },
              { label: 'Motivo', value: values.para_visita },
              { label: 'Propiedad', value: propiedadLabel },
              { label: 'Observaciones', value: values.observaciones },
            ],
          },
        ];
        openPrintPreview('Hoja de Visita', secciones, values, values.firma);
        UI.closeModal();
        load();
      });
    }
  },
};
