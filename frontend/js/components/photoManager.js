'use strict';

// Editor visual de fotografías de una propiedad.
//
// Reemplaza el antiguo campo de texto con URLs: muestra miniaturas de las
// fotos actuales, permite quitar cada una, agregar archivos nuevos (con vista
// previa) y reordenarlas arrastrando (la primera es la portada). Se usa en
// Propiedades, Mis Propiedades e Inventario General.
//
// Uso:
//   const pm = PhotoManager.create({ photos: record.photos });
//   contenedor.appendChild(pm.el);
//   pm.getPhotos(); // URLs existentes (ya sin las eliminadas)
//   pm.getFiles();  // File[] nuevos pendientes de subir
window.PhotoManager = (() => {
  const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,image/avif,image/heic,image/heif';
  const fileUrls = new WeakMap();

  function urlFor(file) {
    if (!fileUrls.has(file)) {
      try { fileUrls.set(file, URL.createObjectURL(file)); } catch (e) { fileUrls.set(file, ''); }
    }
    return fileUrls.get(file);
  }

  function create(options = {}) {
    const state = {
      photos: (Array.isArray(options.photos) ? options.photos : []).filter(Boolean).slice(),
      files: [],
      removed: [],
    };
    const onChange = typeof options.onChange === 'function' ? options.onChange : () => {};

    const root = document.createElement('div');
    root.className = 'photo-manager';

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT;
    input.multiple = true;
    input.style.display = 'none';

    const grid = document.createElement('div');
    grid.className = 'pm-grid';

    const hint = document.createElement('div');
    hint.className = 'pm-hint text-muted';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn-secondary btn-sm';
    addBtn.innerHTML = '&#128247;&nbsp; Agregar fotos';

    let dragSrc = null;

    function resolve(src) {
      return window.AppConfig ? window.AppConfig.resolveUrl(src) : src;
    }

    function allSources() {
      const list = state.photos.map(resolve);
      state.files.forEach((f) => { const u = urlFor(f); if (u) list.push(u); });
      return list;
    }

    function render() {
      grid.innerHTML = '';
      const coverIndex = 0;
      let tileIndex = 0;

      state.photos.forEach((src, i) => {
        const tile = document.createElement('div');
        tile.className = 'pm-tile';
        tile.draggable = true;
        tile.dataset.kind = 'photo';
        tile.dataset.index = String(i);
        tile.innerHTML = `
          <img src="${String(resolve(src)).replace(/"/g, '&quot;')}" alt="" loading="lazy">
          ${tileIndex === coverIndex ? '<span class="pm-cover">Portada</span>' : ''}
          ${tileIndex === coverIndex ? '' : '<button type="button" class="pm-cover-btn" data-cover title="Hacer portada">&#9733;</button>'}
          <button type="button" class="pm-x" data-remove title="Quitar foto">&times;</button>
        `;
        grid.appendChild(tile);
        tileIndex += 1;
      });

      state.files.forEach((file, j) => {
        const tile = document.createElement('div');
        tile.className = 'pm-tile pm-tile-new';
        tile.dataset.kind = 'file';
        tile.dataset.index = String(j);
        const u = urlFor(file);
        tile.innerHTML = `
          ${u ? `<img src="${u}" alt="" loading="lazy">` : '<div class="pm-noimg">&#128247;</div>'}
          <span class="pm-new-badge">Nueva</span>
          ${tileIndex === coverIndex ? '<span class="pm-cover">Portada</span>' : ''}
          ${tileIndex === coverIndex || state.photos.length ? '' : '<button type="button" class="pm-cover-btn" data-cover title="Hacer portada">&#9733;</button>'}
          <button type="button" class="pm-x" data-remove title="Quitar foto">&times;</button>
        `;
        grid.appendChild(tile);
        tileIndex += 1;
      });

      if (!tileIndex) {
        grid.innerHTML = '<div class="pm-empty">Sin fotografías. Agrega al menos una.</div>';
      }

      hint.textContent = tileIndex
        ? 'Arrastra para reordenar, o toca ★ para hacer portada. La primera foto es la portada. Toca una foto para verla.'
        : 'Agrega las fotos de la propiedad (JPG, PNG, GIF, WebP…).';
    }

    // Mueve la foto elegida al inicio: la primera posición define la portada
    // (tanto en el CRM como en el PDF que se comparte por WhatsApp).
    function makeCover(kind, index) {
      if (kind === 'photo') {
        if (index <= 0) return;
        const [moved] = state.photos.splice(index, 1);
        state.photos.unshift(moved);
      } else {
        const [moved] = state.files.splice(index, 1);
        state.files.unshift(moved);
      }
      render();
      onChange();
    }

    grid.addEventListener('click', (e) => {
      const coverBtn = e.target.closest('[data-cover]');
      if (coverBtn) {
        e.stopPropagation();
        const tile = coverBtn.closest('.pm-tile');
        makeCover(tile.dataset.kind, Number(tile.dataset.index));
        return;
      }
      const removeBtn = e.target.closest('[data-remove]');
      if (removeBtn) {
        e.stopPropagation();
        const tile = removeBtn.closest('.pm-tile');
        const kind = tile.dataset.kind;
        const index = Number(tile.dataset.index);
        if (kind === 'photo') {
          const [gone] = state.photos.splice(index, 1);
          if (gone) state.removed.push(gone);
        } else {
          state.files.splice(index, 1);
        }
        render();
        onChange();
        return;
      }
      if (e.target.closest('img') && window.UI && window.UI.showImages) {
        window.UI.showImages(allSources(), 'Fotografías');
      }
    });

    grid.addEventListener('dragstart', (e) => {
      const tile = e.target.closest('.pm-tile');
      if (!tile || tile.dataset.kind !== 'photo') { e.preventDefault(); return; }
      dragSrc = Number(tile.dataset.index);
      tile.classList.add('pm-dragging');
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
    grid.addEventListener('dragover', (e) => {
      if (dragSrc == null) return;
      e.preventDefault();
      const tile = e.target.closest('.pm-tile');
      if (tile && tile.dataset.kind === 'photo') tile.classList.add('pm-dragover');
    });
    grid.addEventListener('dragleave', (e) => {
      const tile = e.target.closest('.pm-tile');
      if (tile) tile.classList.remove('pm-dragover');
    });
    grid.addEventListener('drop', (e) => {
      if (dragSrc == null) return;
      e.preventDefault();
      const tile = e.target.closest('.pm-tile');
      grid.querySelectorAll('.pm-dragover').forEach((t) => t.classList.remove('pm-dragover'));
      if (!tile || tile.dataset.kind !== 'photo') { dragSrc = null; return; }
      const target = Number(tile.dataset.index);
      if (target !== dragSrc) {
        const [moved] = state.photos.splice(dragSrc, 1);
        state.photos.splice(target, 0, moved);
        render();
        onChange();
      }
      dragSrc = null;
    });
    grid.addEventListener('dragend', () => {
      dragSrc = null;
      grid.querySelectorAll('.pm-dragging, .pm-dragover').forEach((t) => t.classList.remove('pm-dragging', 'pm-dragover'));
    });

    addBtn.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      if (files.length) {
        state.files = state.files.concat(files);
        render();
        onChange();
      }
      input.value = '';
    });

    const actions = document.createElement('div');
    actions.className = 'pm-actions';
    actions.appendChild(addBtn);
    actions.appendChild(input);

    root.appendChild(grid);
    root.appendChild(actions);
    root.appendChild(hint);

    render();

    return {
      el: root,
      getPhotos: () => state.photos.slice(),
      getFiles: () => state.files.slice(),
      getRemoved: () => state.removed.slice(),
      isEmpty: () => state.photos.length === 0 && state.files.length === 0,
      filesCount: () => state.files.length,
    };
  }

  return { create };
})();
