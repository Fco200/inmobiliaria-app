'use strict';

// Página pública de EQUIPO (equipo.html): directorio de asesores con foto,
// WhatsApp, correo y enlace a su perfil público (asesor.html?id=).
window.EquipoPage = (() => {
  const PS = window.PublicSite;

  function asesorCard(a) {
    const photo = a.photo
      ? `<img src="${window.AppConfig.resolveUrl(a.photo)}" alt="${UI.escapeHtml(a.name)}" class="team-photo" loading="lazy">`
      : `<span class="team-photo team-photo-fallback">${UI.escapeHtml(String(a.name || 'A').charAt(0).toUpperCase())}</span>`;
    const wa = a.phone
      ? `<a class="btn btn-wa btn-sm" href="${PS.whatsappLink(`Hola ${a.name}, te contacté desde la página de INMOBLES.`, a.phone)}" target="_blank" rel="noopener">&#128172; WhatsApp</a>`
      : '';
    const mail = a.email
      ? `<a class="btn btn-secondary btn-sm" href="mailto:${UI.escapeHtml(a.email)}">&#128231; Correo</a>`
      : '';
    return `
      <article class="card team-card">
        <div class="team-avatar">${photo}</div>
        <h3 style="margin:12px 0 2px;">${UI.escapeHtml(a.name)}</h3>
        <p class="text-muted" style="margin:0 0 8px;font-size:13px;">${UI.escapeHtml(a.position || 'Asesor inmobiliario')}</p>
        ${a.bio ? `<p class="text-muted team-bio">${UI.escapeHtml(a.bio)}</p>` : ''}
        <p class="text-muted" style="font-size:13px;margin:0 0 12px;">
          ${(a.propertyCount || 0) > 0 ? `${'&#127968;&#65039;'} ${a.propertyCount} ${a.propertyCount === 1 ? 'propiedad' : 'propiedades'} publicadas` : 'Sin propiedades publicadas'}
        </p>
        <div class="landing-card-actions">
          <a class="btn btn-primary btn-sm" href="asesor.html?id=${encodeURIComponent(String(a.id))}">Ver su perfil</a>
          ${wa}
          ${mail}
        </div>
      </article>
    `;
  }

  function banner() {
    const el = document.getElementById('asesor-banner');
    const asesorId = new URLSearchParams(window.location.search).get('asesorId');
    if (!el || !asesorId) {
      if (el) el.hidden = true;
      return;
    }
    window.API.public
      .asesor(asesorId)
      .then((a) => {
        if (!a || !a.name) {
          el.hidden = true;
          return;
        }
        el.hidden = false;
        const photo = a.photo
          ? `<img class="asesor-banner-photo" src="${window.AppConfig.resolveUrl(a.photo)}" alt="">`
          : `<span class="asesor-banner-photo asesor-banner-fallback">${UI.escapeHtml(String(a.name || 'A').charAt(0).toUpperCase())}</span>`;
        const wa = a.phone
          ? `<a class="btn btn-wa btn-sm" href="${PS.whatsappLink(`Hola ${a.name}, te contacté desde la página de INMOBLES.`, a.phone)}" target="_blank" rel="noopener">WhatsApp</a>`
          : '';
        el.innerHTML = `
          <div class="asesor-banner-card card">
            ${photo}
            <div class="asesor-banner-info">
              <small class="text-muted">Asesor destacado</small>
              <h3 style="margin:2px 0 4px;">${UI.escapeHtml(a.name)}</h3>
              <p class="text-muted" style="margin:0 0 8px;font-size:13px;">${UI.escapeHtml(a.position || 'Asesor inmobiliario')}${a.propertyCount != null ? ` · ${a.propertyCount} ${a.propertyCount === 1 ? 'propiedad' : 'propiedades'}` : ''}</p>
              <div class="landing-card-actions">
                <a class="btn btn-primary btn-sm" href="propiedades.html?asesorId=${encodeURIComponent(String(a.id))}">Ver sus propiedades</a>
                ${wa}
                <a class="btn btn-secondary btn-sm" href="asesor.html?id=${encodeURIComponent(String(a.id))}">Ver su perfil</a>
              </div>
            </div>
          </div>
        `;
      })
      .catch(() => {
        if (el) el.hidden = true;
      });
  }

  async function loadAsesores() {
    const el = document.getElementById('equipo-grid');
    if (!el) return;
    el.innerHTML = '<div class="loading">Cargando equipo...</div>';
    try {
      const result = await window.API.public.asesores();
      const list = result.data || [];
      const count = document.getElementById('equipo-count');
      if (count) count.textContent = list.length ? `${list.length} ${list.length === 1 ? 'profesional' : 'profesionales'}` : '';
      if (!list.length) {
        el.innerHTML = '<p class="text-muted landing-empty">El directorio de asesores estará disponible próximamente.</p>';
        return;
      }
      el.innerHTML = list.map(asesorCard).join('');
    } catch (error) {
      el.innerHTML = UI.errorAlert(error.message);
    }
  }

  async function init() {
    await PS.initCommon();
    banner();
    await loadAsesores();
    PS.initNewsletter();
    PS.initAssistant();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => window.EquipoPage.init());