'use strict';

window.Pages = window.Pages || {};

// Módulo de Actualizaciones.
// Avisa de forma no modal ("Actualiza tu app para tener la última versión") y
// aplica la actualización. El resumen de novedades se muestra en un modal
// posterior tras recargar con la versión nueva.
window.Pages.actualizaciones = {
  title: 'Actualizaciones',

  async render(container) {
    container.innerHTML = `
      <section class="updates-hero">
        <div class="updates-hero-icon">&#128274;</div>
        <div class="updates-hero-info">
          <span class="updates-eyebrow">Seguridad de la aplicación</span>
          <h2>Mantén tu CRM seguro</h2>
          <p class="text-muted">Actualiza la app para seguir usando el CRM de forma segura.</p>
        </div>
        <button class="btn btn-primary updates-hero-btn" type="button" data-check>&#128269; Buscar actualizaciones</button>
      </section>
      <div id="updates-body"><div class="loading">Consultando versión...</div></div>
    `;

    const body = container.querySelector('#updates-body');
    const checkBtn = container.querySelector('[data-check]');

    async function loadVersion() {
      if (window.AppVersion && window.AppVersion.getLatest && window.AppVersion.getLatest()) {
        return window.AppVersion.getLatest();
      }
      if (window.API && window.API.config && window.API.config.version) {
        return window.API.config.version();
      }
      return null;
    }

    async function paint() {
      body.innerHTML = '<div class="loading">Consultando versión...</div>';
      let info = null;
      try {
        info = await loadVersion();
      } catch (error) {
        info = null;
      }
      if (!info) {
        body.innerHTML = UI.errorAlert('No se pudo consultar la versión. Revisa tu conexión e intenta de nuevo.');
        return;
      }

      const seen = (function () {
        try { return localStorage.getItem('crm_app_version_seen') || ''; } catch (e) { return ''; }
      })();
      const hasUpdate = Boolean(seen && info.hash && String(seen) !== String(info.hash));
      const versionText = UI.escapeHtml(info.version || '—');

      body.innerHTML = `
        <div class="updates-status ${hasUpdate ? 'is-new' : 'is-current'}">
          <div class="updates-status-icon">${hasUpdate ? '&#128226;' : '&#9989;'}</div>
          <div class="updates-status-body">
            <div class="updates-status-top">
              <h3>${hasUpdate ? 'Actualiza tu app para tener la última versión' : 'Tu app está al día'}</h3>
              ${hasUpdate ? '' : `<span class="updates-pill is-ok">v${versionText}</span>`}
            </div>
            ${hasUpdate
              ? `<p class="text-muted updates-status-sub">Incluye las mejoras y correcciones más recientes. Al terminar verás las novedades.</p>
                 <div class="updates-actions">
                   <button class="btn btn-primary" type="button" data-apply>Actualizar ahora</button>
                 </div>`
              : '<p class="text-muted updates-status-sub">No hay actualizaciones pendientes.</p>'}
          </div>
          <span class="updates-flag ${hasUpdate ? 'is-new' : 'is-current'}">${hasUpdate ? 'Actualización' : 'Al día'}</span>
        </div>`;

      const applyBtn = body.querySelector('[data-apply]');
      if (applyBtn) {
        applyBtn.addEventListener('click', async () => {
          applyBtn.disabled = true;
          applyBtn.textContent = 'Actualizando...';
          UI.toast('Actualizando la aplicación...', 'info');
          if (window.AppVersion && window.AppVersion.applyUpdate) {
            await window.AppVersion.applyUpdate();
          } else {
            window.location.reload();
          }
        });
      }
      if (window.AppVersion && window.AppVersion.markSeen && !hasUpdate) {
        window.AppVersion.markSeen();
      }
    }

    if (checkBtn) {
      checkBtn.addEventListener('click', async () => {
        checkBtn.disabled = true;
        const original = checkBtn.innerHTML;
        checkBtn.textContent = 'Buscando...';
        try {
          if (window.AppVersion && window.AppVersion.check) {
            await window.AppVersion.check({ notify: true });
          } else if (window.API && window.API.config && window.API.config.version) {
            await window.API.config.version();
          }
        } catch (error) { /* noop */ }
        checkBtn.disabled = false;
        checkBtn.innerHTML = original;
        await paint();
      });
    }

    await paint();
  },
};
