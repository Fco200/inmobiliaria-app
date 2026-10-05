'use strict';

window.Pages = window.Pages || {};

window.Pages.properties = {
  title: 'Capturar Propiedades',

  async render(container) {
    const stored = window.ApiClient ? window.ApiClient.getStoredUser() : null;
    const role = stored && stored.role ? (stored.role.code || stored.role) : '';
    const isBossUser = role === 'admin' || role === 'gerencia' || role === 'superadmin';

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
    const waLink = (text) => whatsappNumber
      ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`
      : '';

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
              ${UI.badge(UI.escapeHtml((record.operationType || '').toUpperCase()), 'primary')}
              ${record.isPublished ? UI.badge('Publicada', 'success') : UI.badge('Sin publicar', 'muted')}
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
                ${detailRow('Tipo', UI.escapeHtml(record.type || '—'))}
                ${detailRow('Operación', UI.escapeHtml((record.operationType || '').toUpperCase()))}
                ${detailRow('Dirección', UI.escapeHtml(record.address || '—'))}
                ${detailRow('Zona / Colonia', UI.escapeHtml(record.zone || '—'))}
                ${detailRow('Ciudad', UI.escapeHtml(record.city || '—'))}
                ${detailRow('Estado', UI.escapeHtml(record.state || '—'))}
                ${detailRow('Precio', Format.currency(record.price))}
                ${detailRow('Valor ticket', record.ticketValue ? Format.currency(record.ticketValue) : '—')}
                ${detailRow('Asesor', record.responsibleUser ? UI.escapeHtml(record.responsibleUser.name || record.responsibleUser) : '—')}
                ${detailRow('Propietario', record.owner ? UI.escapeHtml(record.owner.name || record.owner) : '—')}
              </tbody>
            </table>
          </div>
          ${record.description ? `<div class="card" style="margin-top:12px;"><h4 style="margin:0 0 6px;">Descripción</h4><p style="margin:0;">${UI.escapeHtml(record.description)}</p></div>` : ''}
        `,
        footer: `
          ${waLink(`Hola, me interesa la propiedad: ${record.type || ''} en ${record.zone || record.city || ''} (${(record.operationType || '').toUpperCase()}).`) ? `<a class="btn btn-success" target="_blank" rel="noopener" href="${waLink(`Hola, me interesa la propiedad: ${record.type || ''} en ${record.zone || record.city || ''} (${(record.operationType || '').toUpperCase()}).`)}">&#128172;&nbsp; WhatsApp</a>` : ''}
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
        API.clients.list({ limit: 100, type: 'vendedor' }).catch(() => ({ data: [] })),
      ]);
      users = u.data;
      owners = o.data;
    } catch (error) {
      users = [];
      owners = [];
    }

    const userOptions = users.map((x) => ({ value: x._id, label: x.name }));
    const ownerOptions = owners.map((x) => ({ value: x._id, label: x.name }));

    const typeLabel = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : '—');

    // Fotografías pendientes por subir (se leen del input de archivo al guardar).
    const readPendingPhotoFiles = () => {
      const input = document.getElementById('fld-photos_files');
      return input && input.files ? Array.from(input.files) : [];
    };

    // Sube las fotos del input una por una vía /documents/upload y devuelve las
    // URLs ya subidas. Tolera fallos por archivo (p. ej. HEIC no reconocido o
    // imagen pesada en el celular) sin descartar las que sí funcionan.
    const uploadPhotoUrls = async (files) => {
      const urls = [];
      let failed = 0;
      for (const file of files) {
        try {
          const res = await API.documents.upload(file);
          if (res && res.fileUrl) urls.push(res.fileUrl);
          else failed += 1;
        } catch (error) {
          failed += 1;
          console.error('[Fotos] No se pudo subir una imagen:', error && error.message);
        }
      }
      return { urls, failed };
    };

    // Sube fotos de una propiedad YA creada/guardada usando el endpoint
    // dedicado multipart (campo "photos"). Se envía UNA por llamada para que
    // un archivo rechazado (p. ej. HEIC no reconocido o imagen muy pesada) no
    // tumbe al resto.
    const uploadPropertyPhotos = async (propId, files) => {
      if (!files.length) return 0;
      UI.toast(`Subiendo ${files.length} ${files.length === 1 ? 'fotografía' : 'fotografías'}...`, 'info');
      let ok = 0;
      let failed = 0;
      for (const file of Array.from(files)) {
        try {
          await API.properties.uploadPhotos(propId, [file]);
          ok += 1;
        } catch (error) {
          failed += 1;
          console.error('[Fotos] No se pudo subir una imagen:', error && error.message);
        }
      }
      if (failed) UI.toast(`No se subieron ${failed} ${failed === 1 ? 'imagen' : 'imágenes'}.`, 'warning');
      return ok;
    };

    // Referencia al formulario de edición que usa crudPage; openDetail lo
    // reactiva y le pasa el registro (sin perder los botones del detalle).
    let openPropertyForm = null;

    crudPage(container, {
      title: 'Capturar Propiedades',
      newLabel: 'Nueva propiedad',
      service: {
        list: (params) => API.properties.list(params),
        // Al CREAR: sube las fotos primero (obtiene URLs) y las guarda en la
        // propiedad en el mismo registro. Al menos una foto es obligatoria.
        create: async (body) => {
          const files = readPendingPhotoFiles();
          const existing = Array.isArray(body.photos) ? body.photos.filter(Boolean) : [];
          if (!files.length && !existing.length) {
            throw new Error('La propiedad debe incluir al menos una fotografía.');
          }
          if (files.length) {
            UI.toast(`Subiendo ${files.length} ${files.length === 1 ? 'fotografía' : 'fotografías'}...`, 'info');
            const { urls, failed } = await uploadPhotoUrls(files);
            if (urls.length) body.photos = [...(body.photos || []), ...urls];
            if (failed) UI.toast(`No se subieron ${failed} ${failed === 1 ? 'imagen' : 'imágenes'}.`, 'warning');
            if (!(body.photos || []).filter(Boolean).length) {
              throw new Error('No se pudo subir ninguna fotografía. Intenta con imágenes JPG o PNG.');
            }
          }
          const created = await API.properties.create(body);
          return created.data !== undefined ? created.data : created;
        },
        // Al EDITAR: guarda la propiedad y después sube las fotos nuevas con el
        // endpoint dedicado, para que se registren aunque el archivo falle.
        update: async (id, body, record) => {
          delete body.photos_files;
          const files = readPendingPhotoFiles();
          const existing = Array.isArray(body.photos) ? body.photos.filter(Boolean) : [];
          if (!files.length && !existing.length) {
            throw new Error('La propiedad debe incluir al menos una fotografía.');
          }
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
      statusOptions: ['disponible', 'en_proceso', 'apartada', 'vendida', 'rentada', 'inactiva'],
      filters: [
        { key: 'operationType', label: 'Operación', placeholder: 'Todas las operaciones', options: ['venta', 'renta'] },
        { key: 'type', label: 'Tipo', placeholder: 'Todos los tipos', options: ['casa', 'departamento', 'local', 'bodega', 'rancho', 'terreno', 'playa', 'otro'] },
        { key: 'minPrice', label: 'Precio mínimo', type: 'number', placeholder: 'Precio mín.', width: 130 },
        { key: 'maxPrice', label: 'Precio máximo', type: 'number', placeholder: 'Precio máx.', width: 130 },
      ],
      columns: [
        { key: 'photos', label: 'Foto', render: (r) => {
            const src = (r.photos && r.photos.length) ? window.AppConfig.resolveUrl(r.photos[0]) : '';
            return src ? `<img src="${src.replace(/"/g, '&quot;')}" alt="" style="width:52px;height:40px;object-fit:cover;border-radius:6px;" loading="lazy">` : '<span class="text-muted">—</span>';
          } },
        { key: 'type', label: 'Tipo', render: (r) => UI.badge(typeLabel(r.type), 'info') },
        { key: 'operationType', label: 'Operación', render: (r) => UI.escapeHtml((r.operationType || '').toUpperCase()) },
        { key: 'address', label: 'Ubicación', render: (r) => `${UI.escapeHtml(r.zone || '')} ${UI.escapeHtml(r.city || '')}${r.state ? `, ${UI.escapeHtml(r.state)}` : ''}`.trim() || '—' },
        { key: 'price', label: 'Precio', render: (r) => Format.currency(r.price) },
        { key: 'ticketValue', label: 'Valor ticket', render: (r) => (r.ticketValue ? Format.currency(r.ticketValue) : '—') },
        { key: 'status', label: 'Estado', render: (r) => UI.statusBadge(r.status) },
        { key: 'isPublished', label: 'Publicación', render: (r) => (r.isPublished ? UI.badge('Publicada', 'success') : UI.badge('Sin publicar', 'muted')) },
      ],
      fields: [
        { name: 'type', label: 'Tipo de inmueble', type: 'select', required: true, options: ['casa', 'departamento', 'local', 'bodega', 'rancho', 'terreno', 'playa', 'otro'] },
        { name: 'operationType', label: 'Tipo de operación', type: 'select', required: true, options: ['venta', 'renta'] },
        { name: 'price', label: 'Precio', type: 'number' },
        { name: 'ticketValue', label: 'Valor ticket', type: 'number', hint: 'Costo equivalente de la operación para métricas' },
        { name: 'status', label: 'Estado', type: 'select', options: ['disponible', 'en_proceso', 'apartada', 'vendida', 'rentada', 'inactiva'] },
        { name: 'address', label: 'Dirección', type: 'text', full: true },
        { name: 'zone', label: 'Zona / colonia', type: 'text' },
        { name: 'city', label: 'Ciudad', type: 'text' },
        { name: 'state', label: 'Estado', type: 'text' },
        { name: 'owner', label: 'Propietario', type: 'select', options: [{ value: '', label: '— Sin propietario —' }, ...ownerOptions] },
        { name: 'responsibleUser', label: 'Asesor responsable', type: 'select', options: [{ value: '', label: '— Sin asesor —' }, ...userOptions] },
        { name: 'photos', label: 'Fotografías existentes (URLs separadas por coma)', type: 'text', full: true, value: (r) => (r && Array.isArray(r.photos) ? r.photos.join(', ') : '') },
        { name: 'photos_files', label: 'Subir fotografías desde el dispositivo', type: 'file', accept: 'image/jpeg,image/png,image/gif,image/webp,image/avif,image/heic,image/heif', multiple: true, full: true, hint: 'JPG, PNG, GIF, WebP, HEIC... (máx. 15 MB c/u). Se guardan en el servidor y quedan en la propiedad.' },
        { name: 'isPublished', label: 'Publicar en el catálogo (visible en la landing)', type: 'checkbox', full: true, hint: 'Si no está marcado, la propiedad queda oculta hasta publicarla.' },
        { name: 'description', label: 'Descripción', type: 'textarea', rows: 8, full: true, hint: 'Describe medidas, espacios, amenidades y estado. Mientras más detalle, mejor aparece en el catálogo y en las búsquedas.' },
      ].filter((f) => f.name !== 'isPublished' || isBossUser),
      formData(values) {
        const body = { ...values };
        const urlText = typeof values.photos === 'string' ? values.photos.trim() : '';
        body.photos = urlText ? urlText.split(',').map((p) => p.trim()).filter(Boolean) : [];
        return body;
      },
      extraActions(record) {
        const waHref = waLink(`Hola, me interesa la propiedad: ${record.type || ''} en ${record.zone || record.city || ''} (${(record.operationType || '').toUpperCase()}).`);
        let out = `<button class="btn btn-secondary btn-sm" data-extra data-detail="1" data-record="${record._id}" style="margin-left:6px;" title="Ver detalle completo">Detalle</button>`;
        if (record.photos && record.photos.length) {
          out += `<button class="btn btn-secondary btn-sm" data-extra data-show-photos="1" data-record="${record._id}" style="margin-left:6px;" title="Ver fotografías">&#128247;&nbsp; Fotos (${record.photos.length})</button>`;
        }
        const pub = record.isPublished
          ? (isBossUser ? `<button class="btn btn-secondary btn-sm" data-extra data-toggle-pub="1" data-record="${record._id}" style="margin-left:6px;" title="Quitar del inventario">Despublicar</button>` : '')
          : `<button class="btn btn-primary btn-sm" data-extra data-toggle-pub="1" data-record="${record._id}" style="margin-left:6px;" title="Agregar al inventario">Publicar</button>`;
        return out + pub +
          `<button class="btn btn-secondary btn-sm" data-extra data-property-history="1" data-record="${record._id}" style="margin-left:6px;">Historial</button>` +
          `<button class="btn btn-secondary btn-sm" data-extra data-price-market="1" data-record="${record._id}" style="margin-left:6px;">Precio y mercado</button>` +
          (waHref ? `<a class="btn btn-sm crm-btn-wa" style="margin-left:6px;" target="_blank" rel="noopener" href="${waHref}" title="Enviar WhatsApp">&#128172;&nbsp; WhatsApp</a>` : '');
      },
      onExtraAction(record, btn, ctx) {
        if (btn.dataset.detail) {
          openDetail(record);
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
            ctx.toast(record.isPublished ? 'Propiedad despublicada' : 'Propiedad publicada en inventario', 'success');
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
