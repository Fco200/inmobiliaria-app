'use strict';

window.Pages = window.Pages || {};

// Módulo de Actualizaciones.
// Muestra la versión actual, busca si hay una nueva y lista las mejoras
// (changelog). El botón "Actualizar ahora" limpia la caché de la app y recarga.
window.Pages.actualizaciones = {
  title: 'Actualizaciones',

  async render(container) {
    container.innerHTML = `
      <section class="updates-hero">
        <div class="updates-hero-icon">&#128260;</div>
        <div class="updates-hero-info">
          <span class="updates-eyebrow">Centro de actualizaciones</span>
          <h2>Mantén tu CRM al día</h2>
          <p class="text-muted">Consulta las mejoras de cada versión y aplica las novedades en un clic, sin perder tu trabajo.</p>
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
      // Hay actualización si la versión publicada difiere de la ya vista en este
      // dispositivo. No depende de que AppVersion ya se haya cargado.
      const hasUpdate = Boolean(seen && info.hash && String(seen) !== String(info.hash));
      const notes = Array.isArray(info.notes) && info.notes.length
        ? info.notes
        : (Array.isArray(info.commits) ? info.commits : []);
      const versionText = UI.escapeHtml(info.version || '—');
      const channelText = UI.escapeHtml(info.channel || 'estable');
      const dateText = info.date || info.buildDate
        ? Format.dateTime(info.date || info.buildDate)
        : '—';
      const buildText = info.buildDate ? Format.dateTime(info.buildDate) : '—';

      const statusCard = hasUpdate
        ? `
          <div class="updates-status is-new">
            <div class="updates-status-icon">&#11088;</div>
            <div class="updates-status-body">
              <div class="updates-status-top">
                <h3>Nueva versión disponible</h3>
                <span class="updates-pill">v${versionText}</span>
              </div>
              <p class="text-muted updates-status-sub">Canal ${channelText} · Publicada el ${UI.escapeHtml(dateText)}</p>
              <ul class="update-notes">
                ${notes.length
                  ? notes.map((n) => `<li>${UI.escapeHtml(n)}</li>`).join('')
                  : '<li>Mejoras y correcciones de la aplicación.</li>'}
              </ul>
              <div class="updates-actions">
                <button class="btn btn-primary" type="button" data-apply>&#11014;&#65039; Actualizar ahora</button>
                <button class="btn btn-secondary" type="button" data-later>Más tarde</button>
              </div>
            </div>
            <span class="updates-flag is-new">Actualización</span>
          </div>`
        : `
          <div class="updates-status is-current">
            <div class="updates-status-icon">&#9989;</div>
            <div class="updates-status-body">
              <div class="updates-status-top">
                <h3>Estás usando la última versión</h3>
                <span class="updates-pill is-ok">v${versionText}</span>
              </div>
              <p class="text-muted updates-status-sub">Canal ${channelText} · Todo actualizado y funcionando.</p>
            </div>
            <span class="updates-flag is-current">Al día</span>
          </div>`;

      const stats = [
        { ico: '&#127991;&#65039;', label: 'Versión', value: versionText },
        { ico: '&#128225;', label: 'Canal', value: channelText },
        { ico: '&#128295;', label: 'Compilación', value: UI.escapeHtml(buildText) },
        { ico: '&#128197;', label: 'Publicada', value: UI.escapeHtml(dateText) },
      ];

      body.innerHTML = `
        ${statusCard}
        <div class="updates-stats">
          ${stats.map((s) => `
            <div class="updates-stat">
              <span class="updates-stat-ico">${s.ico}</span>
              <span class="updates-stat-label">${s.label}</span>
              <strong class="updates-stat-value">${s.value}</strong>
            </div>`).join('')}
        </div>
        <div class="updates-panel">
          <div class="updates-panel-head">
            <h3>Novedades de esta versión</h3>
            ${notes.length ? UI.badge(`${notes.length} cambio${notes.length === 1 ? '' : 's'}`, 'success') : ''}
          </div>
          ${notes.length
            ? `<ol class="updates-changelog" style="list-style-type:disc;padding-left:20px;">
                 ${notes.slice(0, 20).map((n, i) => `
                   <li>
                     <span class="updates-changelog-num">${i + 1}</span>
                     <span class="updates-changelog-text">${UI.escapeHtml(n)}</span>
                   </li>`).join('')}
               </ol>`
            : '<p class="text-muted" style="margin:0;">Esta versión no incluye notas. La app está actualizada.</p>'}
        </div>
        ${info.commits && info.commits.length
          ? `<div class="updates-panel" style="margin-top:16px;">
               <div class="updates-panel-head"><h3>&#128220; Últimos cambios publicados</h3></div>
               <ul class="updates-commits">
                 ${info.commits.map((c) => `<li>${UI.escapeHtml(c)}</li>`).join('')}
               </ul>
             </div>`
          : ''}
        <div class="updates-signature">
          <span class="updates-signature-ico">&#127968;</span>
          <span>A disposición del equipo de <strong>INMOBLES</strong></span>
        </div>
      `;

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
      const laterBtn = body.querySelector('[data-later]');
      if (laterBtn) {
        laterBtn.addEventListener('click', () => {
          UI.toast('Puedes actualizar más tarde desde este módulo.', 'info');
        });
      }
      if (window.AppVersion && window.AppVersion.markSeen && !hasUpdate) {
        // Sin novedades: el aviso ya no aplica.
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
