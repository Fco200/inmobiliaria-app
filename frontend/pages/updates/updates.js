'use strict';

window.Pages = window.Pages || {};

// Módulo de Actualizaciones.
// Muestra la versión actual, busca si hay una nueva y lista las mejoras
// (changelog). El botón "Actualizar ahora" limpia la caché de la app y recarga.
window.Pages.actualizaciones = {
  title: 'Actualizaciones',

  async render(container) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Actualizaciones de la aplicación</h2>
          <p class="text-muted" style="margin:4px 0 0;">Mantén la aplicación al día. Aquí verás las mejoras de cada versión.</p>
        </div>
        <button class="btn btn-secondary" type="button" data-check>&#128269; Buscar actualizaciones</button>
      </div>
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
      const dateText = info.date || info.buildDate
        ? Format.dateTime(info.date || info.buildDate)
        : '—';

      const statusCard = hasUpdate
        ? `
          <div class="update-card is-new">
            <div class="update-card-head">
              <span class="update-emoji">&#11088;</span>
              <div style="flex:1;min-width:0;">
                <h3>Nueva versión disponible${info.version ? ` · ${UI.escapeHtml(info.version)}` : ''}</h3>
                <p class="text-muted" style="margin:2px 0 0;">Canal ${UI.escapeHtml(info.channel || 'estable')} · ${UI.escapeHtml(dateText)}</p>
              </div>
              ${UI.badge('Actualización', 'success')}
            </div>
            <ul class="update-notes">
              ${notes.length
                ? notes.map((n) => `<li>${UI.escapeHtml(n)}</li>`).join('')
                : '<li>Mejoras y correcciones de la aplicación.</li>'}
            </ul>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;">
              <button class="btn btn-primary" type="button" data-apply>&#11014;&#65039; Actualizar ahora</button>
              <button class="btn btn-secondary" type="button" data-later>Más tarde</button>
            </div>
          </div>`
        : `
          <div class="update-card is-current">
            <div class="update-card-head">
              <span class="update-emoji">&#9989;</span>
              <div style="flex:1;min-width:0;">
                <h3>Estás usando la última versión</h3>
                <p class="text-muted" style="margin:2px 0 0;">Versión ${UI.escapeHtml(info.version || '—')} · Canal ${UI.escapeHtml(info.channel || 'estable')}</p>
              </div>
              ${UI.badge('Al día', 'success')}
            </div>
          </div>`;

      body.innerHTML = `
        ${statusCard}
        <div class="grid grid-2" style="margin-top:16px;">
          <div class="card">
            <h3 style="margin-top:0;">Detalles de la versión</h3>
            <div class="update-meta">
              <div><span class="text-muted">Versión</span><strong>${UI.escapeHtml(info.version || '—')}</strong></div>
              <div><span class="text-muted">Compilación</span><strong>${UI.escapeHtml(info.buildDate ? Format.dateTime(info.buildDate) : '—')}</strong></div>
              <div><span class="text-muted">Canal</span><strong>${UI.escapeHtml(info.channel || 'estable')}</strong></div>
            </div>
          </div>
          <div class="card">
            <h3 style="margin-top:0;">Mejoras incluidas</h3>
            ${notes.length
              ? `<ul class="timeline update-timeline">${notes.slice(0, 12).map((n) => `<li><div style="font-size:13px;">${UI.escapeHtml(n)}</div></li>`).join('')}</ul>`
              : '<p class="text-muted" style="margin:0;">Esta versión no incluye notas. La app está actualizada.</p>'}
          </div>
        </div>
        ${info.commits && info.commits.length
          ? `<div class="card" style="margin-top:16px;">
               <h3 style="margin-top:0;">Últimos cambios publicados</h3>
               <div class="table-wrapper"><table class="table"><tbody>
                 ${info.commits.map((c) => `<tr><td>${UI.escapeHtml(c)}</td></tr>`).join('')}
               </tbody></table></div>
             </div>`
          : ''}
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
        checkBtn.textContent = 'Buscando...';
        try {
          if (window.AppVersion && window.AppVersion.check) {
            await window.AppVersion.check({ notify: true });
          } else if (window.API && window.API.config && window.API.config.version) {
            await window.API.config.version();
          }
        } catch (error) { /* noop */ }
        checkBtn.disabled = false;
        checkBtn.innerHTML = '&#128269; Buscar actualizaciones';
        await paint();
      });
    }

    await paint();
  },
};
