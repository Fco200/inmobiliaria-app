'use strict';

window.Pages = window.Pages || {};

window.Pages.properties = {
  title: 'Propiedades',

  async render(container) {
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
    const uploadPhotos = async (body) => {
      const files = readPendingPhotoFiles();
      if (!files.length) return;
      UI.toast(`Subiendo ${files.length} ${files.length === 1 ? 'fotografía' : 'fotografías'}...`, 'info');
      const urls = [];
      for (const file of files) {
        const res = await API.documents.upload(file);
        urls.push(res.fileUrl);
      }
      body.photos = [...(body.photos || []), ...urls];
    };

    crudPage(container, {
      title: 'Propiedades',
      newLabel: 'Nueva propiedad',
      service: {
        list: (params) => API.properties.list(params),
        create: async (body) => { await uploadPhotos(body); return API.properties.create(body); },
        update: async (id, body) => { await uploadPhotos(body); return API.properties.update(id, body); },
        remove: (id) => API.properties.remove(id),
      },
      statusOptions: ['disponible', 'en_proceso', 'apartada', 'vendida', 'rentada', 'inactiva'],
      columns: [
        { key: 'type', label: 'Tipo', render: (r) => UI.badge(typeLabel(r.type), 'info') },
        { key: 'operationType', label: 'Operación', render: (r) => UI.escapeHtml((r.operationType || '').toUpperCase()) },
        { key: 'address', label: 'Ubicación', render: (r) => `${UI.escapeHtml(r.zone || '')} ${UI.escapeHtml(r.city || '')}${r.state ? `, ${UI.escapeHtml(r.state)}` : ''}`.trim() || '—' },
        { key: 'price', label: 'Precio', render: (r) => Format.currency(r.price) },
        { key: 'ticketValue', label: 'Valor ticket', render: (r) => (r.ticketValue ? Format.currency(r.ticketValue) : '—') },
        { key: 'status', label: 'Estado', render: (r) => UI.statusBadge(r.status) },
        { key: 'isPublished', label: 'Inventario', render: (r) => (r.isPublished ? UI.badge('Publicada', 'success') : UI.badge('Sin publicar', 'muted')) },
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
        { name: 'description', label: 'Descripción', type: 'textarea', full: true },
      ],
      formData(values) {
        const body = { ...values };
        const urlText = typeof values.photos === 'string' ? values.photos.trim() : '';
        body.photos = urlText ? urlText.split(',').map((p) => p.trim()).filter(Boolean) : [];
        return body;
      },
      extraActions(record) {
        let out = '';
        if (record.photos && record.photos.length) {
          out += `<button class="btn btn-secondary btn-sm" data-extra data-show-photos data-record="${record._id}" style="margin-left:6px;" title="Ver fotografías">&#128247;&nbsp; Fotos (${record.photos.length})</button>`;
        }
        const pub = record.isPublished
          ? `<button class="btn btn-secondary btn-sm" data-extra data-toggle-pub style="margin-left:6px;" title="Quitar del inventario">Despublicar</button>`
          : `<button class="btn btn-primary btn-sm" data-extra data-toggle-pub style="margin-left:6px;" title="Agregar al inventario">Publicar</button>`;
        return out + pub + `<button class="btn btn-secondary btn-sm" data-extra data-property-history data-record="${record._id}" style="margin-left:6px;">Historial</button><button class="btn btn-secondary btn-sm" data-extra data-price-market data-record="${record._id}" style="margin-left:6px;">Precio y mercado</button>`;
      },
      onExtraAction(record, btn, ctx) {
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
      onEdit: true,
      onRemove: true,
    });
  },
};
