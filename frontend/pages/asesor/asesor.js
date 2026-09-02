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

  function propertyLink(record, asesorId) {
    const base = window.location.origin === 'null' || !window.location.origin ? '' : window.location.origin;
    return `${base}/landing.html?prop=${encodeURIComponent(String(record._id))}${asesorId ? `&asesorId=${encodeURIComponent(asesorId)}` : ''}`;
  }

  function qrUrl(data) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=10&data=${encodeURIComponent(data)}`;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    UI.toast('Enlace copiado', 'success');
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
            <a class="btn btn-secondary btn-sm" href="${window.OFFICIAL_WEBSITE || 'https://inmobles.com'}" target="_blank" rel="noopener">&#127760; inmobles.com</a>
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
            <button class="btn btn-secondary btn-sm" type="button" data-share data-id="${record._id}" title="Copiar enlace directo">&#128279;</button>
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
    el.querySelectorAll('[data-share]').forEach((btn) => {
      const rec = list.find((p) => p._id === btn.dataset.id);
      btn.addEventListener('click', () => copyText(propertyLink(rec, state.asesor ? state.asesor.id : '')));
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
    const waMsg = `Hola, me interesa: ${type} en ${place} (${op}). Precio publicado: ${Format.currency(record.price)}`;
    const ownWa = waPhone ? whatsappLink(waMsg, waPhone) : '';
    const share = propertyLink(record, state.asesor ? state.asesor.id : '');
    const shareWa = waPhone ? whatsappLink(`${waMsg} Ver: ${share}`, waPhone) : '';

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

          <div style="border-top:1px solid var(--border);margin-top:18px;padding-top:16px;">
            <p style="margin:0 0 10px;font-weight:700;">&#128198;&nbsp; Agenda una visita</p>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;">
              <label style="font-size:13px;">Nombre<input class="form-control" id="asesor-date-name" type="text" placeholder="Tu nombre" /></label>
              <label style="font-size:13px;">Fecha<input class="form-control" id="asesor-date-date" type="date" /></label>
              <label style="font-size:13px;">Hora<input class="form-control" id="asesor-date-time" type="time" /></label>
            </div>
            <button class="btn btn-wa btn-sm" type="button" id="asesor-confirm-visit" style="margin-top:12px;" ${ownWa ? '' : 'disabled title="No hay WhatsApp disponible"'}>
              &#128198;&nbsp; Confirmar visita por WhatsApp
            </button>
          </div>

          <div style="border-top:1px solid var(--border);margin-top:18px;padding-top:16px;">
            <p style="margin:0 0 10px;font-weight:700;">&#128176;&nbsp; Calcula tu mensualidad</p>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;">
              <label style="font-size:13px;">Precio<input class="form-control" id="asesor-calc-price" type="number" value="${Number(record.price) || ''}" /></label>
              <label style="font-size:13px;">Enganche %<input class="form-control" id="asesor-calc-down" type="number" value="10" min="0" max="100" /></label>
              <label style="font-size:13px;">Tasa anual %<input class="form-control" id="asesor-calc-rate" type="number" value="10.45" step="0.01" /></label>
              <label style="font-size:13px;">Plazo (años)<input class="form-control" id="asesor-calc-years" type="number" value="20" min="1" max="30" /></label>
            </div>
            <div class="text-muted" id="asesor-calc-result" style="margin-top:10px;font-size:14px;"></div>
          </div>

          <div style="border-top:1px solid var(--border);margin-top:18px;padding-top:16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;">
            <img src="${qrUrl(share)}" alt="QR de la propiedad" style="width:120px;height:120px;border-radius:8px;" />
            <div style="flex:1;min-width:200px;">
              <p style="margin:0 0 6px;font-weight:700;">&#128279;&nbsp; Comparte esta propiedad</p>
              <p class="text-muted" style="font-size:13px;margin:0 0 10px;overflow-wrap:break-word;">${String(share).replace(/</g, '&lt;')}</p>
              <button class="btn btn-secondary btn-sm" type="button" id="asesor-copy-link">&#128203;&nbsp; Copiar enlace</button>
              ${shareWa ? `<a class="btn btn-wa btn-sm" href="${shareWa}" target="_blank" rel="noopener">&#128172;&nbsp; Compartir por WhatsApp</a>` : ''}
            </div>
          </div>
        </div>
      `,
      footer: waPhone
        ? `<a class="btn btn-primary" href="${ownWa}" target="_blank" rel="noopener">Solicitar información por WhatsApp</a>`
        : '',
    });

    const confirmVisit = document.getElementById('asesor-confirm-visit');
    if (confirmVisit && ownWa) {
      confirmVisit.addEventListener('click', () => {
        const name = (document.getElementById('asesor-date-name').value || '').trim();
        const date = document.getElementById('asesor-date-date').value;
        const time = document.getElementById('asesor-date-time').value;
        if (!name || !date || !time) {
          UI.toast('Completa tu nombre, fecha y hora.', 'warning');
          return;
        }
        const when = `${new Date(date + 'T' + time).toLocaleString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`;
        const msg = `Hola, quiero AGENDAR una visita para ver: ${type} en ${place} (${op}).\n\nMi nombre: ${name}\nFecha y hora: ${when}\nPrecio publicado: ${Format.currency(record.price)}\n\n¿Está disponible?`;
        window.open(whatsappLink(msg, waPhone), '_blank', 'noopener');
      });
    }

    const copyLink = document.getElementById('asesor-copy-link');
    if (copyLink) copyLink.addEventListener('click', () => copyText(share));

    for (const id of ['asesor-calc-price', 'asesor-calc-down', 'asesor-calc-rate', 'asesor-calc-years']) {
      const input = document.getElementById(id);
      if (input) input.addEventListener('input', recalc);
    }
    recalc();

    function recalc() {
      const price = Number(document.getElementById('asesor-calc-price').value) || 0;
      const down = Number(document.getElementById('asesor-calc-down').value) || 0;
      const rate = (Number(document.getElementById('asesor-calc-rate').value) || 0) / 100 / 12;
      const years = Number(document.getElementById('asesor-calc-years').value) || 0;
      const principal = price * (1 - Math.min(100, Math.max(0, down)) / 100);
      const n = years * 12;
      const out = document.getElementById('asesor-calc-result');
      if (!principal || !n || rate <= 0) {
        out.textContent = 'Completa los campos para estimar tu mensualidad.';
        return;
      }
      const payment = (principal * rate * Math.pow(1 + rate, n)) / (Math.pow(1 + rate, n) - 1);
      const totalInterest = payment * n - principal;
      out.innerHTML = `<strong>Mensualidad estimada: ${Format.currency(payment)}</strong> · Financiado: ${Format.currency(principal)} · Intereses: ${Format.currency(totalInterest)}`;
    }
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
      const website = l.websiteUrl || settings.websiteUrl || 'https://inmobles.com';
      window.OFFICIAL_WEBSITE = website;
      document.querySelectorAll('#nav-website, .footer-website').forEach((el) => {
        if (el) el.href = website;
      });
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