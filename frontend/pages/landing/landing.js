'use strict';

window.LandingPage = (() => {
  // Número del propietario / oficina como respaldo cuando el backend no
  // trae el WhatsApp configurado (viajes sin red, primera carga, etc.).
  const OWNER_WHATSAPP = '526623188580';
  const OWNER_PHONE = '+526623188580';
  const OWNER_PHONE_DISPLAY = '662 318 8580';
  const OWNER_WEBSITE = 'https://inmobles.com';

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
    propId: '',
  };

  const grid = () => document.getElementById('properties-grid');
  const countEl = () => document.getElementById('result-count');
  const paginationEl = () => document.getElementById('landing-pagination');
  const citySelect = () => document.getElementById('search-city');

  // Enlace público directo a la ficha de una propiedad (deep-link).
  function propertyLink(record) {
    const base = window.location.origin === 'null' || !window.location.origin ? '' : window.location.origin;
    return `${base}/landing.html?prop=${encodeURIComponent(String(record._id))}`;
  }

  function qrUrl(data) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(data)}`;
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
            <button class="btn btn-secondary btn-sm" type="button" data-share data-id="${record._id}" title="Copiar enlace directo">&#128279;</button>
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
    el.querySelectorAll('[data-share]').forEach((btn) => {
      btn.addEventListener('click', () => copyText(propertyLink(list.find((p) => p._id === btn.dataset.id))));
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
    const share = propertyLink(record);
    const waMsg = `Hola, me interesa: ${type} en ${place} (${op}). Precio publicado: ${Format.currency(record.price)}`;
    const ownWa = waPhone ? whatsappLink(waMsg, waPhone) : '';
    const shareWa = waPhone ? whatsappLink(`${waMsg} Ver: ${share}`, waPhone) : '';

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

          <div style="border-top:1px solid var(--border);margin-top:18px;padding-top:16px;">
            <p style="margin:0 0 10px;font-weight:700;">&#128198;&nbsp; Agenda una visita</p>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">
              <label style="font-size:13px;">Nombre<input class="form-control" id="landing-date-name" type="text" placeholder="Tu nombre" /></label>
              <label style="font-size:13px;">Fecha<input class="form-control" id="landing-date-date" type="date" /></label>
              <label style="font-size:13px;">Hora<input class="form-control" id="landing-date-time" type="time" /></label>
            </div>
            <button class="btn btn-wa btn-sm" type="button" id="landing-confirm-visit" style="margin-top:12px;" ${ownWa ? '' : 'disabled title="No hay WhatsApp disponible"'}>
              &#128198;&nbsp; Confirmar visita por WhatsApp
            </button>
          </div>

          <div style="border-top:1px solid var(--border);margin-top:18px;padding-top:16px;">
            <p style="margin:0 0 10px;font-weight:700;">&#128176;&nbsp; Calcula tu mensualidad</p>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;">
              <label style="font-size:13px;">Precio<input class="form-control" id="landing-calc-price" type="number" value="${Number(record.price) || ''}" /></label>
              <label style="font-size:13px;">Enganche %<input class="form-control" id="landing-calc-down" type="number" value="10" min="0" max="100" /></label>
              <label style="font-size:13px;">Tasa anual %<input class="form-control" id="landing-calc-rate" type="number" value="10.45" step="0.01" /></label>
              <label style="font-size:13px;">Plazo (años)<input class="form-control" id="landing-calc-years" type="number" value="20" min="1" max="30" /></label>
            </div>
            <div class="text-muted" id="landing-calc-result" style="margin-top:10px;font-size:14px;"></div>
          </div>

          <div style="border-top:1px solid var(--border);margin-top:18px;padding-top:16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;">
            <img src="${qrUrl(share)}" alt="QR de la propiedad" style="width:120px;height:120px;border-radius:8px;" />
            <div style="flex:1;min-width:200px;">
              <p style="margin:0 0 6px;font-weight:700;">&#128279;&nbsp; Comparte esta propiedad</p>
              <p class="text-muted" style="font-size:13px;margin:0 0 10px;overflow-wrap:break-word;">${UI.escapeHtml(share)}</p>
              <button class="btn btn-secondary btn-sm" type="button" id="landing-copy-link">&#128203;&nbsp; Copiar enlace</button>
              ${shareWa ? `<a class="btn btn-wa btn-sm" href="${shareWa}" target="_blank" rel="noopener">&#128172;&nbsp; Compartir por WhatsApp</a>` : ''}
            </div>
          </div>
        </div>
      `,
      footer: waPhone
        ? `<a class="btn btn-primary" href="${ownWa}" target="_blank" rel="noopener">Solicitar información por WhatsApp</a>`
        : '',
    });

    const confirmVisit = document.getElementById('landing-confirm-visit');
    if (confirmVisit && ownWa) {
      confirmVisit.addEventListener('click', () => {
        const name = (document.getElementById('landing-date-name').value || '').trim();
        const date = document.getElementById('landing-date-date').value;
        const time = document.getElementById('landing-date-time').value;
        if (!name || !date || !time) {
          UI.toast('Completa tu nombre, fecha y hora.', 'warning');
          return;
        }
        const when = `${new Date(date + 'T' + time).toLocaleString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`;
        const msg = `Hola, quiero AGENDAR una visita para ver: ${type} en ${place} (${op}).\n\nMi nombre: ${name}\nFecha y hora: ${when}\nPrecio publicado: ${Format.currency(record.price)}\n\n¿Está disponible?`;
        window.open(whatsappLink(msg, waPhone), '_blank', 'noopener');
      });
    }

    const copyLink = document.getElementById('landing-copy-link');
    if (copyLink) copyLink.addEventListener('click', () => copyText(share));

    for (const id of ['landing-calc-price', 'landing-calc-down', 'landing-calc-rate', 'landing-calc-years']) {
      const input = document.getElementById(id);
      if (input) input.addEventListener('input', recalc);
    }
    recalc();

    function recalc() {
      const price = Number(document.getElementById('landing-calc-price').value) || 0;
      const down = Number(document.getElementById('landing-calc-down').value) || 0;
      const rate = (Number(document.getElementById('landing-calc-rate').value) || 0) / 100 / 12;
      const years = Number(document.getElementById('landing-calc-years').value) || 0;
      const principal = price * (1 - Math.min(100, Math.max(0, down)) / 100);
      const n = years * 12;
      const out = document.getElementById('landing-calc-result');
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
      ? `<img src="${window.AppConfig.resolveUrl(a.photo)}" alt="${UI.escapeHtml(a.name)}" class="team-photo" loading="lazy">`
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
          <a class="btn btn-primary btn-sm" href="asesor.html?id=${encodeURIComponent(String(a.id))}">Ver su perfil</a>
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

    state.whatsapp = l.whatsappNumber || settings.whatsappNumber || OWNER_WHATSAPP;

    const setNumber = (id, value) => {
      const el = document.getElementById(id);
      if (el && value) el.textContent = value;
    };
    setNumber('header-phone-text', OWNER_PHONE_DISPLAY);
    setNumber('agent-phone-text', OWNER_PHONE_DISPLAY);
    setNumber('footer-phone-text', OWNER_PHONE_DISPLAY);
    const headerPhone = document.getElementById('header-phone');
    if (headerPhone) headerPhone.href = `tel:${OWNER_PHONE}`;
    const agentPhone = document.getElementById('agent-phone');
    if (agentPhone) agentPhone.href = `tel:${OWNER_PHONE}`;
    const footerPhone = document.getElementById('footer-phone');
    if (footerPhone) footerPhone.href = `tel:${OWNER_PHONE}`;
    const agentWa = document.getElementById('agent-whatsapp');
    if (agentWa) agentWa.href = `https://wa.me/${state.whatsapp}`;
    const footerWa = document.getElementById('footer-wa');
    if (footerWa) footerWa.href = `https://wa.me/${state.whatsapp}`;

    const wa = document.getElementById('wa-contact');
    if (wa) {
      wa.hidden = !state.whatsapp;
      wa.href = `https://wa.me/${state.whatsapp}?text=${encodeURIComponent('Hola, quiero información sobre los inmuebles disponibles.')}`;
      wa.textContent = 'WhatsApp';
    }
    const waFoot = document.getElementById('footer-wa');
    if (waFoot) waFoot.textContent = state.whatsapp ? `WhatsApp: +${state.whatsapp}` : '';
    const waBtn = document.getElementById('cta-wa-float');
    if (waBtn) {
      waBtn.hidden = !state.whatsapp;
      waBtn.href = `https://wa.me/${state.whatsapp}?text=${encodeURIComponent('Hola, quiero información sobre los inmuebles disponibles.')}`;
    }
    const callBtn = document.getElementById('cta-call-float');
    if (callBtn) callBtn.href = `tel:${OWNER_PHONE}`;

    const website = l.websiteUrl || settings.websiteUrl || OWNER_WEBSITE;
    ['nav-website', 'footer-website', 'agent-website', 'cta-website'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.href = website;
    });

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

  function initNewsletter() {
    const form = document.getElementById('newsletter-form');
    const msg = document.getElementById('newsletter-msg');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('newsletter-email').value.trim();
      if (!email) return;
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.classList.add('loading');
      const show = (text, kind) => {
        if (msg) {
          msg.textContent = text;
          msg.classList.remove('ok', 'err');
          if (kind) msg.classList.add(kind);
        }
      };
      try {
        const result = await window.API.public.newsletterSubscribe({ email });
        show(result.message || '¡Gracias por suscribirte!', 'ok');
        form.reset();
      } catch (error) {
        show(error.message || 'No se pudo suscribir. Intenta de nuevo.', 'err');
      } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
      }
    });
  }

  function initAssistant() {
    const root = document.getElementById('assistant-root');
    if (!root) return;

    const openLabel = '&#128172;&nbsp; ¿Te ayudamos?';
    root.innerHTML = `
      <div class="landing-assistant-widget">
        <div class="landing-assistant-panel" id="assistant-panel" hidden>
          <div class="landing-assistant-head">
            <strong>Asistente INMOBLES</strong>
            <button type="button" class="landing-assistant-close" id="assistant-close" aria-label="Cerrar">&times;</button>
          </div>
          <div class="landing-assistant-body" id="assistant-body">
            <div class="landing-assistant-msg bot">¡Hola! Soy el asistente de INMOBLES. ¿Qué buscas? Pregunta por propiedades, precios, financiamiento o cómo agendar una visita.</div>
          </div>
          <form class="landing-assistant-input" id="assistant-form">
            <input class="form-control" id="assistant-q" type="text" placeholder="Escribe tu pregunta..." autocomplete="off" />
            <button class="btn btn-primary btn-sm" type="submit">&#10148;</button>
          </form>
        </div>
        <button class="landing-assistant-toggle" id="assistant-toggle" type="button">${openLabel}</button>
      </div>
    `;

    const panel = root.querySelector('#assistant-panel');
    const body = root.querySelector('#assistant-body');
    const toggle = root.querySelector('#assistant-toggle');
    const close = root.querySelector('#assistant-close');
    const form = root.querySelector('#assistant-form');
    const input = root.querySelector('#assistant-q');

    const appendMsg = (text, who) => {
      const div = document.createElement('div');
      div.className = `landing-assistant-msg ${who}`;
      div.textContent = text;
      body.appendChild(div);
      body.scrollTop = body.scrollHeight;
    };

    toggle.addEventListener('click', () => {
      const opening = panel.hidden;
      panel.hidden = !opening;
      if (opening) input.focus();
    });
    close.addEventListener('click', () => { panel.hidden = true; });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      appendMsg(q, 'user');
      input.value = '';
      try {
        const res = await window.API.public.assistant({ question: q });
        appendMsg((res && res.answer) || 'No pude responder en este momento.', 'bot');
      } catch (error) {
        appendMsg('No pude conectar con el asistente. Intenta de nuevo.', 'bot');
      }
    });
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
    initNewsletter();
    initAssistant();

    // Deep-link al catálogo de un asesor concreto (p. ej. desde la Carta de
    // presentación compartida por WhatsApp): landing.html?asesorId=<id>.
    const urlAsesorId = new URLSearchParams(window.location.search).get('asesorId');
    if (urlAsesorId) state.asesorId = String(urlAsesorId).trim();

    // Deep-link a la ficha de una propiedad: landing.html?prop=<id>.
    const urlPropId = new URLSearchParams(window.location.search).get('prop');
    if (urlPropId) state.propId = String(urlPropId).trim();

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

    // Deep-link de una propiedad: se abre su ficha automáticamente.
    if (state.propId) {
      try {
        const prop = await window.API.public.property(state.propId);
        if (prop) openDetail(prop);
      } catch (error) {
        // La propiedad no está disponible: se muestra el catálogo normal.
      }
    }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => window.LandingPage.init());
