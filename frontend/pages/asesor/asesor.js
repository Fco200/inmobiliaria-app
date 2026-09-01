'use strict';

// Página pública por asesor: perfil, carta de presentación digital (PDF /
// WhatsApp) y su catálogo de propiedades. Se accede con ?id=<userId> desde
// "Nuestro Equipo" de la landing.
window.AsesorPage = (() => {
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

  const state = { id: '', asesor: null, settings: null };

  const grid = () => document.getElementById('properties-grid');
  const countEl = () => document.getElementById('result-count');

  function digits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function whatsappLink(text, phone) {
    if (!phone) return '';
    return `https://wa.me/${digits(phone)}?text=${encodeURIComponent(text)}`;
  }

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

  function renderProfile(a) {
    const profile = document.getElementById('asesor-profile');
    const loading = document.getElementById('asesor-loading');
    loading.hidden = true;
    profile.hidden = false;

    const photo = a.photo
      ? `<img class="asesor-banner-photo" src="${window.AppConfig.resolveUrl(a.photo)}" alt="${String(a.name || '').replace(/"/g, '&quot;')}" style="width:128px;height:128px;">`
      : `<span class="asesor-banner-photo asesor-banner-fallback">${String(a.name || 'A').charAt(0).toUpperCase()}</span>`;

    const tel = a.phone ? `tel:+${digits(a.phone)}` : null;
    const wa = a.phone ? whatsappLink(`Hola ${a.name}, te contacté desde la página de INMOBLES.`, a.phone) : null;

    profile.innerHTML = `
      <div class="asesor-banner-card card" style="max-width:760px;">
        ${photo}
        <div class="asesor-banner-info">
          <small class="text-muted">Asesor inmobiliario</small>
          <h3 style="margin:2px 0 4px;">${String(a.name || 'Asesor').replace(/</g, '&lt;')}</h3>
          <p class="text-muted" style="margin:0 0 8px;font-size:14px;">${String(a.position || 'Asesor inmobiliario').replace(/</g, '&lt;')}${a.propertyCount != null ? ` · ${a.propertyCount} ${a.propertyCount === 1 ? 'propiedad' : 'propiedades'}` : ''}</p>
          ${a.bio ? `<p class="text-muted team-bio" style="font-size:14px;">${String(a.bio).replace(/</g, '&lt;')}</p>` : ''}
          <div class="landing-card-actions" style="margin-top:10px;flex-wrap:wrap;">
            ${wa ? `<a class="btn btn-wa btn-sm" href="${wa}" target="_blank" rel="noopener">&#128172; WhatsApp</a>` : ''}
            ${tel ? `<a class="btn btn-secondary btn-sm" href="${tel}">&#128222; ${String(a.phone).replace(/</g, '&lt;')}</a>` : ''}
            ${a.email ? `<a class="btn btn-secondary btn-sm" href="mailto:${String(a.email).replace(/"/g, '&quot;')}">&#128231; Correo</a>` : ''}
            <a class="btn btn-primary btn-sm" href="landing.html">&#127968; Ver todo el catálogo</a>
          </div>
        </div>
      </div>
    `;
  }

  function renderCarta(a) {
    const box = document.getElementById('carta-preview');
    // La vista previa reutiliza las clases .carta-preview del perfil interno.
    box.innerHTML = `
      <div class="carta-preview card" style="max-width:760px;background:#fff;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;">
        <div style="background:linear-gradient(135deg,#2d1048,#4A1A6B);color:#fff;padding:12px 16px;display:flex;align-items:center;gap:10px;justify-content:space-between;flex-wrap:wrap;">
          <span style="font-size:14px;font-weight:700;">Carta de presentación</span>
          <span style="display:flex;gap:8px;">
            <button class="btn btn-primary btn-sm" type="button" data-carta-pdf>&#128424; PDF</button>
            <button class="btn btn-wa btn-sm" type="button" data-carta-wa>&#128172; WhatsApp</button>
          </span>
        </div>
        <div style="padding:16px;">
          ${CartaPresentacion.buildCarta(a, { skipLink: true })}
        </div>
      </div>
    `;
    const pdf = box.querySelector('[data-carta-pdf]');
    if (pdf) pdf.addEventListener('click', () => CartaPresentacion.openPdf(a));
    const wa = box.querySelector('[data-carta-wa]');
    if (wa) wa.addEventListener('click', () => CartaPresentacion.shareWhatsApp(a));
  }

  function card(record) {
    const img = imageUrl(record);
    const type = TYPE_LABELS[record.type] || record.type || 'Inmueble';
    const op = (record.operationType || '').toUpperCase();
    const place = [record.zone, record.city, record.state].filter(Boolean).join(', ') || 'Sin ubicación';
    const waPhone = state.asesor && state.asesor.phone;
    return `
      <article class="card landing-card">
        <div class="landing-card-img${img ? '' : ' placeholder'}" ${img ? `style="background-image:url('${img.replace(/'/g, '%27')}');"` : ''}>
          <span class="landing-card-op">${String(op).replace(/</g, '&lt;')}</span>
        </div>
        <div class="landing-card-body">
          <h3>${String(type).replace(/</g, '&lt;')} en ${String(op.toLowerCase()).replace(/</g, '&lt;')}</h3>
          <p class="text-muted">${String(place).replace(/</g, '&lt;')}</p>
          <div class="landing-card-price">${Format.currency(record.price)}</div>
          ${characteristicsText(record) ? `<p class="text-muted landing-card-chars">${String(characteristicsText(record)).replace(/</g, '&lt;')}</p>` : ''}
          <div class="landing-card-actions">
            <button class="btn btn-primary btn-sm" type="button" data-detail data-id="${record._id}">Ver detalle</button>
            ${waPhone
              ? `<a class="btn btn-secondary btn-sm" href="${whatsappLink(`Hola, me interesa esta propiedad: ${type} en ${place} (${op}). ¿Pueden darme más información?`, waPhone)}" target="_blank" rel="noopener">WhatsApp</a>`
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
      el.innerHTML = '<p class="text-muted landing-empty">Este asesor no tiene propiedades publicadas por el momento.</p>';
      return;
    }
    el.innerHTML = list.map(card).join('');
    el.querySelectorAll('[data-detail]').forEach((btn) => {
      btn.addEventListener('click', () => openDetail(list.find((p) => p._id === btn.dataset.id)));
    });
  }

  function openDetail(record) {
    const type = TYPE_LABELS[record.type] || record.type || 'Inmueble';
    const op = (record.operationType || '').toUpperCase();
    const place = [record.address, record.zone, record.city, record.state].filter(Boolean).join(', ') || 'Sin ubicación';
    const photos = (record.photos || []).slice(0, 6);
    const gallery = photos.length
      ? photos.map((p) => `<img class="landing-detail-img" src="${window.AppConfig.resolveUrl(p).replace(/"/g, '&quot;')}" alt="Fotografía" loading="lazy" />`).join('')
      : '<div class="landing-card-img placeholder" style="height:200px;"></div>';
    const waPhone = state.asesor && state.asesor.phone;

    UI.openModal({
      title: `${type} en ${op.toLowerCase()}`,
      size: 720,
      body: `
        <div class="landing-detail">
          ${gallery}
          <h3>${Format.currency(record.price)}</h3>
          <p class="text-muted">${String(place).replace(/</g, '&lt;')}</p>
          ${characteristicsText(record) ? `<p><strong>Características:</strong> ${String(characteristicsText(record)).replace(/</g, '&lt;')}</p>` : ''}
          ${record.description ? `<p>${String(record.description).replace(/</g, '&lt;')}</p>` : ''}
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
    try {
      const result = await window.API.public.properties({ page: 1, limit: 24, asesorId: state.asesor.id });
      const meta = result.meta || {};
      renderCards(result.data);
      if (countEl()) countEl().textContent = `${meta.total || 0} ${meta.total === 1 ? 'inmueble' : 'inmuebles'} de ${String(state.asesor.name || 'este asesor').replace(/</g, '&lt;')}`;
      const title = document.getElementById('catalogo-title');
      if (title) title.textContent = state.asesor.name ? `Propiedades de ${String(state.asesor.name).replace(/</g, '&lt;')}` : 'Propiedades disponibles';
    } catch (error) {
      if (el) el.innerHTML = UI.errorAlert(error.message);
    }
  }

  function initNav() {
    const toggle = document.getElementById('nav-toggle');
    if (toggle) {
      document.getElementById('landing-nav').addEventListener('click', function onToggle() {});
      toggle.addEventListener('click', () => {
        const nav = document.getElementById('landing-nav');
        nav.classList.toggle('open');
        toggle.classList.toggle('active');
      });
    }
  }

  async function init() {
    const year = document.getElementById('footer-year');
    if (year) year.textContent = String(new Date().getFullYear());

    initNav();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) {
      const loading = document.getElementById('asesor-loading');
      if (loading) loading.innerHTML = '<p class="text-muted landing-empty">No se indicó un asesor. <a href="landing.html#equipo">Conoce a nuestro equipo</a>.</p>';
      return;
    }
    state.id = String(id).trim();

    try {
      const settings = await window.API.settings.public();
      state.settings = settings || null;
      const l = (settings && settings.landing) || {};
      const text = (elId, value) => {
        const el = document.getElementById(elId);
        if (el && value) el.textContent = value;
        return el;
      };
      text('landing-brand-name', settings.agencyName || l.agencyName || 'Inmobiliaria');
      text('landing-brand-tagline', l.brandTagline || 'Bienes raíces');
    } catch (error) { /* sin configuración */ }

    try {
      const asesor = await window.API.public.asesor(state.id);
      if (!asesor) throw new Error('Asesor no disponible');
      state.asesor = asesor;
      const title = document.getElementById('asesor-title');
      if (title) title.textContent = `${asesor.name || 'Asesor'} — INMOBLES`;
      renderProfile(asesor);
      renderCarta(asesor);
      await loadProperties();
    } catch (error) {
      const loading = document.getElementById('asesor-loading');
      if (loading) loading.innerHTML = UI.errorAlert(error.message);
    }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => window.AsesorPage.init());