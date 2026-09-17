'use strict';

const UI = (() => {
  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function toast(message, type = 'info') {
    let holder = document.getElementById('toast-holder');
    if (!holder) {
      holder = document.createElement('div');
      holder.id = 'toast-holder';
      // Los toasts se anclan arriba a la derecha; en iOS la safe area del
      // notch/barra de estado debe sumarse para que no queden tapados.
      // env() vale 0 fuera de dispositivos con notch, así que no afecta al
      // resto de navegadores (equivalente a `top:16px` de antes).
      holder.style.cssText =
        'position:fixed;top:calc(16px + env(safe-area-inset-top));right:16px;z-index:1000;display:flex;flex-direction:column;gap:8px;';
      document.body.appendChild(holder);
    }
    const el = document.createElement('div');
    el.style.cssText =
      'padding:12px 16px;border-radius:8px;color:#fff;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.2);min-width:220px;max-width:360px;animation:toastSlideIn 0.3s ease-out;';
    const colors = { success: '#1f9d55', error: '#dc2626', warning: '#d97706', info: '#5B2D8E' };
    el.style.background = colors[type] || colors.info;
    el.textContent = message;
    holder.appendChild(el);
    setTimeout(() => {
      el.style.animation = 'toastSlideOut 0.3s ease-in forwards';
      setTimeout(() => el.remove(), 300);
    }, 3500);
  }

  function openModal({ title, body, footer, onMount, size }) {
    closeModal();
    const overlay = document.createElement('div');
    overlay.id = 'modal-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:999;display:flex;align-items:center;justify-content:center;padding:40px 16px;overflow:auto;' +
      '-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);animation:modalFadeIn 0.25s ease-out;';
    const dialog = document.createElement('div');
    dialog.style.cssText =
      `background:var(--white);border-radius:10px;width:100%;max-width:${size || 640}px;box-shadow:0 10px 40px rgba(0,0,0,0.25);` +
      'margin:auto;animation:modalScaleIn 0.3s cubic-bezier(0.16,1,0.3,1);';
    dialog.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border);">
        <h3 style="margin:0;font-size:16px;">${title}</h3>
        <button type="button" class="icon-btn" data-close>&times;</button>
      </div>
      <div style="padding:20px;" data-body>${body}</div>
      ${footer ? `<div style="padding:14px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:10px;">${footer}</div>` : ''}
    `;
    overlay.appendChild(dialog);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-close]')) closeModal();
    });
    document.body.appendChild(overlay);
    // Revela los campos "Otros (especificar)" de selects cuyo valor ya es
    // "Otro/__ui_otros__" al abrir el formulario (por ejemplo en modo edición).
    syncOtros(dialog);
    if (onMount) onMount(dialog.querySelector('[data-body]'));
    return {
      close: closeModal,
      bodyEl: dialog.querySelector('[data-body]'),
    };
  }

  function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.remove();
  }

  function confirm(message, { danger = true } = {}) {
    return new Promise((resolve) => {
      let resolved = false;
      const safeResolve = (val) => { if (!resolved) { resolved = true; resolve(val); } };
      const footer = `
        <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-ok>Aceptar</button>
      `;
      const modal = openModal({
        title: 'Confirmación',
        body: `<p style="margin:0;">${escapeHtml(message)}</p>`,
        footer,
      });
      const overlay = modal.bodyEl ? modal.bodyEl.closest('#modal-overlay') : null;
      if (overlay) {
        const cancelBtn = overlay.querySelector('[data-cancel]');
        if (cancelBtn) cancelBtn.addEventListener('click', () => {
          closeModal();
          safeResolve(false);
        });
        const okBtn = overlay.querySelector('[data-ok]');
        if (okBtn) okBtn.addEventListener('click', () => {
          closeModal();
          safeResolve(true);
        });
        const observer = new MutationObserver(() => {
          if (!document.getElementById('modal-overlay')) {
            observer.disconnect();
            safeResolve(false);
          }
        });
        observer.observe(document.body, { childList: true });
      } else {
        safeResolve(false);
      }
    });
  }

  const BADGE_COLORS = {
    success: 'badge-success',
    warning: 'badge-warning',
    danger: 'badge-danger',
    info: 'badge-info',
    primary: 'badge-primary',
    muted: 'badge-muted',
  };

  function badge(text, type = 'muted') {
    const cls = BADGE_COLORS[type] || 'badge-muted';
    return `<span class="badge ${cls}">${escapeHtml(text)}</span>`;
  }

  const STATUS_TYPES = {
    activo: 'success',
    disponible: 'success',
    concluido: 'success',
    vendida: 'success',
    cobrado: 'success',
    completada: 'success',
    realizada: 'success',
    validado: 'success',
    cumplida: 'success',
    publicado: 'success',
    pendiente: 'warning',
    en_proceso: 'info',
    confirmada: 'info',
    en_promesa: 'info',
    promesa: 'info',
    parcial: 'warning',
    prospecto: 'info',
    inactivo: 'muted',
    cancelado: 'danger',
    cancelada: 'danger',
    vencida: 'danger',
    rechazado: 'danger',
    no_asistio: 'danger',
    apartada: 'info',
    en_proceso2: 'info',
    perfilado: 'primary',
    captacion: 'primary',
    revision: 'primary',
    notarias: 'primary',
    entrega: 'success',
    contratado: 'info',
    en_captacion: 'info',
  };

  function statusBadge(value) {
    if (value == null || value === '') return badge('—', 'muted');
    const key = String(value).replace(/ /g, '_');
    const type = STATUS_TYPES[key] || 'info';
    const label = String(value).replace(/_/g, ' ');
    return badge(label.charAt(0).toUpperCase() + label.slice(1), type);
  }

  function pagination(meta, onPage) {
    if (!meta || meta.pages <= 1) return '';
    const total = meta.pages;
    const current = meta.page;

    // Ventana de hasta 9 páginas centrada en la actual + saltos a extremos.
    let start = Math.max(1, current - 4);
    const end = Math.min(total, start + 8);
    start = Math.max(1, end - 8);

    const btn = (page, label, active = false, title = '') =>
      `<button class="btn btn-secondary btn-sm" style="${active ? 'background:var(--primary);color:#fff;' : ''}margin-right:3px;" data-page="${page}" ${title ? `title="${title}"` : ''}>${label}</button>`;

    let buttons = '';
    if (current > 1) buttons += btn(current - 1, '&#8249;', false, 'Anterior');
    if (start > 1) buttons += btn(1, '1') + '<span style="align-self:center;">…</span>';
    for (let i = start; i <= end; i += 1) {
      buttons += btn(i, String(i), i === current);
    }
    if (end < total) buttons += '<span style="align-self:center;">…</span>' + btn(total, String(total));
    if (current < total) buttons += btn(current + 1, '&#8250;', false, 'Siguiente');

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;justify-content:center;margin-top:16px;gap:3px;flex-wrap:wrap;';
    wrap.innerHTML = buttons;
    wrap.querySelectorAll('[data-page]').forEach((el) => {
      el.addEventListener('click', () => onPage(Number(el.dataset.page)));
    });
    return wrap;
  }

  function errorAlert(message) {
    return `<div class="alert alert-error">${escapeHtml(message)}</div>`;
  }

  function field(name, label, options = {}) {
    const {
      type = 'text',
      required = false,
      options: selectOptions = [],
      value = '',
      placeholder = '',
      hint = '',
      full = false,
      accept = '',
      multiple = false,
    } = options;
    const req = required ? 'required' : '';
    const id = `fld-${name}`;
    let control = '';
    if (type === 'select') {
      const valStr = value && typeof value === 'object' && value._id ? String(value._id) : String(value == null ? '' : value);
      const opts = selectOptions
        .map((o) => {
          const optValue = typeof o === 'object' ? o.value : o;
          const optLabel = typeof o === 'object' ? o.label : o;
          const selected = valStr === String(optValue) ? 'selected' : '';
          return `<option value="${escapeHtml(optValue)}" ${selected}>${escapeHtml(optLabel)}</option>`;
        })
        .join('');
      // Soporte genérico "Otro/otros": agrega la opción "especificar" y un campo
      // de texto que aparece cuando se selecciona. Aplica a todos los selects.
      const otrosId = `otros-${id}`;
      control = `
        <select class="form-control" id="${id}" name="${name}" ${req} data-ui-otros>${opts}
          <option value="__ui_otros__">Otros (especificar)</option>
        </select>
        <input class="form-control" id="${otrosId}" name="__ui_otros_${name}" type="text" placeholder="Especifica..." style="display:none;margin-top:8px;">
      `;
    } else if (type === 'checkbox') {
      const checked = value ? 'checked' : '';
      control = `
        <label style="display:flex;align-items:center;gap:8px;font-weight:400;cursor:pointer;margin-top:8px;">
          <input type="checkbox" id="${id}" name="${name}" ${checked}> ${escapeHtml(label)}
        </label>
      `;
      return `<div style="${full ? 'grid-column:1/-1;' : ''}margin-bottom:16px;">${control}${hint ? `<small class="text-muted">${escapeHtml(hint)}</small>` : ''}</div>`;
    } else if (type === 'textarea') {
      control = `<textarea class="form-control" id="${id}" name="${name}" placeholder="${escapeHtml(placeholder)}" ${req}>${escapeHtml(value)}</textarea>`;
    } else if (type === 'file') {
      const attrs = [
        accept ? `accept="${escapeHtml(accept)}"` : '',
        multiple ? 'multiple' : '',
        req,
      ].filter(Boolean).join(' ');
      control = `<input class="form-control" id="${id}" name="${name}" type="file" placeholder="${escapeHtml(placeholder)}" ${attrs}>`;
    } else {
      control = `<input class="form-control" id="${id}" name="${name}" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${req}>`;
    }
    return `
      <div style="${full ? 'grid-column:1/-1;' : ''}margin-bottom:16px;">
        <label for="${id}" style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;">${escapeHtml(label)}${required ? ' *' : ''}</label>
        ${control}
        ${hint ? `<small class="text-muted">${escapeHtml(hint)}</small>` : ''}
      </div>
    `;
  }

  // Detecta si el valor de un <select> representa la opción "Otros": el valor
  // genérico "Otro" de UI.field (__ui_otros__) o un valor nativo "otro/otros".
  function isOtherValue(value) {
    return value === '__ui_otros__' || /^otr/i.test(String(value == null ? '' : value));
  }

  // Obtiene el input "especificar" de un select. Si `create` es true y no
  // existe, lo crea justo después del select siguiendo la convención de
  // UI.field (id `otros-<selectId>` y name `__ui_otros_<selectName>`). De este
  // modo también funciona en selects escritos a mano sin data-ui-otros.
  function otrosInput(select, create) {
    if (!select) return null;
    if (!select.id) {
      if (!create) return null;
      otrosInput.seq = (otrosInput.seq || 0) + 1;
      select.id = `ui-select-${otrosInput.seq}`;
    }
    let input = document.getElementById(`otros-${select.id}`);
    if (input || !create) return input;
    input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control';
    input.id = `otros-${select.id}`;
    input.placeholder = 'Especifica...';
    input.style.cssText = 'display:none;margin-top:8px;';
    if (select.name) input.name = `__ui_otros_${select.name}`;
    select.insertAdjacentElement('afterend', input);
    return input;
  }

  // Muestra/oculta el campo de texto "especificar" cuando un select tiene el
  // valor genérico "Otros" (__ui_otros__) o un valor nativo "otro/otros/otra".
  function toggleOtros(select) {
    if (!select) return;
    const isOther = isOtherValue(select.value);
    // Solo se auto-crea el input dentro de un formulario modal (no en los
    // selects de filtros/barras de herramientas, que no son formularios).
    const canCreate = isOther && !!(select.closest && select.closest('#modal-overlay'));
    const input = otrosInput(select, canCreate);
    if (!input) return;
    input.style.display = isOther ? 'block' : 'none';
    if (!isOther) input.value = '';
  }

  // Aplica el estado "especificar" a TODOS los selects de `root` (por defecto
  // el documento), ya provengan de UI.field o estén escritos a mano. Útil al
  // abrir un formulario con un select que ya viene en "Otro" (modo edición).
  function syncOtros(root) {
    const scope = root || document;
    scope.querySelectorAll('select').forEach((select) => toggleOtros(select));
  }

  // Devuelve el texto escrito en la casilla "especificar" de un select, o ''
  // si el select no está en "Otros". Para consumidores que leen el valor
  // directamente (formularios con selects escritos a mano).
  function otrosText(select) {
    if (!select || !isOtherValue(select.value)) return '';
    const input = otrosInput(select, false);
    return input ? String(input.value || '').trim() : '';
  }

  function collectForm(form) {
    const others = {};
    const data = {};
    new FormData(form).forEach((value, key) => {
      if (key.indexOf('__ui_otros_') === 0) {
        others[key.slice('__ui_otros_'.length)] = value;
        return;
      }
      const input = form.querySelector(`[name="${key}"]`);
      if (!input) return;
      if (input.type === 'file') return;
      if (input.type === 'number') {
        data[key] = value === '' ? null : Number(value);
      } else if (input.type === 'checkbox') {
        data[key] = input.checked;
      } else if (value === '') {
        data[key] = null;
      } else {
        data[key] = value;
      }
    });
    // Si el usuario eligió "Otros" y escribió algo, se usa ese texto como valor.
    // Si eligió el genérico "Otros (especificar)" pero no escribió nada, se
    // evita enviar el valor centinela __ui_otros__ al servidor.
    Object.keys(others).forEach((name) => {
      const select = form.querySelector(`select[name="${name}"]`);
      if (!select || !isOtherValue(select.value)) return;
      const text = String(others[name] || '').trim();
      if (text) {
        data[name] = text;
      } else if (select.value === '__ui_otros__') {
        data[name] = null;
      }
    });
    return data;
  }

  function progressBar(percent) {
    const safe = Math.max(0, Math.min(100, Number(percent) || 0));
    return `
      <div class="progress"><div class="progress-bar" style="width:${safe}%;"></div></div>
      <small class="text-muted">${safe.toFixed(1)}%</small>
    `;
  }

  function showImages(images, title = 'Galería de imágenes') {
    const photos = (images || []).filter(Boolean);
    if (!photos.length) {
      toast('No hay imágenes para mostrar.', 'info');
      return;
    }
    openModal({
      title,
      body: `
        <div class="lightbox-grid">
          ${photos
            .map((p) => `<img class="lightbox-img" src="${window.AppConfig.resolveUrl(p)}" alt="" loading="lazy">`)
            .join('')}
        </div>
      `,
      size: 920,
    });
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;
    overlay.querySelectorAll('.lightbox-img').forEach((img) => {
      img.addEventListener('click', () => window.open(img.getAttribute('src'), '_blank', 'noopener'));
    });
  }

  async function showActivityHistory(entityType, entityId, title = 'Centro de actividad') {
    openModal({ title, body: '<div class="loading">Cargando historial...</div>' });
    try {
      const result = await window.API.activity.list({ entityType, entityId, limit: 50 });
      const items = result.data || [];
      const body = document.querySelector('#modal-overlay [data-body]');
      if (!body) return;
      if (!items.length) {
        body.innerHTML = '<p class="text-muted">Sin actividad registrada.</p>';
        return;
      }
      body.innerHTML = `
        <ul class="timeline">
          ${items.map((a) => `
            <li>
              <strong>${escapeHtml(String(a.action || '').replace(/_/g, ' '))}</strong>
              <div class="text-muted" style="font-size:12px;">${Format.dateTime(a.createdAt)} · ${a.user ? escapeHtml(a.user.name) : ''}</div>
              <div style="font-size:13px;">${escapeHtml(a.message || '')}</div>
            </li>`).join('')}
        </ul>
      `;
    } catch (error) {
      const body = document.querySelector('#modal-overlay [data-body]');
      if (body) body.innerHTML = errorAlert(error.message);
    }
  }

  // Delegación global (debe registrarse ANTES del return para ejecutarse):
  // muestra/oculta el campo "especificar" de CUALQUIER select —tenga o no
  // data-ui-otros— sin depender de atributos onchange inline.
  document.addEventListener('change', (event) => {
    const target = event.target;
    if (target && target.tagName === 'SELECT') toggleOtros(target);
  });

  return {
    escapeHtml,
    toast,
    openModal,
    closeModal,
    confirm,
    badge,
    statusBadge,
    pagination,
    errorAlert,
    field,
    collectForm,
    toggleOtros,
    syncOtros,
    otrosText,
    progressBar,
    showImages,
    showActivityHistory,
  };
})();

// Expone el objeto UI en window también para manejadores legacy y código que
// lee window.UI (public-common, etc.).
window.UI = UI;
