'use strict';

// Sistema de actualizaciones de la aplicación.
//
// Cada vez que se publica un commit nuevo, el backend devuelve un hash de
// versión distinto en /api/config/version. Este módulo:
//   - consulta la versión al abrir la app y cada pocos minutos,
//   - si detecta que cambió, muestra SOLO un aviso NO modal: banner persistente
//     "Actualiza tu app para tener la última versión", un toast breve y el
//     punto del botón de Actualizaciones. Nunca se levanta una ventana,
//   - el botón "Actualizar ahora" aplica la actualización, y al cargar la
//     versión nueva se abre UNA VEZ un modal con las novedades de esa versión.
//
// Funciona para TODOS los roles: el botón y el módulo son visibles siempre.
window.AppVersion = (() => {
  const SEEN_KEY = 'crm_app_version_seen';
  const LATEST_KEY = 'crm_app_version_latest';
  // Se escribe justo antes de recargar para saber que SÍ se aplicó la
  // actualización (no basta con que exista una versión nueva disponible).
  const UPDATED_KEY = 'crm_app_version_just_updated';
  const UPDATE_MODAL_ID = 'version-updated-overlay';
  const UPDATE_BLOCKING_OVERLAYS = '#welcome-overlay, #modal-overlay, #mtn-overlay, #idle-overlay, #ccarta-overlay, #whatsnew-overlay';

  let latest = null;
  let initialized = false;
  let pollTimer = null;
  let toastShown = false;

  function getSeen() {
    try { return localStorage.getItem(SEEN_KEY) || ''; } catch (e) { return ''; }
  }

  function setSeen(hash) {
    try { localStorage.setItem(SEEN_KEY, String(hash || '')); } catch (e) { /* noop */ }
  }

  function readCachedLatest() {
    try { return JSON.parse(localStorage.getItem(LATEST_KEY) || 'null'); } catch (e) { return null; }
  }

  function saveLatest(data) {
    try { localStorage.setItem(LATEST_KEY, JSON.stringify(data)); } catch (e) { /* noop */ }
  }

  function isUpdateAvailable() {
    if (!latest || !latest.hash) return false;
    const seen = getSeen();
    if (!seen) return false;
    return String(latest.hash) !== String(seen);
  }

  async function fetchLatest() {
    if (!window.API || !window.API.config || !window.API.config.version) return null;
    const data = await window.API.config.version();
    if (data && data.hash) {
      latest = data;
      saveLatest(data);
    }
    return latest;
  }

  function updateBadge() {
    const btn = document.getElementById('btn-update');
    if (!btn) return;
    let dot = btn.querySelector('.badge-dot');
    if (isUpdateAvailable()) {
      if (!dot) {
        dot = document.createElement('span');
        dot.className = 'badge-dot';
        dot.textContent = '1';
        btn.appendChild(dot);
      }
    } else if (dot) {
      dot.remove();
    }
  }

  function removeBanner() {
    const el = document.getElementById('version-banner');
    if (el) el.remove();
  }

  // Aviso NO modal: el banner superior y el punto del botón permanecen hasta
  // que el usuario aplique la actualización (o cierre el banner).
  function showBanner() {
    if (!isUpdateAvailable()) return;
    if (document.getElementById('version-banner')) return;
    const host = document.getElementById('app-content') || document.querySelector('.main');
    if (!host) return;

    const banner = document.createElement('div');
    banner.id = 'version-banner';
    banner.className = 'version-banner';
    banner.innerHTML = `
      <span class="version-banner-icon">&#128226;</span>
      <div style="flex:1;min-width:0;">
        <strong>Actualiza tu app para tener la última versión</strong>
      </div>
      <button class="btn btn-primary btn-sm" type="button" data-apply-version>Actualizar ahora</button>
      <button class="icon-btn" type="button" data-close-version aria-label="Cerrar aviso">&times;</button>
    `;
    banner.querySelector('[data-close-version]').addEventListener('click', () => banner.remove());
    const applyBtn = banner.querySelector('[data-apply-version]');
    if (applyBtn) applyBtn.addEventListener('click', () => applyUpdate());

    if (host.parentNode && host.parentNode.classList.contains('main')) {
      host.parentNode.insertBefore(banner, host);
    } else {
      host.insertBefore(banner, host.firstChild);
    }
  }

  // Aviso breve + banner persistente. En ningún caso se abre un modal aquí:
  // las novedades se muestran sólo DESPUÉS de aplicar la actualización.
  function notifyUpdate() {
    updateBadge();
    const alreadyVisible = Boolean(document.getElementById('version-banner'));
    showBanner();
    if (!alreadyVisible && !toastShown && window.UI && typeof window.UI.toast === 'function') {
      toastShown = true;
      window.UI.toast('Actualiza tu app para tener la última versión.', 'info');
    }
  }

  function markSeen() {
    if (latest && latest.hash) setSeen(latest.hash);
    removeBanner();
    toastShown = false;
    updateBadge();
  }

  function markJustUpdated(hash) {
    try { localStorage.setItem(UPDATED_KEY, String(hash || '1')); } catch (e) { /* noop */ }
  }

  function buildParticles(container) {
    if (!container) return;
    for (let i = 0; i < 22; i += 1) {
      const p = document.createElement('span');
      p.className = 'whatsnew-particle';
      const size = 3 + Math.random() * 7;
      p.style.left = `${Math.random() * 100}%`;
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      p.style.animationDuration = `${3.5 + Math.random() * 5}s`;
      p.style.animationDelay = `${Math.random() * 2.5}s`;
      container.appendChild(p);
    }
  }

  // Modal de novedades que se abre SOLAMENTE cuando ya se aplicó una
  // actualización. Reutiliza el diseño del aviso "Lo nuevo llegó" de base.css.
  function openUpdateSuccessModal() {
    if (document.getElementById(UPDATE_MODAL_ID)) return;
    const info = latest || readCachedLatest() || {};
    const versionText = info.version ? `v${info.version}` : '';
    const notes = Array.isArray(info.notes) && info.notes.length
      ? info.notes.slice(0, 8)
      : [
          'Avisos de actualización más claros, sin ventanas que interrumpan tu trabajo.',
          'Al actualizar verás un resumen con lo nuevo de la versión.',
          'Botón de Ayuda en la barra superior con acceso directo a soporte.',
          'Filtros avanzados de Clientes y exportación a CSV alineados.',
        ];

    const overlay = document.createElement('div');
    overlay.id = UPDATE_MODAL_ID;
    overlay.className = 'whatsnew-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'version-updated-title');
    overlay.innerHTML = `
      <div class="whatsnew-particles" aria-hidden="true"></div>
      <div class="whatsnew-card">
        <button class="whatsnew-close" type="button" aria-label="Cerrar novedades">&times;</button>
        <div class="whatsnew-badge">&#9989; Actualización completada</div>
        <div class="whatsnew-icon" aria-hidden="true">&#127881;</div>
        <h2 class="whatsnew-title" id="version-updated-title">¡Ya tienes la última versión!</h2>
        <p class="whatsnew-lead">${versionText ? `Estas son las novedades de la ${versionText}:` : 'Estas son las novedades de esta versión:'} tu app quedó al día.</p>
        <ul class="whatsnew-list" id="version-updated-list"></ul>
        <button class="btn btn-primary whatsnew-btn" type="button" id="version-updated-continue">Entendido &rarr;</button>
        <p class="whatsnew-footer">INMOBLES &times; FV DIGITAL</p>
      </div>
    `;

    const list = overlay.querySelector('#version-updated-list');
    notes.forEach((note) => {
      const item = document.createElement('li');
      item.className = 'whatsnew-item';
      const icon = document.createElement('span');
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '✨';
      const text = document.createElement('span');
      text.textContent = String(note);
      item.appendChild(icon);
      item.appendChild(text);
      if (list) list.appendChild(item);
    });

    document.body.appendChild(overlay);
    buildParticles(overlay.querySelector('.whatsnew-particles'));

    function onKeydown(e) {
      if (e.key === 'Escape' || e.key === 'Esc') close();
    }
    function close() {
      document.removeEventListener('keydown', onKeydown);
      overlay.classList.add('closing');
      setTimeout(() => { if (overlay.parentNode) overlay.parentNode.remove(); }, 450);
    }
    const closeBtn = overlay.querySelector('.whatsnew-close');
    const continueBtn = overlay.querySelector('#version-updated-continue');
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (continueBtn) continueBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKeydown);
    setTimeout(() => {
      overlay.classList.add('show');
      if (continueBtn && typeof continueBtn.focus === 'function') continueBtn.focus();
    }, 30);

    // El aviso se consume al mostrarlo: no se repetirá en la misma sesión.
    try { localStorage.removeItem(UPDATED_KEY); } catch (e) { /* noop */ }
  }

  // Si otro aviso (bienvenida, guía, mantenimiento) está en pantalla, se espera
  // un momento en vez de apilar ventanas. Si sigue ocupado, se deja la bandera
  // para la próxima carga.
  function maybeShowUpdateSuccess(attempt = 0) {
    let raw = null;
    try { raw = localStorage.getItem(UPDATED_KEY); } catch (e) { return; }
    if (!raw) return;
    if (document.getElementById(UPDATE_MODAL_ID)) return;
    if (document.querySelector(UPDATE_BLOCKING_OVERLAYS)) {
      if (attempt < 10) setTimeout(() => maybeShowUpdateSuccess(attempt + 1), 700);
      return;
    }
    openUpdateSuccessModal();
  }

  // Aplica la actualización: limpia la caché y el Service Worker viejos y
  // recarga para tomar los archivos nuevos. Es lo que dispara el botón
  // "Actualizar ahora" del módulo.
  async function applyUpdate() {
    const targetHash = latest && latest.hash ? latest.hash : '';
    markJustUpdated(targetHash);
    if (targetHash) setSeen(targetHash);

    // 1) Se muestra la pantalla de carga especial ("ACTUALIZANDO TU APP").
    //    El usuario permanece dentro de la app: no se navega a ningún lado.
    const holdMs = 6000;
    try {
      if (window.AppShell && typeof window.AppShell.showUpdateLoader === 'function') {
        window.AppShell.showUpdateLoader();
      }
    } catch (e) { /* noop */ }

    // 2) Se limpia la caché y el Service Worker viejos mientras se ve la
    //    animación, para que al recargar se tomen los archivos nuevos.
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } catch (e) { /* noop */ }
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((reg) => reg.unregister()));
      }
    } catch (e) { /* noop */ }

    // 3) Se mantiene la pantalla de carga ~6 s (sin salir de la app) y luego se
    //    recarga la MISMA página para cargar la versión nueva.
    setTimeout(() => {
      window.location.reload();
    }, holdMs);
  }

  async function check({ notify = true } = {}) {
    try {
      const data = await fetchLatest();
      if (!data) return null;
      // Primer uso en este dispositivo: se registra la versión actual sin
      // molestar al usuario. A partir de aquí, cualquier cambio avisa.
      if (!getSeen()) {
        setSeen(data.hash);
        updateBadge();
        setTimeout(() => maybeShowUpdateSuccess(), 1000);
        return data;
      }
      if (isUpdateAvailable()) {
        if (notify) notifyUpdate();
      } else {
        removeBanner();
        toastShown = false;
        updateBadge();
        setTimeout(() => maybeShowUpdateSuccess(), 1000);
      }
      return data;
    } catch (error) {
      return null;
    }
  }

  function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (document.hidden) return;
      check({ notify: true });
    }, 5 * 60 * 1000);
  }

  function init() {
    if (initialized) return;
    initialized = true;
    latest = readCachedLatest();
    updateBadge();
    check({ notify: true });
    startPolling();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check({ notify: true });
    });
    window.addEventListener('focus', () => check({ notify: true }));
  }

  return {
    init,
    check,
    notifyUpdate,
    markSeen,
    applyUpdate,
    isUpdateAvailable,
    getLatest: () => latest,
    updateBadge,
  };
})();
