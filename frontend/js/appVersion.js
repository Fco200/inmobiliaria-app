'use strict';

// Sistema de actualizaciones de la aplicación.
//
// Cada vez que se publica un commit nuevo, el backend devuelve un hash de
// versión distinto en /api/config/version. Este módulo:
//   - consulta la versión al abrir la app y cada pocos minutos,
//   - si detecta que cambió, muestra una notificación (banner + punto en el
//     botón superior) que lleva al módulo "Actualizaciones",
//   - desde ese módulo el usuario ve las mejoras y aplica la actualización.
//
// Funciona para TODOS los roles: el botón y el módulo son visibles siempre.
window.AppVersion = (() => {
  const SEEN_KEY = 'crm_app_version_seen';
  const LATEST_KEY = 'crm_app_version_latest';

  let latest = null;
  let initialized = false;
  let pollTimer = null;

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

  function showBanner() {
    if (!isUpdateAvailable()) return;
    if (document.getElementById('version-banner')) return;
    const host = document.getElementById('app-content') || document.querySelector('.main');
    if (!host) return;

    const banner = document.createElement('div');
    banner.id = 'version-banner';
    banner.className = 'version-banner';
    banner.innerHTML = `
      <span class="version-banner-icon">&#128260;</span>
      <div style="flex:1;min-width:0;">
        <strong>Nueva versión disponible${latest && latest.version ? ` (${UI.escapeHtml(latest.version)})` : ''}</strong>
        <div class="text-muted" style="font-size:12px;">Hay mejoras listas. Toca "Ver mejoras" para actualizar.</div>
      </div>
      <a class="btn btn-primary btn-sm" href="actualizaciones.html">Ver mejoras</a>
      <button class="icon-btn" type="button" data-close-version aria-label="Cerrar aviso">&times;</button>
    `;
    banner.querySelector('[data-close-version]').addEventListener('click', () => banner.remove());

    if (host.parentNode && host.parentNode.classList.contains('main')) {
      host.parentNode.insertBefore(banner, host);
    } else {
      host.insertBefore(banner, host.firstChild);
    }
  }

  // Notifica al usuario que hay una versión nueva. La usa este módulo y el
  // handler del Service Worker (SW_UPDATED).
  function notifyUpdate() {
    updateBadge();
    showBanner();
  }

  function markSeen() {
    if (latest && latest.hash) setSeen(latest.hash);
    removeBanner();
    updateBadge();
  }

  // Aplica la actualización: limpia la caché y el Service Worker viejos y
  // recarga para tomar los archivos nuevos. Es lo que dispara el botón
  // "Actualizar ahora" del módulo.
  async function applyUpdate() {
    if (latest && latest.hash) setSeen(latest.hash);
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
    window.location.reload();
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
        return data;
      }
      if (isUpdateAvailable()) {
        if (notify) notifyUpdate();
      } else {
        removeBanner();
        updateBadge();
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
