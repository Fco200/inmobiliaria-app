'use strict';

window.LandingPage = (() => {
  const TYPE_LABELS = {
    casa: 'Casa',
    departamento: 'Departamento',
    local: 'Local',
    bodega: 'Bodega',
    rancho: 'Rancho',
    terreno: 'Terreno',
    playa: 'Playa',
    otro: 'Otro',
  };

  const state = {
    page: 1,
    q: '',
    type: '',
    operationType: '',
    city: '',
    whatsapp: '',
    asesorId: '',
    activeAsesor: null,
  };

  const grid = () => document.getElementById('properties-grid');
  const countEl = () => document.getElementById('result-count');
  const paginationEl = () => document.getElementById('landing-pagination');
  const citySelect = () => document.getElementById('search-city');

  function imageUrl(record) {
    if (record.photos && record.photos.length) return window.AppConfig.resolveUrl(record.photos[0]);
    return '';
  }

  function characteristicsText(record) {
    const c = record.characteristics;
    if (!c) return '';
    if (Array.isArray(c)) {
      return c
        .map((item) => {
          if (item && typeof item === 'object') return item.name && item.value ? `${item.name}: ${item.value}` : item.value || item.name || '';
          return String(item);
        })
        .filter(Boolean)
        .join(' · ');
    }
    return String(c);
  }

  function whatsappLink(text, phone) {
    const num = phone || state.whatsapp;
    if (!num) return '';
    return `https://wa.me/${Format.digits(num)}?text=${encodeURIComponent(text)}`;
  }

  function asesorOf(record) {
    const a = record.responsibleUser;
    if (!a) return null;
    return typeof a === 'object' ? a : null;
  }

  function card(record) {
    const img = imageUrl(record);
    const type = TYPE_LABELS[record.type] || record.type || 'Inmueble';
    const op = (record.operationType || '').toUpperCase();
    const place = [record.zone, record.city, record.state].filter(Boolean).join(', ') || 'Sin ubicación';
    const asesor = asesorOf(record);
    const waPhone = (asesor && asesor.phone) || state.whatsapp;
    return `
      <article class="card landing-card">
        <div class="landing-card-img${img ? '' : ' placeholder'}" ${img ? `style="background-image:url('${img.replace(/'/g, '%27')}');"` : ''}>
          <span class="landing-card-op">${UI.escapeHtml(op)}</span>
        </div>
        <div class="landing-card-body">
          <h3>${UI.escapeHtml(type)} en ${UI.escapeHtml(op.toLowerCase())}</h3>
          <p class="text-muted">${UI.escapeHtml(place)}</p>
          <div class="landing-card-price">${Format.currency(record.price)}</div>
          ${characteristicsText(record) ? `<p class="text-muted landing-card-chars">${UI.escapeHtml(characteristicsText(record))}</p>` : ''}
          ${asesor ? `<p class="landing-card-asesor">&#128100; ${UI.escapeHtml(asesor.name)}</p>` : ''}
          <div class="landing-card-actions">
            <button class="btn btn-primary btn-sm" type="button" data-detail data-id="${record._id}">Ver detalle</button>
            ${waPhone
              ? `<a class="btn btn-secondary btn-sm" href="${whatsappLink(`Hola, me interesa el inmueble: ${type} en ${place} (${op}). ¿Pueden darme más información?`, waPhone)}" target="_blank" rel="noopener">WhatsApp</a>`
              : ''}
          </div>
        </div>
      </article>
    `;
  }

  function renderCards(list) {
    const el = grid();
    if (!el) return;
    if (!list.length) {
      el.innerHTML = '<p class="text-muted landing-empty">No encontramos inmuebles con esos criterios. Intenta con otros filtros.</p>';
      return;
    }
    el.innerHTML = list.map(card).join('');
    el.querySelectorAll('[data-detail]').forEach((btn) => {
      btn.addEventListener('click', () => openDetail(list.find((p) => p._id === btn.dataset.id)));
    });
  }

  function renderPagination(meta) {
    const el = paginationEl();
    if (!el) return;
    el.innerHTML = '';
    if (!meta || meta.pages <= 1) return;
    for (let i = 1; i <= meta.pages; i += 1) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-sm ' + (i === meta.page ? 'btn-primary' : 'btn-secondary');
      btn.textContent = i;
      btn.addEventListener('click', () => {
        state.page = i;
        loadProperties();
      });
      el.appendChild(btn);
    }
  }

  function openDetail(record) {
    if (!record) return;
    const type = TYPE_LABELS[record.type] || record.type || 'Inmueble';
    const op = (record.operationType || '').toUpperCase();
    const place = [record.address, record.zone, record.city, record.state].filter(Boolean).join(', ') || 'Sin ubicación';
    const photos = (record.photos || []).slice(0, 6);
    const gallery = photos.length
      ? photos.map((p) => `<img class="landing-detail-img" src="${window.AppConfig.resolveUrl(p).replace(/"/g, '&quot;')}" alt="Fotografía" loading="lazy" />`).join('')
      : '<div class="landing-card-img placeholder" style="height:200px;"></div>';
    const asesor = asesorOf(record);
    const waPhone = (asesor && asesor.phone) || state.whatsapp;
    const asesorBlock = asesor
      ? `<p class="landing-card-asesor" style="margin:8px 0 0;">&#128100; Asesor: <strong>${UI.escapeHtml(asesor.name)}</strong>${asesor.phone ? ` · &#128222; ${UI.escapeHtml(asesor.phone)}` : ''}</p>`
      : '';

    UI.openModal({
      title: `${type} en ${op.toLowerCase()}`,
      size: 720,
      body: `
        <div class="landing-detail">
          ${gallery}
          <h3>${Format.currency(record.price)}</h3>
          <p class="text-muted">${UI.escapeHtml(place)}</p>
          ${characteristicsText(record) ? `<p><strong>Características:</strong> ${UI.escapeHtml(characteristicsText(record))}</p>` : ''}
          ${record.description ? `<p>${UI.escapeHtml(record.description)}</p>` : ''}
          ${asesorBlock}
        </div>
      `,
      footer: waPhone
        ? `<a class="btn btn-primary" href="${whatsappLink(`Hola, me interesa: ${type} en ${place} (${op}). Precio publicado: ${Format.currency(record.price)}`, waPhone)}" target="_blank" rel="noopener">Solicitar información por WhatsApp</a>`
        : '',
    });
  }

  async function loadProperties() {
    const el = grid();
    if (el) el.innerHTML = '<div class="loading">Cargando propiedades...</div>';
    renderAsesorBanner();
    try {
      const params = {
        page: state.page,
        q: state.q,
        type: state.type,
        operationType: state.operationType,
        city: state.city,
      };
      if (state.asesorId) params.asesorId = state.asesorId;
      const result = await window.API.public.properties(params);
      const meta = result.meta || {};
      renderCards(result.data);
      renderPagination(meta);
      if (countEl()) countEl().textContent = `${meta.total || 0} inmuebles disponibles`;
      fillCities(meta.cities);
    } catch (error) {
      if (el) el.innerHTML = UI.errorAlert(error.message);
    }
  }

  function renderAsesorBanner() {
    const banner = document.getElementById('asesor-banner');
    const title = document.getElementById('catalogo-title');
    if (!banner) return;
    if (!state.activeAsesor) {
      banner.hidden = true;
      banner.innerHTML = '';
      if (title) title.textContent = 'Propiedades disponibles';
      return;
    }
    const a = state.activeAsesor;
    banner.hidden = false;
    const photo = a.photo
      ? `<img class="asesor-banner-photo" src="${window.AppConfig.resolveUrl(a.photo)}" alt="">`
      : `<span class="asesor-banner-photo asesor-banner-fallback">${UI.escapeHtml(String(a.name || 'A').charAt(0).toUpperCase())}</span>`;
    const wa = a.phone
      ? `<a class="btn btn-wa btn-sm" href="${whatsappLink(`Hola ${a.name}, vi tu catálogo de propiedades en INMOBLES y me gustaría más información.`, a.phone)}" target="_blank" rel="noopener">WhatsApp</a>`
      : '';
    banner.innerHTML = `
      <div class="asesor-banner-card card">
        ${photo}
        <div class="asesor-banner-info">
          <small class="text-muted">Catálogo de</small>
          <h3 style="margin:2px 0 4px;">${UI.escapeHtml(a.name)}</h3>
          <p class="text-muted" style="margin:0 0 8px;font-size:13px;">${UI.escapeHtml(a.position || 'Asesor inmobiliario')}${a.propertyCount != null ? ` · ${a.propertyCount} ${a.propertyCount === 1 ? 'propiedad' : 'propiedades'}` : ''}</p>
          <div class="landing-card-actions">
            ${wa}
            <button class="btn btn-secondary btn-sm" type="button" data-clear-asesor>Ver todo</button>
          </div>
        </div>
      </div>
    `;
    if (title) title.textContent = `Propiedades de ${a.name}`;
    const clearBtn = banner.querySelector('[data-clear-asesor]');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      state.asesorId = '';
      state.activeAsesor = null;
      state.page = 1;
      loadProperties();
      const eq = document.getElementById('equipo');
      if (eq) eq.scrollIntoView({ behavior: 'smooth', block: 'start' });
      loadAsesores();
    });
  }

  // ---- Directorio de asesores (Nuestro Equipo) ----

  function asesorCard(a) {
    const photo = a.photo
      ? `<img src="${window.AppConfig.resolveUrl(a.photo)}" alt="${UI.escapeHtml(a.name)}" class="team-photo">`
      : `<span class="team-photo team-photo-fallback">${UI.escapeHtml(String(a.name || 'A').charAt(0).toUpperCase())}</span>`;
    const wa = a.phone
      ? `<a class="btn btn-wa btn-sm" href="${whatsappLink(`Hola ${a.name}, te contacté desde la página de INMOBLES.`, a.phone)}" target="_blank" rel="noopener">&#128172; WhatsApp</a>`
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
          <button class="btn btn-primary btn-sm" type="button" data-team data-id="${a.id}">Ver sus propiedades</button>
          ${wa}
          ${mail}
        </div>
      </article>
    `;
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
      el.querySelectorAll('[data-team]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const asesor = list.find((x) => x.id === id) || null;
          state.asesorId = id;
          state.activeAsesor = asesor;
          state.page = 1;
          window.scrollTo({ top: 0, behavior: 'smooth' });
          await loadProperties();
          const cat = document.getElementById('catalogo');
          if (cat) cat.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    } catch (error) {
      el.innerHTML = UI.errorAlert(error.message);
    }
  }

  function fillCities(cities) {
    const sel = citySelect();
    if (!sel || !Array.isArray(cities) || sel.options.length > 1) return;
    cities.forEach((city) => {
      const opt = document.createElement('option');
      opt.value = city;
      opt.textContent = city;
      sel.appendChild(opt);
    });
  }

  function applyConfig(settings) {
    const l = settings.landing || {};
    const text = (id, value) => {
      const el = document.getElementById(id);
      if (el && value) el.textContent = value;
    };
    text('landing-brand-name', settings.agencyName || l.agencyName || 'Inmobiliaria');
    text('landing-brand-tagline', l.brandTagline || 'Bienes raíces');
    text('landing-hero-title', l.heroTitle);
    text('landing-hero-sub', l.heroSubtitle);
    text('landing-contact-title', l.contactTitle);
    text('landing-contact-text', l.contactText);
    text('landing-footer-text', l.footerText ? `${settings.agencyName || ''} ${l.footerText}`.trim() : settings.agencyName || '');
    text('landing-title', `${settings.agencyName || 'Inmobiliaria'} — Catálogo de inmuebles`);

    state.whatsapp = l.whatsappNumber || settings.whatsappNumber || '';

    const wa = document.getElementById('wa-contact');
    if (wa) {
      wa.hidden = !state.whatsapp;
      wa.href = `https://wa.me/${state.whatsapp}?text=${encodeURIComponent('Hola, quiero información sobre los inmuebles disponibles.')}`;
      wa.textContent = 'WhatsApp';
    }
    const waFoot = document.getElementById('footer-wa');
    if (waFoot) waFoot.textContent = state.whatsapp ? `WhatsApp: +${state.whatsapp}` : '';

    const enabled = l.catalogEnabled !== false;
    const form = document.getElementById('search-form');
    const heroNote = document.getElementById('hero-note');
    if (!enabled) {
      if (form) form.style.display = 'none';
      if (heroNote) heroNote.textContent = 'El catálogo estará disponible próximamente.';
    } else if (form) {
      form.style.display = '';
    }
  }

  function initNav() {
    const toggle = document.getElementById('nav-toggle');
    const nav = document.getElementById('landing-nav');
    if (toggle && nav) {
      toggle.addEventListener('click', function onToggle() {
        nav.classList.toggle('open');
        this.classList.toggle('active');
      });
    }
    // Smooth scroll: al hacer clic en un enlace interno se cierra el menú.
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const href = a.getAttribute('href');
        if (href === '#') return;
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (nav) nav.classList.remove('open');
        if (toggle) toggle.classList.remove('active');
      });
    });
  }

  async function init() {
    const year = document.getElementById('footer-year');
    if (year) year.textContent = String(new Date().getFullYear());

    initNav();

    // Deep-link al catálogo de un asesor concreto (p. ej. desde la Carta de
    // presentación compartida por WhatsApp): landing.html?asesorId=<id>.
    const urlAsesorId = new URLSearchParams(window.location.search).get('asesorId');
    if (urlAsesorId) state.asesorId = String(urlAsesorId).trim();

    // PWA: registra el service worker también en la página pública.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    let enabled = true;
    try {
      const settings = await window.API.settings.public();
      applyConfig(settings);
      const l = settings.landing || {};
      enabled = l.catalogEnabled !== false;
    } catch (error) {
      // Sin backend: se muestra el estado por defecto sin WhatsApp.
    }

    const form = document.getElementById('search-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        state.q = document.getElementById('search-q').value.trim();
        state.operationType = document.getElementById('search-operation').value;
        state.type = document.getElementById('search-type').value;
        state.city = document.getElementById('search-city').value;
        state.page = 1;
        loadProperties();
      });
    }

    // Si venimos de un deep-link de asesor, se precarga su perfil (nombre,
    // posición, propiedades) antes de listar.
    if (state.asesorId) {
      try {
        const asesor = await window.API.public.asesor(state.asesorId);
        state.activeAsesor = asesor || null;
      } catch (error) {
        state.activeAsesor = null;
      }
    }

    if (enabled) {
      await loadProperties();
    } else {
      const el = grid();
      if (el) el.innerHTML = '<p class="text-muted landing-empty">El catálogo estará disponible próximamente.</p>';
    }

    loadAsesores();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => window.LandingPage.init());
