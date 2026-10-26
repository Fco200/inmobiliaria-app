'use strict';

window.Pages = window.Pages || {};

window.Pages.documents = {
  title: 'Formatos',

  async render(container) {
    let clients = [];
    let properties = [];
    let businesses = [];
    let plantillas = [];
    try {
      const [c, p, b, pl] = await Promise.all([
        API.clients.list({ limit: 100 }).catch(() => ({ data: [] })),
        API.properties.list({ limit: 100 }).catch(() => ({ data: [] })),
        API.businesses.list({ limit: 100 }).catch(() => ({ data: [] })),
        API.formatos.listarPlantillas().catch(() => ({ plantillas: [] })),
      ]);
      clients = c.data;
      properties = p.data;
      businesses = b.data;
      plantillas = pl.plantillas || [];
    } catch (error) {
      // sin opciones
    }

    const clientOptions = clients.map((x) => ({ value: x._id, label: x.name }));
    const propertyOptions = properties.map((x) => ({ value: x._id, label: UI.propertyOptionLabel(x) }));
    const businessOptions = businesses.map((x) => ({ value: x._id, label: x.name }));

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
    const boss = (() => {
      const user = ApiClient.getStoredUser();
      return Boolean(user && user.role && ['admin', 'gerencia'].includes(user.role.code));
    })();
    const typeLabel = (t) => {
      const found = TYPES.find((x) => x.value === t);
      return found ? found.label : (t || 'otros');
    };

    container.innerHTML = `
      <div class="page-header">
        <h2>Formatos</h2>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-primary" type="button" data-open-formatos>&#128196; Generar Formato PDF</button>
          ${boss ? '<button class="btn btn-secondary" type="button" data-new-template>+ Crear plantilla</button>' : ''}
          ${boss ? '<button class="btn btn-secondary" type="button" data-new>+ Subir formato</button>' : ''}
        </div>
      </div>
      <div style="margin-bottom:20px;">
        <h4 style="margin:0 0 12px;color:var(--text-muted);font-size:15px;">Formatos rápidos</h4>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(235px,1fr));gap:12px;">
          <div class="card quick-action" style="padding:16px;display:flex;flex-direction:column;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:26px;">&#128172;</span>
              <div style="flex:1;min-width:0;">
                <strong style="display:block;font-size:14px;">Hoja de Visita</strong>
                <small class="text-muted">Registro de visitas con firma</small>
              </div>
            </div>
            <div style="display:flex;gap:6px;margin-top:12px;margin-top:auto;padding-top:12px;">
              <button class="btn btn-secondary btn-sm" type="button" data-rapido="visita" data-action="open" style="flex:1;">Abrir</button>
              <button class="btn btn-primary btn-sm" type="button" data-rapido="visita" data-action="fill" style="flex:1;">Descargar PDF</button>
            </div>
          </div>
          <div class="card quick-action" style="padding:16px;display:flex;flex-direction:column;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:26px;">&#128203;</span>
              <div style="flex:1;min-width:0;">
                <strong style="display:block;font-size:14px;">Carta de Intención de Compra</strong>
                <small class="text-muted">Propuesta de compra del inmueble</small>
              </div>
            </div>
            <div style="display:flex;gap:6px;margin-top:auto;padding-top:12px;">
              <button class="btn btn-secondary btn-sm" type="button" data-rapido="oferta" data-action="open" style="flex:1;">Abrir</button>
              <button class="btn btn-primary btn-sm" type="button" data-rapido="oferta" data-action="fill" style="flex:1;">Llenar</button>
            </div>
          </div>
          <div class="card quick-action" style="padding:16px;display:flex;flex-direction:column;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:26px;">&#128179;</span>
              <div style="flex:1;min-width:0;">
                <strong style="display:block;font-size:14px;">Contrato de Apartado</strong>
                <small class="text-muted">Reservar la propiedad</small>
              </div>
            </div>
            <div style="display:flex;gap:6px;margin-top:auto;padding-top:12px;">
              <button class="btn btn-secondary btn-sm" type="button" data-rapido="apartado" data-action="open" style="flex:1;">Abrir</button>
              <button class="btn btn-primary btn-sm" type="button" data-rapido="apartado" data-action="fill" style="flex:1;">Llenar</button>
            </div>
          </div>
          <div class="card quick-action" style="padding:16px;display:flex;flex-direction:column;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:26px;">&#127968;</span>
              <div style="flex:1;min-width:0;">
                <strong style="display:block;font-size:14px;">Ficha de Captación</strong>
                <small class="text-muted">Solicitud para captar inmuebles</small>
              </div>
            </div>
            <div style="display:flex;gap:6px;margin-top:auto;padding-top:12px;">
              <button class="btn btn-secondary btn-sm" type="button" data-rapido="captacion" data-action="open" style="flex:1;">Abrir</button>
              <button class="btn btn-primary btn-sm" type="button" data-rapido="captacion" data-action="fill" style="flex:1;">Llenar</button>
            </div>
          </div>
        </div>
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
                      <a href="${window.AppConfig.resolveUrl(d.fileUrl)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">Ver</a>
                      <a href="${window.AppConfig.resolveUrl(d.fileUrl)}" download class="btn btn-secondary btn-sm">Descargar</a>
                    ` : '<span class="text-muted">—</span>'}
                    ${d.isTemplate && d.templateFields && d.templateFields.length ? `
                      <button class="btn btn-primary btn-sm" data-fill="${d._id}" style="margin-left:4px;">Llenar</button>
                    ` : ''}
                    ${d.filledData ? `<span class="badge badge-success" style="margin-left:4px;">Llenado</span>` : ''}
                  </td>
                  <td>${Format.date(d.date)}</td>
                  <td>
                    ${boss && (d.status === 'pendiente' || d.status === 'recibido') ? `
                      <button class="btn btn-success btn-sm" data-validate="${d._id}" title="Validar formato">✓</button>
                      <button class="btn btn-danger btn-sm" data-reject="${d._id}" title="Rechazar formato">✗</button>
                    ` : ''}
                    ${boss ? `<button class="btn btn-secondary btn-sm" data-edit="${d._id}" style="margin-left:6px;">Editar</button>` : ''}
                    ${boss ? `<button class="btn btn-danger btn-sm" data-remove="${d._id}" style="margin-left:6px;">Eliminar</button>` : ''}
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
            const ok = await UI.confirm('¿Eliminar este formato?');
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
        listEl.querySelectorAll('[data-fill]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const record = records.find((r) => r._id === btn.dataset.fill);
            openFillForm(record);
          });
        });
      } catch (error) {
        listEl.innerHTML = UI.errorAlert(error.message);
      }
    }

    async function openForm(record) {
      if (!boss) return;
      const isEdit = Boolean(record);
      const fields = [
        { name: 'name', label: 'Nombre del formato', type: 'text', required: true, full: true, value: record ? record.name : '' },
        { name: 'type', label: 'Tipo', type: 'select', options: TYPES, value: record ? record.type : 'formato' },
        { name: 'status', label: 'Estado', type: 'select', options: STATUS, value: record ? record.status : 'pendiente' },
        { name: 'client', label: 'Cliente', type: 'select', sinOtros: true, search: true, searchSource: UI.remoteSources.client, options: [{ value: '', label: '— Sin cliente —' }, ...clientOptions], value: record ? (record.client ? record.client._id : '') : '' },
        { name: 'property', label: 'Propiedad', type: 'select', sinOtros: true, search: true, searchSource: UI.remoteSources.property, options: [{ value: '', label: '— Sin propiedad —' }, ...propertyOptions], value: record ? (record.property ? record.property._id : '') : '' },
        { name: 'business', label: 'Negocio', type: 'select', sinOtros: true, search: true, searchSource: UI.remoteSources.business, options: [{ value: '', label: '— Sin negocio —' }, ...businessOptions], value: record ? (record.business ? record.business._id : '') : '' },
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
          const body = { ...rest };
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
    const newBtn = container.querySelector('[data-new]');
    if (newBtn) newBtn.addEventListener('click', () => openForm(null));
    
    const newTemplateBtn = container.querySelector('[data-new-template]');
    if (newTemplateBtn) {
      newTemplateBtn.addEventListener('click', () => openTemplateForm(null));
    }

    // Botón para abrir selector de formatos PDF
    const openFormatosBtn = container.querySelector('[data-open-formatos]');
    if (openFormatosBtn) {
      openFormatosBtn.addEventListener('click', () => openPlantillasSelector());
    }

    // ============ FORMATOS RÁPIDOS ============

    const QUICK_KEYWORDS = {
      oferta: ['oferta'],
      apartado: ['apartado', 'renta'],
      captacion: ['captación', 'captacion'],
    };
    const VISITA_MOTIVOS = [
      'Solicitar información',
      'Realizar cotización',
      'Entrega de llaves',
      'Firmar documentos',
      'Visita a la propiedad',
      'Otro',
    ];

    // Normaliza textos para comparar sin acentos ni mayúsculas.
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const haystackOf = (p) => norm(`${p.nombre} ${p.id}`);
    const findMatches = (keywords) => plantillas.filter((p) => keywords.some((k) => haystackOf(p).includes(norm(k))));

    // Bloque de firma digital reutilizable (pajea el componente signature.js).
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
    // de INMOBLES, las secciones de datos y la firma. Se hace en un iframe
    // oculto de la MISMA página: el móvil muestra el diálogo nativo sin sacar
    // al usuario de la app (antes window.open dejaba atrapado en una pestaña).
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
      const hoy = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
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
              observations: `Registrada desde formato rápido el ${new Date().toLocaleDateString('es-MX')}`,
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

    // Tarjetas de acceso rápido: Hoja de Visita abre su formulario;
    // el resto busca la plantilla por keyword y la abre si hay una única
    // coincidencia (botón "Llenar") o muestra el selector filtrado.
    container.querySelectorAll('[data-rapido]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rapido = btn.dataset.rapido;
        const action = btn.dataset.action;
        if (rapido === 'visita') {
          openHojaDeVisita();
          return;
        }
        const keywords = QUICK_KEYWORDS[rapido] || [rapido];
        const matches = findMatches(keywords);
        if (!matches.length) {
          UI.toast('No hay plantilla configurada para este formato rápido.', 'warning');
          openPlantillasSelector();
          return;
        }
        if (action === 'fill' && matches.length === 1) {
          openFormularioPlantilla(matches[0].id);
          return;
        }
        openPlantillasSelector(keywords[0]);
      });
    });

    load();

    // ============ FUNCIONES PARA PLANTILLAS PDF ============

    // Selector de plantillas PDF. Con `keyword` opcional filtra la vista a las
    // plantillas que coinciden (los formatos rápidos lo usan para preseleccionar).
    function openPlantillasSelector(keyword) {
      let plantillasConFormulario = plantillas.filter(p => p.tieneFormulario);
      let plantillasSinFormulario = plantillas.filter(p => !p.tieneFormulario);

      let kwNote = '';
      if (keyword) {
        const kw = norm(keyword);
        plantillasConFormulario = plantillasConFormulario.filter(p => haystackOf(p).includes(kw));
        plantillasSinFormulario = plantillasSinFormulario.filter(p => haystackOf(p).includes(kw));
        if (!plantillasConFormulario.length && !plantillasSinFormulario.length) {
          UI.toast('No se encontró plantilla para "' + keyword + '".', 'warning');
          return;
        }
        kwNote = `
          <p class="text-muted" style="font-size:13px;margin:0 0 16px;">
            &#128269; Plantillas para "<strong>${UI.escapeHtml(keyword)}</strong>":
            ${plantillasConFormulario.length + plantillasSinFormulario.length} coincidencia(s).
          </p>`;
      }

      const modal = UI.openModal({
        title: 'Generar Formato PDF',
        body: `
          ${kwNote}
          <div style="margin-bottom:20px;">
            <h4 style="margin:0 0 12px;color:var(--primary);">&#128196; Plantillas con formulario</h4>
            <p class="text-muted" style="margin:0 0 16px;font-size:13px;">Selecciona una plantilla para llenar sus datos y generar el PDF.</p>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">
              ${plantillasConFormulario.map(p => `
                <div class="card plantilla-card" style="cursor:pointer;padding:16px;transition:transform 0.2s,border-color 0.2s;">
                  <div style="display:flex;align-items:center;gap:12px;">
                    <span style="font-size:28px;">&#128196;</span>
                    <div style="flex:1;min-width:0;">
                      <strong style="display:block;font-size:14px;">${UI.escapeHtml(p.nombre)}</strong>
                      <small class="text-muted">${UI.escapeHtml(p.archivo)}</small>
                    </div>
                  </div>
                  <div style="display:flex;gap:6px;margin-top:10px;">
                    <button class="btn btn-primary btn-sm" data-plantilla="${UI.escapeHtml(p.id)}" style="flex:1;">Llenar y Descargar</button>
                    <button class="btn btn-secondary btn-sm" data-download-blank="${UI.escapeHtml(p.id)}" style="flex:1;">Descargar en Blanco</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          ${plantillasSinFormulario.length ? `
            <div>
              <h4 style="margin:0 0 12px;color:var(--text-muted);">&#128196; Plantillas disponibles (solo descarga)</h4>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;">
                ${plantillasSinFormulario.map(p => `
                  <div style="padding:10px 14px;background:var(--bg);border-radius:var(--radius);font-size:13px;display:flex;justify-content:space-between;align-items:center;">
                    <span>${UI.escapeHtml(p.nombre)}</span>
                    <button class="btn btn-secondary btn-sm" data-download-blank="${UI.escapeHtml(p.id)}">Descargar</button>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        `,
        footer: `
          <button class="btn btn-secondary" type="button" data-cancel>Cerrar</button>
        `,
        size: 800,
      });

      const bodyEl = modal.bodyEl;
      const overlay = bodyEl ? bodyEl.closest('#modal-overlay') : null;
      if (overlay) {
        const cancelBtn = overlay.querySelector('[data-cancel]');
        if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());
      }

      // Eventos para plantillas con formulario
      if (bodyEl) {
        bodyEl.querySelectorAll('[data-plantilla]').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const plantillaId = btn.dataset.plantilla;
            UI.closeModal();
            await openFormularioPlantilla(plantillaId);
          });
        });

        // Hover decorativo sobre la tarjeta (sin duplicar eventos de click)
        bodyEl.querySelectorAll('.plantilla-card').forEach(card => {
          card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-2px)';
            card.style.borderColor = 'var(--primary)';
          });
          card.addEventListener('mouseleave', () => {
            card.style.transform = '';
            card.style.borderColor = '';
          });
        });

        // Botones de descarga en blanco
        bodyEl.querySelectorAll('[data-download-blank]').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const plantillaId = btn.dataset.downloadBlank;
            try {
              UI.toast('Descargando plantilla en blanco...', 'info');
              const blob = await API.formatos.descargar(plantillaId);
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${plantillaId.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              // Revocar al liberarlo de inmediato puede cancelar la descarga;
              // se difiere para que el navegador la tome.
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              UI.toast('PDF descargado', 'success');
              if (window.Sounds) window.Sounds.confirmation().catch(() => {});
            } catch (error) {
              UI.toast('Error al descargar: ' + error.message, 'error');
            }
          });
        });
      }
    }

    // Formulario dinámico para cualquier plantilla
    async function openFormularioPlantilla(plantillaId) {
      try {
        UI.toast('Cargando formulario...', 'info');
        const result = await API.formatos.obtenerCampos(plantillaId);
        const plantilla = result.plantilla;

        if (!plantilla || !plantilla.secciones || !plantilla.secciones.length) {
          UI.toast('Esta plantilla no tiene formulario configurado', 'warning');
          return;
        }

        // Construir formulario dinámico
        const formId = 'form-' + String(plantillaId).replace(/[^a-zA-Z0-9_-]/g, '_');
        let formHTML = `<form id="${formId}" novalidate>`;

        for (const seccion of plantilla.secciones) {
          formHTML += `
            <div class="formato-section" style="margin-bottom:20px;">
              <h4 style="margin:0 0 12px;color:var(--primary);">${seccion.icono} ${seccion.titulo}</h4>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 16px;">
          `;

          for (const campo of seccion.campos) {
            const options = campo.options ? campo.options.map(o => 
              typeof o === 'string' ? { value: o, label: o } : o
            ) : undefined;

            formHTML += UI.field(campo.name, campo.label, {
              type: campo.type,
              required: campo.required,
              full: campo.full,
              placeholder: campo.placeholder,
              value: campo.value || '',
              options: options,
            });
          }

          formHTML += `</div></div>`;
        }

        // Firma digital al final de cualquier plantilla con formulario.
        if (window.SignaturePad) {
          formHTML += signatureSectionHTML();
        }

        formHTML += `</form>`;

        const modal = UI.openModal({
          title: `Generar: ${plantilla.nombre}`,
          body: formHTML,
          footer: `
            <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
            <button class="btn btn-primary" type="submit" form="${formId}">&#128196; Generar PDF</button>
          `,
          size: 850,
        });

        const bodyEl = modal.bodyEl;
        const overlay = bodyEl ? bodyEl.closest('#modal-overlay') : null;
        if (overlay) {
          const cancelBtn = overlay.querySelector('[data-cancel]');
          if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());
        }

        const form = bodyEl ? bodyEl.querySelector(`[id="${formId}"]`) : null;
        const pad = attachSignature(bodyEl);
        if (form) {
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const values = UI.collectForm(e.target);

            // Validar campos requeridos
            const requiredFields = [];
            for (const seccion of plantilla.secciones) {
              for (const campo of seccion.campos) {
                if (campo.required && !values[campo.name]) {
                  requiredFields.push(campo.label);
                }
              }
            }

            if (requiredFields.length > 0) {
              UI.toast(`Campos requeridos: ${requiredFields.join(', ')}`, 'warning');
              return;
            }

            // Adjuntar la firma digital (si se dibujó) al lote de valores.
            if (pad && !pad.isEmpty()) values.firma = pad.save();

            try {
              UI.toast('Generando PDF...', 'info');
              const blob = await API.formatos.generar(plantillaId, values);
              
              // Descargar el PDF
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${plantilla.nombre.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              // Liberar el objeto al liberarlo de inmediato cancela la descarga
              // en varios navegadores (queda en pantalla sin PDF ni error), así
              // que se difiere la revocación hasta que el navegador la tome.
              setTimeout(() => URL.revokeObjectURL(url), 1000);

              UI.toast('PDF generado y descargado exitosamente', 'success');
              if (window.Sounds) window.Sounds.confirmation().catch(() => {});
              UI.closeModal();
              load();
            } catch (error) {
              UI.toast('Error al generar PDF: ' + error.message, 'error');
            }
          });
        }
      } catch (error) {
        UI.toast('Error al cargar formulario: ' + error.message, 'error');
      }
    }

    // ============ FUNCIONES PARA PLANTILLAS DEL SISTEMA ============

    async function openTemplateForm(record) {
      if (!boss) return;
      const isEdit = Boolean(record);
      const modal = UI.openModal({
        title: isEdit ? 'Editar plantilla' : 'Crear plantilla',
        body: `
          <form id="template-form" novalidate>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 16px;">
              ${UI.field('name', 'Nombre de la plantilla', { required: true, full: true, value: record ? record.name : '' })}
              ${UI.field('type', 'Tipo', { type: 'select', options: TYPES, value: record ? record.type : 'formato' })}
              ${UI.field('observations', 'Descripción', { type: 'textarea', full: true, value: record ? record.observations : '' })}
            </div>
            <div style="margin-top:16px;">
              <h4 style="margin:0 0 10px;">Campos de la plantilla</h4>
              <div id="template-fields-container">
                ${(record && record.templateFields || [{ name: '', label: '', type: 'text', required: false }]).map((f, i) => `
                  <div class="template-field-row" style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;margin-bottom:8px;align-items:end;">
                    ${UI.field(`field_name_${i}`, 'Nombre campo', { value: f.name })}
                    ${UI.field(`field_label_${i}`, 'Etiqueta', { value: f.label })}
                    ${UI.field(`field_type_${i}`, 'Tipo', { type: 'select', options: ['text', 'number', 'date', 'select', 'textarea'], value: f.type })}
                    <button type="button" class="btn btn-danger btn-sm remove-field" data-index="${i}">X</button>
                  </div>
                `).join('')}
              </div>
              <button type="button" class="btn btn-secondary btn-sm" id="add-field">+ Agregar campo</button>
            </div>
          </form>
        `,
        footer: `
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary" type="submit" form="template-form">${isEdit ? 'Guardar cambios' : 'Crear plantilla'}</button>
        `,
        size: 800,
      });

      const bodyEl = modal.bodyEl;
      const overlay = bodyEl ? bodyEl.closest('#modal-overlay') : null;
      if (overlay) {
        const cancelBtn = overlay.querySelector('[data-cancel]');
        if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());
      }
      
      let fieldCount = (record && record.templateFields) ? record.templateFields.length : 1;
      
      const addFieldBtn = bodyEl ? bodyEl.querySelector('#add-field') : null;
      if (addFieldBtn) {
        addFieldBtn.addEventListener('click', () => {
          const fieldsContainer = bodyEl.querySelector('#template-fields-container');
          if (!fieldsContainer) return;
          const row = document.createElement('div');
          row.className = 'template-field-row';
          row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;margin-bottom:8px;align-items:end;';
          row.innerHTML = `
            ${UI.field(`field_name_${fieldCount}`, 'Nombre campo', { value: '' })}
            ${UI.field(`field_label_${fieldCount}`, 'Etiqueta', { value: '' })}
            ${UI.field(`field_type_${fieldCount}`, 'Tipo', { type: 'select', options: ['text', 'number', 'date', 'select', 'textarea'], value: 'text' })}
            <button type="button" class="btn btn-danger btn-sm remove-field">X</button>
          `;
          fieldsContainer.appendChild(row);
          fieldCount++;
          const removeBtn = row.querySelector('.remove-field');
          if (removeBtn) removeBtn.addEventListener('click', () => row.remove());
        });
      }

      if (bodyEl) {
        bodyEl.querySelectorAll('.remove-field').forEach(btn => {
          btn.addEventListener('click', () => {
            const row = btn.closest('.template-field-row');
            if (row) row.remove();
          });
        });
      }

      const templateForm = bodyEl ? bodyEl.querySelector('#template-form') : null;
      if (templateForm) {
        templateForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const values = UI.collectForm(e.target);
          
          const templateFields = [];
          const rows = bodyEl.querySelectorAll('.template-field-row');
          rows.forEach((row, i) => {
            const name = values[`field_name_${i}`];
            const label = values[`field_label_${i}`];
            const type = values[`field_type_${i}`];
            if (name && label) {
              templateFields.push({ name, label, type, required: false });
            }
          });

          const body = {
            name: values.name,
            type: values.type,
            observations: values.observations,
            isTemplate: true,
            templateFields,
          };

          try {
            if (isEdit) {
              await API.documents.update(record._id, body);
            } else {
              await API.documents.create(body);
            }
            UI.toast(isEdit ? 'Plantilla actualizada' : 'Plantilla creada', 'success');
            UI.closeModal();
            load();
          } catch (error) {
            UI.toast(error.message, 'error');
          }
        });
      }
    }

    function openFillForm(record) {
      if (!record || !record.templateFields || !record.templateFields.length) {
        UI.toast('Esta plantilla no tiene campos configurados', 'warning');
        return;
      }

      const modal = UI.openModal({
        title: `Llenar: ${record.name}`,
        body: `
          <form id="fill-form" novalidate>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 16px;">
              ${record.templateFields.map(f => {
                const val = (record.filledData && record.filledData[f.name]) || '';
                return UI.field(f.name, f.label, { type: f.type, value: val, required: f.required });
              }).join('')}
            </div>
          </form>
        `,
        footer: `
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary" type="submit" form="fill-form">Guardar llenado</button>
        `,
        size: 700,
      });

      const bodyEl = modal.bodyEl;
      const overlay = bodyEl ? bodyEl.closest('#modal-overlay') : null;
      if (overlay) {
        const cancelBtn = overlay.querySelector('[data-cancel]');
        if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());
      }
      
      const fillForm = bodyEl ? bodyEl.querySelector('#fill-form') : null;
      if (fillForm) {
        fillForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const values = UI.collectForm(e.target);
          try {
            await API.documents.update(record._id, {
              filledData: values,
              filledBy: ApiClient.getStoredUser()._id,
              filledAt: new Date().toISOString(),
              status: 'recibido',
            });
            UI.toast('Formato llenado exitosamente', 'success');
            UI.closeModal();
            load();
          } catch (error) {
            UI.toast(error.message, 'error');
          }
        });
      }
    }
  },
};
