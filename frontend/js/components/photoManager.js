'use strict';

// Editor visual de fotografías de una propiedad.
//
// Reemplaza el antiguo campo de texto con URLs: muestra miniaturas de las
// fotos actuales, permite quitar cada una, agregar archivos nuevos (con vista
// previa) y reordenarlas arrastrando (la primera es la portada). Se usa en
// Captar Propiedades y en el inventario general "Propiedades".
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

  function resolveSrc(src) {
    return window.AppConfig ? window.AppConfig.resolveUrl(src) : src;
  }

  // iOS sólo muestra "Guardar imagen" si navigator.share se llama dentro del
  // gesto del usuario. Por eso las fotos ya subidas se convierten a Blob ANTES
  // (al crear el editor) y aquí sólo se consume el resultado precargado.
  const urlBlobs = new Map();

  function blobFor(src) {
    const url = resolveSrc(src);
    if (!urlBlobs.has(url)) {
      const gallery = window.PhotoGallery;
      const pending = gallery && gallery.ensureBlob
        ? gallery.ensureBlob(url).catch(() => null)
        : Promise.resolve(null);
      urlBlobs.set(url, pending);
    }
    return urlBlobs.get(url);
  }

  function saveNameFromUrl(url, index) {
    const gallery = window.PhotoGallery;
    const raw = gallery && gallery.fileNameFrom ? gallery.fileNameFrom(url) : '';
    return /\.[a-z0-9]{2,5}$/i.test(raw) ? raw : `foto-propiedad-${index + 1}.jpg`;
  }

  function create(options = {}) {
    const state = {
      photos: (Array.isArray(options.photos) ? options.photos : []).filter(Boolean).slice(),
      files: [],
      removed: [],
    };
    const onChange = typeof options.onChange === 'function' ? options.onChange : () => {};

    // Precarga de las fotos existentes: cuando el usuario toque "Guardar en
    // galería" el Blob ya estará listo y la compartición conservará el gesto.
    state.photos.forEach((src) => { if (src) blobFor(src); });

    const root = document.createElement('div');
    root.className = 'photo-manager';

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT;
    input.multiple = true;
    input.style.display = 'none';

    // Entrada específica para la cámara del celular (capture="environment").
    const captureInput = document.createElement('input');
    captureInput.type = 'file';
    captureInput.accept = 'image/*';
    captureInput.setAttribute('capture', 'environment');
    captureInput.style.display = 'none';

    const grid = document.createElement('div');
    grid.className = 'pm-grid';

    const hint = document.createElement('div');
    hint.className = 'pm-hint text-muted';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn-secondary btn-sm';
    addBtn.innerHTML = '&#128247;&nbsp; Agregar fotos';

    const cameraBtn = document.createElement('button');
    cameraBtn.type = 'button';
    cameraBtn.className = 'btn btn-secondary btn-sm';
    cameraBtn.innerHTML = '&#128250;&nbsp; Tomar foto';

    let dragSrc = null;

    function resolve(src) {
      return resolveSrc(src);
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
          <button type="button" class="pm-save" data-save title="Guardar en la galería del celular">&#128190;</button>
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
          <button type="button" class="pm-save" data-save title="Guardar en la galería del celular">&#128190;</button>
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
        ? 'Arrastra para reordenar, ★ para hacer portada y 💾 para guardar cada foto en la galería del celular. Toca una foto para verla.'
        : 'Agrega fotos desde el celular: toma una con “Tomar foto” o elige varias con “Agregar fotos”.';
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

    // Envía la foto al menú compartir de iOS/Android (opción "Guardar imagen")
    // o, si el dispositivo no lo permite, la descarga como último recurso.
    async function savePhoto(kind, index) {
      const gallery = window.PhotoGallery;
      if (!gallery || typeof gallery.save !== 'function') {
        if (window.UI) window.UI.toast('La función de galería no está disponible en esta versión.', 'error');
        return;
      }
      try {
        let source;
        let filename;
        if (kind === 'file') {
          source = state.files[index];
          if (!source) return;
          filename = source.name || gallery.fileNameFrom(source);
        } else {
          const src = state.photos[index];
          if (!src) return;
          const url = resolveSrc(src);
          source = await blobFor(src);
          filename = saveNameFromUrl(url, index);
          if (!source) source = url; // fallback si falló la precarga
        }
        const result = await gallery.save(source, filename);
        if (typeof gallery.toastResult === 'function') gallery.toastResult(result);
        else if (window.UI) window.UI.toast('Foto guardada.', 'success');
      } catch (error) {
        if (window.UI) window.UI.toast((error && error.message) || 'No se pudo guardar la foto.', 'error');
      }
    }

    grid.addEventListener('click', (e) => {
      const saveBtn = e.target.closest('[data-save]');
      if (saveBtn) {
        e.stopPropagation();
        const tile = saveBtn.closest('.pm-tile');
        savePhoto(tile.dataset.kind, Number(tile.dataset.index));
        return;
      }
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
      if (!tile) { e.preventDefault(); return; }
      dragSrc = { kind: tile.dataset.kind, index: Number(tile.dataset.index) };
      tile.classList.add('pm-dragging');
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
    grid.addEventListener('dragover', (e) => {
      if (!dragSrc) return;
      e.preventDefault();
      const tile = e.target.closest('.pm-tile');
      if (tile && tile.dataset.kind === dragSrc.kind) tile.classList.add('pm-dragover');
    });
    grid.addEventListener('dragleave', (e) => {
      const tile = e.target.closest('.pm-tile');
      if (tile) tile.classList.remove('pm-dragover');
    });
    grid.addEventListener('drop', (e) => {
      if (!dragSrc) return;
      e.preventDefault();
      const tile = e.target.closest('.pm-tile');
      grid.querySelectorAll('.pm-dragover').forEach((t) => t.classList.remove('pm-dragover'));
      // Solo se reordena dentro del mismo grupo (existentes o nuevas); mover
      // una nueva sobre una existente no aplica y se ignora.
      if (!tile || tile.dataset.kind !== dragSrc.kind) { dragSrc = null; return; }
      const target = Number(tile.dataset.index);
      if (target !== dragSrc.index) {
        const list = dragSrc.kind === 'photo' ? state.photos : state.files;
        const [moved] = list.splice(dragSrc.index, 1);
        list.splice(target, 0, moved);
        render();
        onChange();
      }
      dragSrc = null;
    });
    grid.addEventListener('dragend', () => {
      dragSrc = null;
      grid.querySelectorAll('.pm-dragging, .pm-dragover').forEach((t) => t.classList.remove('pm-dragging', 'pm-dragover'));
    });

    function addFiles(files) {
      if (!files.length) return;
      state.files = state.files.concat(files);
      render();
      onChange();
    }

    addBtn.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      addFiles(Array.from(input.files || []));
      input.value = '';
    });
    cameraBtn.addEventListener('click', () => captureInput.click());
    captureInput.addEventListener('change', () => {
      addFiles(Array.from(captureInput.files || []));
      captureInput.value = '';
    });

    const actions = document.createElement('div');
    actions.className = 'pm-actions';
    actions.appendChild(addBtn);
    actions.appendChild(cameraBtn);
    actions.appendChild(input);
    actions.appendChild(captureInput);

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
