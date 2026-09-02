'use strict';

// Página pública de INICIO (landing.html): hero con buscador que redirige al
// catálogo (propiedades.html), destacadas, resumen de servicios y equipo.
window.LandingPage = (() => {
  const PS = window.PublicSite;

  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function imgHtml(p) {
    const cover = p.cover || (p.photos && p.photos.length ? p.photos[0] : null);
    const link = PS.propertyLink(p.id);
    if (!cover) {
      return `<a href="${link}" class="landing-card-img-link landing-card-img-placeholder">&#127968;</a>`;
    }
    const src = window.AppConfig.resolveUrl(cover);
    return `<a href="${link}"><div class="landing-card-img"><img src="${src}" alt="${UI.escapeHtml(p.title)}" loading="lazy"></div></a>`;
  }

  function featuredCard(p) {
    const link = PS.propertyLink(p.id);
    const wa = p.phone
      ? `<a class="btn btn-wa btn-sm" href="${PS.whatsappLink(`Hola, me interesa la propiedad: ${p.title} (${p.place || ''})`, p.phone)}" target="_blank" rel="noopener">&#128172; WhatsApp</a>`
      : '';
    return `
      <article class="card landing-card">
        ${imgHtml(p)}
        <div class="landing-card-body">
          <div class="card-type">${PS.opText(p.operationType)}</div>
          <h3 class="card-title-link"><a href="${link}">${UI.escapeHtml(p.title)}</a></h3>
          <p class="text-muted">${PS.placeText(p)}</p>
          <div class="landing-card-price">${PS.formatPrice(p.price, p.operationType)}</div>
          <div class="landing-card-actions">
            <a class="btn btn-primary btn-sm" href="${link}">Ver detalle</a>
            ${wa}
          </div>
        </div>
      </article>
    `;
  }

  async function loadCities() {
    const select = document.getElementById('search-city');
    if (!select) return;
    try {
      const result = await window.API.public.cities();
      const cities = result.data || [];
      if (!cities || !cities.length) return;
      select.innerHTML =
        '<option value="">Todas las ciudades</option>' +
        cities.map((c) => `<option value="${UI.escapeHtml(c)}">${UI.escapeHtml(c)}</option>`).join('');
    } catch (error) {
      /* catálogo desactivado o error: mantener opción por defecto */
    }
  }

  function buildSearchUrl() {
    const params = new URLSearchParams();
    const operationType = val('search-operation');
    const city = val('search-city');
    const type = val('search-type');
    if (operationType) params.set('operationType', operationType);
    if (city) params.set('city', city);
    if (type) params.set('type', type);
    const qs = params.toString();
    return 'propiedades.html' + (qs ? '?' + qs : '');
  }

  async function loadFeatured() {
    const el = document.getElementById('featured-grid');
    if (!el) return;
    try {
      const result = await window.API.public.properties({ limit: 6 });
      const list = result.data || [];
      const stat = document.getElementById('stat-properties');
      if (result.meta && result.meta.total && stat) stat.textContent = result.meta.total;
      if (!list.length) {
        const title = document.getElementById('featured-title');
        if (title) title.textContent = 'Próximas propiedades';
        el.innerHTML = '<p class="text-muted landing-empty">El catálogo estará disponible próximamente. Escríbenos por WhatsApp para más información.</p>';
        return;
      }
      el.innerHTML = list.map(featuredCard).join('');
    } catch (error) {
      el.innerHTML = UI.errorAlert(error.message);
    }
  }

  async function loadTeam() {
    const el = document.getElementById('team-grid');
    if (!el) return;
    try {
      const result = await window.API.public.asesores();
      const list = (result.data || []).slice(0, 3);
      if (!list.length) {
        el.innerHTML = '';
        return;
      }
      el.innerHTML = list
        .map((a) => {
          const photo = a.photo
            ? `<img src="${window.AppConfig.resolveUrl(a.photo)}" alt="${UI.escapeHtml(a.name)}" class="team-photo" loading="lazy">`
            : `<span class="team-photo team-photo-fallback">${UI.escapeHtml(String(a.name || 'A').charAt(0).toUpperCase())}</span>`;
          const wa = a.phone
            ? `<a class="btn btn-wa btn-sm" href="${PS.whatsappLink(`Hola ${a.name}, te contacté desde la página de INMOBLES.`, a.phone)}" target="_blank" rel="noopener">&#128172; WhatsApp</a>`
            : '';
          return `
            <article class="card team-card">
              <div class="team-avatar">${photo}</div>
              <h3 style="margin:12px 0 2px;">${UI.escapeHtml(a.name)}</h3>
              <p class="text-muted" style="margin:0 0 12px;font-size:13px;">${UI.escapeHtml(a.position || 'Asesor inmobiliario')}</p>
              <div class="landing-card-actions">
                <a class="btn btn-primary btn-sm" href="asesor.html?id=${encodeURIComponent(String(a.id))}">Ver su perfil</a>
                ${wa}
              </div>
            </article>
          `;
        })
        .join('');
    } catch (error) {
      el.innerHTML = '';
    }
  }

  function deepLinkRedirect() {
    const params = new URLSearchParams(window.location.search);
    const prop = params.get('prop');
    if (prop) {
      window.location.replace('propiedades.html?prop=' + encodeURIComponent(prop));
      return true;
    }
    return false;
  }

  function initSearch() {
    const form = document.getElementById('search-form');
    if (!form) return;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      window.location.href = buildSearchUrl();
    });
  }

  async function init() {
    if (deepLinkRedirect()) return;
    await PS.initCommon();
    initSearch();
    await loadCities();
    await loadFeatured();
    await loadTeam();
    PS.initNewsletter();
    PS.initAssistant();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => window.LandingPage.init());