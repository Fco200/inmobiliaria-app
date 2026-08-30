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

  function whatsappLink(text) {
    if (!state.whatsapp) return '';
    return `https://wa.me/${state.whatsapp}?text=${encodeURIComponent(text)}`;
  }

  function card(record) {
    const img = imageUrl(record);
    const type = TYPE_LABELS[record.type] || record.type || 'Inmueble';
    const op = (record.operationType || '').toUpperCase();
    const place = [record.zone, record.city, record.state].filter(Boolean).join(', ') || 'Sin ubicación';
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
          <div class="landing-card-actions">
            <button class="btn btn-primary btn-sm" type="button" data-detail data-id="${record._id}">Ver detalle</button>
            ${state.whatsapp
              ? `<a class="btn btn-secondary btn-sm" href="${whatsappLink(`Hola, me interesa el inmueble: ${type} en ${place} (${op}). ¿Pueden darme más información?`)}" target="_blank" rel="noopener">WhatsApp</a>`
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
        </div>
      `,
      footer: state.whatsapp
        ? `<a class="btn btn-primary" href="${whatsappLink(`Hola, me interesa: ${type} en ${place} (${op}). Precio publicado: ${Format.currency(record.price)}`)}" target="_blank" rel="noopener">Solicitar información por WhatsApp</a>`
        : '',
    });
  }

  async function loadProperties() {
    const el = grid();
    if (el) el.innerHTML = '<div class="loading">Cargando propiedades...</div>';
    try {
      const result = await window.API.public.properties({
        page: state.page,
        q: state.q,
        type: state.type,
        operationType: state.operationType,
        city: state.city,
      });
      const meta = result.meta || {};
      renderCards(result.data);
      renderPagination(meta);
      if (countEl()) countEl().textContent = `${meta.total || 0} inmuebles disponibles`;
      fillCities(meta.cities);
    } catch (error) {
      if (el) el.innerHTML = UI.errorAlert(error.message);
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

  async function init() {
    const year = document.getElementById('footer-year');
    if (year) year.textContent = String(new Date().getFullYear());

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

    if (enabled) {
      await loadProperties();
    } else {
      const el = grid();
      if (el) el.innerHTML = '<p class="text-muted landing-empty">El catálogo estará disponible próximamente.</p>';
    }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => window.LandingPage.init());
