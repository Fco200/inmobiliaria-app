'use strict';

window.Pages = window.Pages || {};

window.Pages.properties = {
  title: 'Captar Propiedades',

  async render(container) {
    const stored = window.ApiClient ? window.ApiClient.getStoredUser() : null;
    const role = stored && stored.role ? (stored.role.code || stored.role) : '';
    const isBossUser = role === 'admin' || role === 'gerencia' || role === 'superadmin' || role === 'direccion';

    const OPERATION_LABELS = {
      venta: 'Venta',
      renta: 'Renta',
      compra_localizada: 'Compra Localizada',
    };
    const operationLabel = (value) => OPERATION_LABELS[value] || String(value || '').replace(/_/g, ' ');
    const operationOptions = [
      { value: 'venta', label: 'Venta' },
      { value: 'renta', label: 'Renta' },
      { value: 'compra_localizada', label: 'Compra Localizada' },
    ];
    const PROPERTY_STATUS = [
      { value: 'disponible', label: 'Disponible' },
      { value: 'apartada', label: 'Apartada' },
      { value: 'inactiva', label: 'Inactiva' },
      { value: 'concluida', label: 'Concluida' },
    ];

    const statMini = (label, value) => `
      <div class="stat-card" style="padding:10px;">
        <div class="stat-label">${UI.escapeHtml(label)}</div>
        <div class="stat-value" style="font-size:18px;">${value}</div>
      </div>`;

    async function openPriceMarketModal(record) {
      UI.openModal({
        title: `Precio y mercado — ${record.zone || record.city || 'Propiedad'}`,
        body: '<div class="loading">Cargando...</div>',
        size: 760,
      });
      try {
        const market = await API.properties.market(record._id);
        const body = document.querySelector('#modal-overlay [data-body]');
        const history = record.priceHistory || [];
        const current = Number(record.price) || 0;
        const mk = market || {};
        const historyRows = history.map((h) => `
          <tr>
            <td>${Format.date(h.date)}</td>
            <td>${Format.currency(h.price)}</td>
            <td class="text-muted" style="font-size:12px;">${h.price === current ? 'Precio actual' : 'Cambio registrado'}</td>
          </tr>`).join('');
        const position = current && mk.min != null && mk.max > mk.min
          ? Math.max(2, Math.min(100, ((current - mk.min) / (mk.max - mk.min)) * 100))
          : 50;
        body.innerHTML = `
          <div class="grid grid-2">
            <div class="card">
              <h3 style="margin-top:0;">Historial de precios</h3>
              ${history.length
                ? `<div class="table-wrapper"><table class="table"><thead><tr><th>Fecha</th><th>Precio</th><th></th></tr></thead><tbody>${historyRows}</tbody></table></div>`
                : '<p class="text-muted">Sin cambios de precio registrados. El precio actual es el inicial.</p>'}
            </div>
            <div class="card">
              <h3 style="margin-top:0;">Comparativa de mercado</h3>
              ${mk.count
                ? `
                  <p class="text-muted" style="font-size:12px;">Basado en ${mk.count} ${mk.count === 1 ? 'inmueble similar' : 'inmuebles similares'} (${record.type} en ${record.city || 'misma ciudad'}).</p>
                  <div class="grid grid-2">
                    ${statMini('Promedio', Format.currency(mk.avg))}
                    ${statMini('Mínimo', Format.currency(mk.min))}
                    ${statMini('Máximo', Format.currency(mk.max))}
                    ${statMini('Este inmueble', Format.currency(current))}
                  </div>
                  <div class="progress" style="margin-top:14px;"><div class="progress-bar" style="width:${position}%;"></div></div>
                  <small class="text-muted">Posición aproximada en el rango de mercado</small>`
                : '<p class="text-muted">No hay inmuebles similares para comparar todavía.</p>'}
            </div>
          </div>`;
      } catch (error) {
        const body = document.querySelector('#modal-overlay [data-body]');
        if (body) body.innerHTML = UI.errorAlert(error.message);
      }
    }

    // Número de WhatsApp configurado en Ajustes (catálogo) para contacto directo.
    let whatsappNumber = '';
    try {
      const pub = await API.settings.public();
      whatsappNumber = (pub && pub.whatsappNumber) || '';
    } catch (error) { whatsappNumber = ''; }

    // Enlace wa.me con mensaje predefinido (mismo formato que la landing).
    const waLink = (text) => {
      const num = Format.waNumber(whatsappNumber);
      return num ? `https://wa.me/${num}?text=${encodeURIComponent(text)}` : '';
    };

    // Enlace wa.me de respaldo para una propiedad (solo si no hay PDF).
    const waHref = (record) => waLink(`Hola, me interesa la propiedad: ${record.type || ''} en ${record.zone || record.city || ''} (${operationLabel(record.operationType)}).`);

    // Imagen por defecto (SVG) cuando una propiedad no tiene fotografías.
    const PLACEHOLDER_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="500" viewBox="0 0 900 500">' +
      '<rect width="900" height="500" fill="#efeafb"/>' +
      '<path d="M450 150 250 320h60v110h280V320h60Z" fill="#cbb8ee"/>' +
      '<rect x="410" y="320" width="80" height="110" fill="#5B2D8E"/>' +
      '</svg>'
    );

    const detailRow = (label, value) =>
      `<tr><td data-label="${UI.escapeHtml(label)}">${UI.escapeHtml(label)}</td><td>${value}</td></tr>`;

    // Detalle completo de la propiedad: carrusel de fotos, ficha técnica,
    // historial, precio/mercado y acceso a edición + WhatsApp.
    async function openDetail(record) {
      let current = 0;
      const photos = (record.photos || []).filter(Boolean);
      const slides = photos.length ? photos : [PLACEHOLDER_IMG];
      const name = `${record.type || 'Propiedad'} — ${record.zone || ''} ${record.city || ''}`.replace(/\s+/g, ' ').trim() || 'Propiedad';

      const slide = (src) => `<div data-slide style="display:none;text-align:center;">
        <img src="${window.AppConfig.resolveUrl(src)}" alt="" style="width:100%;max-height:380px;object-fit:contain;border-radius:8px;background:#fff;">
      </div>`;
      const thumb = (src, i) => `<img data-thumb="${i}" src="${window.AppConfig.resolveUrl(src)}" alt="" style="width:64px;height:44px;object-fit:cover;border-radius:6px;cursor:pointer;border:2px solid ${i === 0 ? 'var(--primary)' : 'var(--border)'};">`;

      const modal = UI.openModal({
        title: name,
        body: `
          <div style="text-align:center;margin-bottom:6px;">
            <div style="font-size:26px;font-weight:800;color:var(--primary);">${Format.currency(record.price)}</div>
            <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:4px;">
              ${UI.badge(UI.escapeHtml(record.type || '—'), 'info')}
              ${UI.statusBadge(record.status)}
              ${UI.badge(UI.escapeHtml(operationLabel(record.operationType)), 'primary')}
              ${record.isPublished ? UI.badge('Compartida al inventario', 'success') : UI.badge('Privada', 'muted')}
            </div>
          </div>
          <div style="position:relative;margin:10px 0;">
            <div data-slides style="overflow:hidden;border-radius:10px;">${slides.map(slide).join('')}</div>
            ${slides.length > 1 ? `
              <button type="button" data-prev class="btn btn-secondary btn-sm" style="position:absolute;left:8px;top:45%;transform:translateY(-50%);">&#8249;</button>
              <button type="button" data-next class="btn btn-secondary btn-sm" style="position:absolute;right:8px;top:45%;transform:translateY(-50%);">&#8250;</button>
            ` : ''}
            <div data-counter class="text-muted" style="text-align:center;font-size:12px;margin-top:6px;">1 / ${slides.length}</div>
          </div>
          ${slides.length > 1 ? `<div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-bottom:12px;" data-thumbs>${slides.map(thumb).join('')}</div>` : ''}
          <div class="table-wrapper card" style="padding:0;">
            <table class="table">
              <tbody>
                ${detailRow('Folio', UI.escapeHtml(record.folio || '—'))}
                ${detailRow('Tipo', UI.escapeHtml(record.type || '—'))}
                ${detailRow('Operación', UI.escapeHtml(operationLabel(record.operationType)))}
                ${detailRow('Dirección', UI.escapeHtml(record.address || '—'))}
                ${detailRow('Zona / Colonia', UI.escapeHtml(record.zone || '—'))}
                ${detailRow('Ciudad', UI.escapeHtml(record.city || '—'))}
                ${detailRow('Estado', UI.escapeHtml(record.state || '—'))}
                ${detailRow('Precio', Format.currency(record.price))}
                ${detailRow('Valor ticket', record.ticketValue ? Format.currency(record.ticketValue) : '—')}
                ${detailRow('Origen', record.isExternal ? `Externa${record.externalAdvisor ? ` — ofrecida por ${UI.escapeHtml(record.externalAdvisor)}` : ''}` : 'Captación del equipo')}
                ${detailRow('Asesor', record.responsibleUser ? UI.escapeHtml(record.responsibleUser.name || record.responsibleUser) : '—')}
                ${detailRow('Propietario', record.owner ? UI.escapeHtml(record.owner.name || record.owner) : UI.escapeHtml(record.ownerName || '—'))}
                ${detailRow('Se puede vender con', paymentMethodsLabel(record))}
              </tbody>
            </table>
          </div>
          ${record.description ? `<div class="card" style="margin-top:12px;"><h4 style="margin:0 0 6px;">Descripción</h4><p class="preserve-lines" style="margin:0;">${UI.escapeHtml(record.description)}</p></div>` : ''}
        `,
        footer: `
          ${window.WhatsAppGenerator ? '<button class="btn btn-success" type="button" data-share-wa>&#128172;&nbsp; Compartir (PDF)</button>' : (waLink(`Hola, me interesa la propiedad: ${record.type || ''} en ${record.zone || record.city || ''} (${operationLabel(record.operationType)}).`) ? `<a class="btn btn-success" target="_blank" rel="noopener" href="${waLink(`Hola, me interesa la propiedad: ${record.type || ''} en ${record.zone || record.city || ''} (${operationLabel(record.operationType)}).`)}">&#128172;&nbsp; WhatsApp</a>` : '')}
          ${photos.length > 1 ? `<button class="btn btn-secondary" type="button" data-gallery>Fotografías</button>` : ''}
          <button class="btn btn-secondary" type="button" data-history>Historial</button>
          ${openPropertyForm ? `<button class="btn btn-primary" type="button" data-edit-detail>Editar</button>` : ''}
          <button class="btn btn-secondary" type="button" data-market>Precio y mercado</button>
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
        `,
        size: 860,
      });

      const bodyEl = modal.bodyEl;
      const overlay = bodyEl ? bodyEl.closest('#modal-overlay') : null;
      if (!overlay) return;

      const slidesBox = overlay.querySelector('[data-slides]');
      const counterEl = overlay.querySelector('[data-counter]');
      const thumbsBox = overlay.querySelector('[data-thumbs]');
      function renderSlide(i) {
        current = (i + slides.length) % slides.length;
        if (slidesBox) {
          slidesBox.querySelectorAll('[data-slide]').forEach((el, idx) => {
            el.style.display = idx === current ? 'block' : 'none';
          });
        }
        if (counterEl) counterEl.textContent = `${current + 1} / ${slides.length}`;
        if (thumbsBox) {
          thumbsBox.querySelectorAll('[data-thumb]').forEach((el) => {
            el.style.borderColor = Number(el.dataset.thumb) === current ? 'var(--primary)' : 'var(--border)';
          });
        }
      }
      const prevBtn = overlay.querySelector('[data-prev]');
      if (prevBtn) prevBtn.addEventListener('click', () => renderSlide(current - 1));
      const nextBtn = overlay.querySelector('[data-next]');
      if (nextBtn) nextBtn.addEventListener('click', () => renderSlide(current + 1));
      overlay.querySelectorAll('[data-thumb]').forEach((el) => {
        el.addEventListener('click', () => renderSlide(Number(el.dataset.thumb)));
      });
      renderSlide(0);

      const cancelBtn = overlay.querySelector('[data-cancel]');
      if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());
      const shareWaBtn = overlay.querySelector('[data-share-wa]');
      if (shareWaBtn) shareWaBtn.addEventListener('click', () => {
        WhatsAppGenerator.open({ property: record });
      });
      const galleryBtn = overlay.querySelector('[data-gallery]');
      if (galleryBtn) galleryBtn.addEventListener('click', () => UI.showImages(photos, name));
      const historyBtn = overlay.querySelector('[data-history]');
      if (historyBtn) historyBtn.addEventListener('click', () => UI.showActivityHistory('Property', record._id, `Centro de actividad — ${record.zone || record.address || 'Propiedad'}`));
      const marketBtn = overlay.querySelector('[data-market]');
      if (marketBtn) marketBtn.addEventListener('click', () => openPriceMarketModal(record));
      const editBtn = overlay.querySelector('[data-edit-detail]');
      if (editBtn) editBtn.addEventListener('click', () => { UI.closeModal(); openPropertyForm(record); });
    }

    let users = [];
    let owners = [];
    try {
      const [u, o] = await Promise.all([
        API.users.list({ limit: 100 }).catch(() => ({ data: [] })),
        // El propietario puede ser cualquier cliente de la cartera (no solo
        // quienes venden): se usa el catálogo ligero con búsqueda, que además
        // admite escribir para filtrar y no obliga a recorrer todo el listado.
        API.clients.options({ limit: 50 }).catch(() => ({ data: [] })),
      ]);
      // Las respuestas pueden llegar de dos formas: el arreglo directo (p. ej.
      // /clients/options, que no devuelve `meta` y ApiClient ya desenvuelve) o
      // envuelto en { data: [...] } (listados paginados como /users). Se
      // normaliza aquí: antes se leía siempre `res.data`, así que cuando llegaba
      // el arreglo directo quedaba `undefined` y el módulo rompía al hacer
      // `owners.map(...)` ("Cannot read properties of undefined (reading 'map')").
      const toArray = (res) => (Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []));
      users = toArray(u);
      owners = toArray(o);
    } catch (error) {
      users = [];
      owners = [];
    }

    const userOptions = UI.sortByLabel(users, (x) => x.name)
      .map((x) => ({ value: x._id, label: x.name }));
    // El asesor responsable es SIEMPRE el usuario que registra la propiedad.
    // Se asegura que aparezca en las opciones aunque el listado de usuarios
    // no lo incluya (por permisos o porque la consulta falló).
    const storedId = stored ? (stored._id || stored.id || '') : '';
    if (storedId && !userOptions.some((o) => String(o.value) === String(storedId))) {
      userOptions.unshift({ value: storedId, label: stored.name || stored.nombre || 'Yo' });
    }
    const ownerOptions = UI.sortByLabel(owners, (x) => `${x.nombre || 'Cliente'} ${x.telefono || ''}`)
      .map((x) => ({
        value: x._id,
        label: `${x.nombre || 'Cliente'}${x.telefono ? ` — ${x.telefono}` : ''}`,
      }));

    const typeLabel = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : '—');

    // Etiquetas de las formas de pago guardadas en `paymentMethods`.
    const PAYMENT_LABELS = {
      contado: 'Contado',
      infonavit: 'Infonavit',
      banco: 'Banco',
      fovissste: 'Fovissste',
      todos: 'Todos',
      otro: 'Otro',
    };
    const paymentMethodsLabel = (record) => {
      const list = Array.isArray(record.paymentMethods) ? record.paymentMethods : [];
      if (!list.length) return '—';
      const labels = list.map((m) => {
        if (m === 'otro' && record.paymentMethodsOther) return record.paymentMethodsOther;
        return PAYMENT_LABELS[m] || m;
      });
      return labels.join(', ');
    };

    // Fotografías nuevas (archivos) pendientes por subir. Las llena el editor
    // visual (PhotoManager) a través de formData justo antes de guardar.
    let pendingPhotoFiles = [];

    // Inserta el editor visual de fotos (PhotoManager) en el formulario, como
    // un campo de ancho completo antes de la descripción. Sustituye al antiguo
    // par de campos "URLs" + "subir archivos".
    const mountPhotoManager = (form, record) => {
      if (!form || !window.PhotoManager) return;
      const manager = window.PhotoManager.create({
        photos: record && Array.isArray(record.photos) ? record.photos : [],
      });
      const wrap = document.createElement('div');
      wrap.className = 'form-group';
      wrap.style.gridColumn = '1 / -1';
      wrap.innerHTML = '<label>Fotografías</label>';
      wrap.appendChild(manager.el);
      const grid = form.querySelector('div');
      const descWrap = form.querySelector('#fld-description') ? form.querySelector('#fld-description').parentElement : null;
      if (grid && descWrap && descWrap.parentElement === grid) grid.insertBefore(wrap, descWrap);
      else if (grid) grid.appendChild(wrap);
      else form.appendChild(wrap);
      form._photoManager = manager;
    };

    // Sube fotos de una propiedad YA creada/guardada usando el endpoint
    // dedicado multipart (campo "photos"). Se envían en LOTES pequeños (4 por
    // petición) para que el asesor no vea "se quedó a medias": cada lote se
    // reintenta solo y el progreso se muestra en pantalla.
    const uploadPropertyPhotos = async (propId, files) => {
      const list = Array.from(files || []);
      if (!list.length) return 0;
      let lastToast = 0;
      const { added, failed } = await API.properties.uploadPhotosBatch(propId, list, {
        chunkSize: 4,
        retries: 1,
        onProgress: (done, total) => {
          const now = Date.now();
          if (now - lastToast < 800 && done < total) return;
          lastToast = now;
          UI.toast(`Subiendo fotografías… ${done}/${total}`, 'info');
        },
      });
      if (failed) UI.toast(`No se subieron ${failed} ${failed === 1 ? 'imagen' : 'imágenes'}.`, 'warning');
      else if (added) UI.toast(`${added} ${added === 1 ? 'fotografía subida' : 'fotografías subidas'}.`, 'success');
      return added;
    };

    // Referencia al formulario de edición que usa crudPage; openDetail lo
    // reactiva y le pasa el registro (sin perder los botones del detalle).
    let openPropertyForm = null;

    crudPage(container, {
      title: 'Captar Propiedades',
      newLabel: 'Nueva propiedad',
      // Aviso que permanece visible mientras se suben las fotos y se guarda la
      // propiedad. El formulario se puede cerrar: la carga sigue en segundo
      // plano y el listado se actualiza al terminar.
      submitNotice: (isEdit) => (isEdit
        ? 'Guardando propiedad… Estamos subiendo las fotografías nuevas. Puedes revisar este módulo más tarde; ya puedes cerrar esta ventana y el proceso continuará.'
        : 'Subiendo propiedad… Estamos guardando los datos y las fotografías. Puedes revisar este módulo más tarde; ya puedes cerrar esta ventana y el proceso continuará.'),
      service: {
        list: (params) => API.properties.list(params),
        // Al CREAR se guarda PRIMERO la propiedad y después se suben las fotos.
        // Así una foto pesada o en formato no compatible (p. ej. HEIC de iPhone)
        // ya no impide registrar la propiedad: si alguna falla, se avisa y la
        // ficha queda guardada para completarla después.
        create: async (body) => {
          const files = pendingPhotoFiles;
          pendingPhotoFiles = [];
          delete body.photos_files;
          const created = await API.properties.create(body);
          const prop = created.data !== undefined ? created.data : created;
          if (files.length && prop && prop._id) {
            try {
              const ok = await uploadPropertyPhotos(prop._id, files);
              if (ok > 0) {
                try {
                  const fresh = await API.properties.get(prop._id);
                  return fresh.data !== undefined ? fresh.data : fresh;
                } catch (e) { /* se devuelve lo que ya se creó */ }
              }
            } catch (error) {
              UI.toast('La propiedad se guardó, pero no se pudieron subir las fotografías. Puedes agregarlas editándola.', 'warning');
            }
          }
          return prop;
        },
        // Al EDITAR: guarda la propiedad y después sube las fotos nuevas con el
        // endpoint dedicado, para que se registren aunque el archivo falle.
        update: async (id, body, record) => {
          delete body.photos_files;
          const files = pendingPhotoFiles;
          pendingPhotoFiles = [];
          const saved = await API.properties.update(id, body);
          if (files.length) {
            const ok = await uploadPropertyPhotos(id, files);
            if (ok > 0) {
              try { const fresh = await API.properties.get(id); return fresh.data !== undefined ? fresh.data : fresh; }
              catch (e) { /* el guardado inicial ya aplicó */ }
            }
          }
          return saved.data !== undefined ? saved.data : saved;
        },
        remove: (id) => API.properties.remove(id),
      },
      statusOptions: PROPERTY_STATUS,
      filters: [
        { key: 'owner', label: 'Propietario', searchSource: UI.remoteSources.client, placeholder: 'Todos los propietarios' },
        { key: 'operationType', label: 'Operación', placeholder: 'Todas las operaciones', options: operationOptions },
        { key: 'type', label: 'Tipo', placeholder: 'Todos los tipos', options: ['casa', 'departamento', 'local', 'bodega', 'rancho', 'terreno', 'playa', 'otro'] },
        { key: 'minPrice', label: 'Precio mínimo', type: 'number', placeholder: 'Precio mín.', width: 130 },
        { key: 'maxPrice', label: 'Precio máximo', type: 'number', placeholder: 'Precio máx.', width: 130 },
      ],
      columns: [
        { key: 'photos', label: 'Foto', render: (r) => {
            const hasPhoto = Boolean(r.photos && r.photos.length);
            const src = hasPhoto ? window.AppConfig.resolveUrl(r.photos[0]) : window.AppConfig.FALLBACK_IMG;
            return `<img src="${src.replace(/"/g, '&quot;')}" alt="${hasPhoto ? '' : 'Sin foto'}" style="width:52px;height:40px;object-fit:cover;border-radius:6px;" loading="lazy" ${window.AppConfig.imgFallback}>`;
          } },
        { key: 'type', label: 'Tipo', render: (r) => UI.badge(typeLabel(r.type), 'info') },
        { key: 'operationType', label: 'Operación', render: (r) => UI.escapeHtml(operationLabel(r.operationType)) },
        { key: 'address', label: 'Ubicación', render: (r) => `${UI.escapeHtml(r.zone || '')} ${UI.escapeHtml(r.city || '')}${r.state ? `, ${UI.escapeHtml(r.state)}` : ''}`.trim() || '—' },
        { key: 'price', label: 'Precio', render: (r) => Format.currency(r.price) },
        { key: 'ticketValue', label: 'Valor ticket', render: (r) => (r.ticketValue ? Format.currency(r.ticketValue) : '—') },
        { key: 'status', label: 'Estado', render: (r) => UI.statusBadge(r.status) },
        { key: 'responsibleUser', label: 'Asesor', render: (r) => UI.escapeHtml(r.responsibleUser ? (r.responsibleUser.name || r.responsibleUser) : '—') },
        { key: 'isPublished', label: 'Inventario general', render: (r) => (r.isPublished ? UI.badge('Compartida', 'success') : UI.badge('Privada', 'muted')) },
        { key: 'isExternal', label: 'Origen', render: (r) => (r.isExternal ? `${UI.badge('Externa', 'warning')}${r.externalAdvisor ? `<div class="text-muted" style="font-size:11px;">${UI.escapeHtml(r.externalAdvisor)}</div>` : ''}` : '<span class="text-muted" style="font-size:12px;">Equipo</span>') },
      ],
      fields: [
        { name: 'folio', label: 'Folio', type: 'text', readonly: true, placeholder: 'Se genera automáticamente', hint: 'Folio inmutable con formato AÑO-###. Lo asigna el sistema y no se puede editar.' },
        { name: 'type', label: 'Tipo de inmueble', type: 'select', required: true, options: ['casa', 'departamento', 'local', 'bodega', 'rancho', 'terreno', 'playa', 'otro'] },
        { name: 'operationType', label: 'Tipo de operación', type: 'select', required: true, options: operationOptions },
        { name: 'price', label: 'Precio', type: 'number' },
        { name: 'ticketValue', label: 'Valor ticket', type: 'number', hint: 'Costo equivalente de la operación para métricas' },
        { name: 'status', label: 'Estado', type: 'select', options: PROPERTY_STATUS },
        { name: 'address', label: 'Dirección', type: 'text', full: true },
        { name: 'zone', label: 'Zona / colonia', type: 'text' },
        { name: 'city', label: 'Ciudad', type: 'text' },
        { name: 'state', label: 'Estado', type: 'text' },
        { name: 'owner', label: 'Propietario', type: 'select', sinOtros: true, search: true, placeholder: 'Escribe nombre o teléfono para buscar…', searchSource: UI.remoteSources.client, options: [{ value: '', label: '— Sin propietario —' }, ...ownerOptions, { value: '__externo__', label: 'Otro (propietario externo) — escribir nombre' }] },
        { name: 'ownerName', label: 'Nombre del propietario externo', type: 'text', placeholder: 'Ej. Juan Pérez (no está en la cartera)', hint: 'Solo si elegiste "propietario externo" en el campo anterior.' },
        { name: 'responsibleUser', label: 'Asesor responsable', type: 'select', sinOtros: true, options: userOptions, value: storedId, hint: 'Se asigna automáticamente al asesor que registra la propiedad.' },
        { name: 'isExternal', label: 'Propiedad externa (ajena al equipo / de otra inmobiliaria)', type: 'checkbox', full: true, hint: 'Aparecerá en el inventario general del equipo con la etiqueta Externa.' },
        { name: 'externalAdvisor', label: 'Asesor / inmobiliaria externa', type: 'text', placeholder: 'Ej. Inmobiliaria Centro, Asesor Juan Pérez…', hint: 'Solo si la propiedad es externa.' },
        { name: 'paymentMethods', label: 'Se puede vender con', type: 'checkboxGroup', full: true, options: [
          { value: 'contado', label: 'Contado' },
          { value: 'infonavit', label: 'Infonavit' },
          { value: 'banco', label: 'Banco' },
          { value: 'fovissste', label: 'Fovissste' },
          { value: 'todos', label: 'Todos' },
          { value: 'otro', label: 'Otro (especificar)' },
        ], hint: 'Formas de pago que se aceptan para esta propiedad.' },
        { name: 'paymentMethodsOther', label: 'Otra forma de pago', type: 'text', placeholder: 'Ej. Pago mixto, crédito FOVISSSTE + enganche…' },
        { name: 'isPublished', label: 'Compartir al inventario general', type: 'checkbox', full: true, hint: 'Si lo marcas, la propiedad aparece en el módulo "Propiedades" (inventario general) para que los demás asesores la vean y creen a partir de ella. Si no, queda privada hasta que la compartas.' },
        { name: 'description', label: 'Descripción', type: 'textarea', rows: 10, full: true, hint: 'Describe medidas, espacios, amenidades y estado. Mientras más detalle, mejor aparece en el catálogo y en las búsquedas. El campo es amplio (10 renglones) y se puede arrastrar para hacerlo más grande.' },
      ],
      formData(values, record, form) {
        const body = { ...values };
        // Al crear, el asesor responsable viaja explícitamente con el ID del
        // usuario que registra la propiedad (el backend también lo confirma).
        if (!record) {
          const me = window.ApiClient ? window.ApiClient.getStoredUser() : null;
          if (me && me._id) body.responsibleUser = me._id;
        }
        // Fotografías: las administra el editor visual (URLs existentes ya sin
        // las eliminadas + archivos nuevos pendientes de subir).
        const manager = form ? form._photoManager : null;
        body.photos = manager ? manager.getPhotos() : [];
        pendingPhotoFiles = manager ? manager.getFiles() : [];
        delete body.photos_files;

        // Propietario: opción "externo" → el nombre va en texto libre y el
        // campo ObjectId queda vacío (no se manda el centinela al servidor).
        if (values.owner === '__externo__') {
          const nombre = String(values.ownerName || '').trim();
          if (!nombre) throw new Error('Escribe el nombre del propietario externo.');
          body.owner = null;
          body.ownerName = nombre;
        } else {
          body.owner = values.owner || null;
          body.ownerName = '';
        }

        // Formas de pago: sólo se conserva el texto "otro" si la casilla está.
        const methods = Array.isArray(values.paymentMethods) ? values.paymentMethods : [];
        body.paymentMethods = methods;
        if (methods.includes('otro')) {
          const extra = String(values.paymentMethodsOther || '').trim();
          if (!extra) throw new Error('Especifica la otra forma de pago.');
          body.paymentMethodsOther = extra;
        } else {
          body.paymentMethodsOther = '';
        }

        // Propiedad externa: el nombre del asesor externo solo viaja si está
        // marcada; si no, se limpia para no dejar datos huérfanos.
        body.isExternal = values.isExternal === true;
        body.externalAdvisor = body.isExternal ? String(values.externalAdvisor || '').trim() : '';
        return body;
      },
      onFormMount(form, record) {
        // Editor visual de fotografías (agregar / quitar / reordenar).
        mountPhotoManager(form, record);

        // Asesor responsable: al CREAR queda fijado al usuario que registra la
        // propiedad (el backend también lo fuerza). Al editar se conserva el
        // asesor actual y solo se permite cambiarlo si ya venía asignado.
        const responsibleSel = form.querySelector('#fld-responsibleUser');
        if (responsibleSel) {
          const responsibleHint = responsibleSel.parentElement
            ? responsibleSel.parentElement.querySelector('small.text-muted')
            : null;
          if (responsibleHint) {
            responsibleHint.textContent = record
              ? 'Asesor que tiene la propiedad en su cartera.'
              : 'Se asigna automáticamente al asesor que registra la propiedad.';
          }
          // Siempre asegurar que el usuario en sesión esté presente y seleccionado cuando aplique
          if (stored && stored._id) {
            if (!Array.from(responsibleSel.options).some((o) => String(o.value) === String(stored._id))) {
              const opt = document.createElement('option');
              opt.value = String(stored._id);
              opt.textContent = stored.name || stored.nombre || stored.username || 'Yo';
              responsibleSel.appendChild(opt);
            }
          }
          if (record) {
            const currentId = record.responsibleUser && (record.responsibleUser._id || record.responsibleUser);
            if (currentId) {
              const exists = Array.from(responsibleSel.options).some((o) => String(o.value) === String(currentId));
              if (!exists) {
                const opt = document.createElement('option');
                opt.value = String(currentId);
                opt.textContent = (record.responsibleUser && record.responsibleUser.name) || stored?.name || 'Asesor actual';
                responsibleSel.appendChild(opt);
              }
              responsibleSel.value = String(currentId);
            } else if (stored && stored._id) {
              responsibleSel.value = String(stored._id);
            }
          } else {
            if (stored && stored._id) {
              responsibleSel.value = String(stored._id);
            }
            responsibleSel.disabled = true;
            responsibleSel.title = 'Se asigna automáticamente al asesor que registra la propiedad.';
          }
        }

        const wrapOf = (id) => {
          const el = form.querySelector(id);
          return el ? el.parentElement : null;
        };
        // Propietario externo: muestra/oculta el nombre libre.
        const ownerSel = form.querySelector('#fld-owner');
        const ownerNameWrap = wrapOf('#fld-ownerName');
        const syncOwner = () => {
          if (ownerNameWrap) ownerNameWrap.style.display = ownerSel && ownerSel.value === '__externo__' ? '' : 'none';
        };
        if (ownerSel) ownerSel.addEventListener('change', syncOwner);
        syncOwner();

        // Otra forma de pago: sólo aparece con la casilla "Otro" marcada.
        const otherWrap = wrapOf('#fld-paymentMethodsOther');
        const boxes = Array.from(form.querySelectorAll('input[name="paymentMethods"]'));
        const syncPay = () => {
          if (otherWrap) otherWrap.style.display = boxes.some((b) => b.value === 'otro' && b.checked) ? '' : 'none';
        };
        boxes.forEach((b) => b.addEventListener('change', syncPay));
        syncPay();

        // Propiedad externa: el nombre del asesor externo solo se muestra
        // cuando la casilla "externa" está marcada.
        const extCheck = form.querySelector('#fld-isExternal');
        const extWrap = wrapOf('#fld-externalAdvisor');
        const syncExt = () => {
          if (extWrap) extWrap.style.display = extCheck && extCheck.checked ? '' : 'none';
        };
        if (extCheck) extCheck.addEventListener('change', syncExt);
        syncExt();
      },
      extraActions(record) {
        let out = `<button class="btn btn-secondary btn-sm" data-extra data-detail="1" data-record="${record._id}" style="margin-left:6px;" title="Ver detalle completo">Detalle</button>`;
        if (record.photos && record.photos.length) {
          out += `<button class="btn btn-secondary btn-sm" data-extra data-show-photos="1" data-record="${record._id}" style="margin-left:6px;" title="Ver fotografías">&#128247;&nbsp; Fotos (${record.photos.length})</button>`;
        }
        const pub = record.isPublished
          ? `<button class="btn btn-secondary btn-sm" data-extra data-toggle-pub="1" data-record="${record._id}" style="margin-left:6px;" title="Dejar de compartir en el inventario general">Dejar de compartir</button>`
          : `<button class="btn btn-primary btn-sm" data-extra data-toggle-pub="1" data-record="${record._id}" style="margin-left:6px;" title="Compartir en el inventario general para los demás asesores">Compartir al inventario</button>`;
        return out + pub +
          `<button class="btn btn-secondary btn-sm" data-extra data-property-history="1" data-record="${record._id}" style="margin-left:6px;">Historial</button>` +
          `<button class="btn btn-secondary btn-sm" data-extra data-price-market="1" data-record="${record._id}" style="margin-left:6px;">Precio y mercado</button>` +
          (window.WhatsAppGenerator
            ? `<button class="btn btn-sm crm-btn-wa" data-extra data-share-wa="1" data-record="${record._id}" style="margin-left:6px;" title="Compartir por WhatsApp con PDF">&#128172;&nbsp; Compartir</button>`
            : (waHref(record) ? `<a class="btn btn-sm crm-btn-wa" style="margin-left:6px;" target="_blank" rel="noopener" href="${waHref(record)}" title="Enviar WhatsApp">&#128172;&nbsp; WhatsApp</a>` : ''));
      },
      onExtraAction(record, btn, ctx) {
        if (btn.dataset.detail) {
          openDetail(record);
          return;
        }
        if (btn.dataset.shareWa) {
          WhatsAppGenerator.open({ property: record });
          return;
        }
        if (btn.dataset.showPhotos) {
          UI.showImages(record.photos, `${UI.escapeHtml(record.type || 'Propiedad')} — ${UI.escapeHtml(record.zone || '')} ${UI.escapeHtml(record.city || '')}`);
          return;
        }
        if (btn.dataset.propertyHistory) {
          UI.showActivityHistory('Property', record._id, `Centro de actividad — ${record.zone || record.address || 'Propiedad'}`);
          return;
        }
        if (btn.dataset.priceMarket) {
          openPriceMarketModal(record);
          return;
        }
        API.properties
          .publish(record._id, { isPublished: !record.isPublished })
          .then(() => {
            ctx.toast(record.isPublished ? 'Ya no se comparte en el inventario general' : 'Compartida en el inventario general', 'success');
            ctx.reload();
          })
          .catch((error) => ctx.toast(error.message, 'error'));
      },
      onEdit: (record, openForm) => {
        // Captura el formulario de crudPage para reabrirlo desde el detalle.
        openPropertyForm = openForm;
        return openForm(record);
      },
      onRemove: true,
    });
  },
};
