'use strict';

// Página pública de CATÁLOGO (propiedades.html): buscador, filtros, listado,
// ficha detallada (agenda, calculadora, compartir/QR) y deep-links ?prop= / ?asesorId=.
window.PropiedadesPage = (() => {
  const PS = window.PublicSite;

  const state = {
    page: 1,
    q: '',
    type: '',
    operationType: '',
    city: '',
    asesorId: '',
    activeAsesor: null,
    propId: '',
  };

  const grid = () => document.getElementById('properties-grid');
  const countEl = () => document.getElementById('result-count');
  const paginationEl = () => document.getElementById('landing-pagination');
  const citySelect = () => document.getElementById('search-city');

  function imageUrl(record) {
    if (record.photos && record.photos.length) return window.AppConfig.resolveUrl(record.photos[0]);
    return '';
  }

  function card(record) {
    const img = imageUrl(record);
    const type = PS.label(record);
    const op = PS.opText(record);
    const place = [record.zone, record.city, record.state].filter(Boolean).join(', ') || 'Sin ubicación';
    const asesor = PS.asesorOf(record);
    const waPhone = (asesor && asesor.phone) || PS.state.whatsapp;
    return `
      <article class="card landing-card">
        <div class="landing-card-img${img ? '' : ' placeholder'}" ${img ? `style="background-image:url('${img.replace(/'/g, '%27')}');"` : ''}>
          <span class="landing-card-op">${UI.escapeHtml(op)}</span>
        </div>
        <div class="landing-card-body">
          <h3>${UI.escapeHtml(type)} en ${UI.escapeHtml(op.toLowerCase())}</h3>
          <p class="text-muted">${UI.escapeHtml(place)}</p>
          <div class="landing-card-price">${Format.currency(record.price)}</div>
          ${PS.characteristicsText(record) ? `<p class="text-muted landing-card-chars">${UI.escapeHtml(PS.characteristicsText(record))}</p>` : ''}
          ${asesor ? `<p class="landing-card-asesor">&#128100; ${UI.escapeHtml(asesor.name)}</p>` : ''}
          <div class="landing-card-actions">
            <button class="btn btn-primary btn-sm" type="button" data-detail data-id="${record._id}">Ver detalle</button>
            <button class="btn btn-secondary btn-sm" type="button" data-share data-id="${record._id}" title="Copiar enlace directo">&#128279;</button>
            ${waPhone
              ? `<a class="btn btn-secondary btn-sm" href="${PS.whatsappLink(`Hola, me interesa el inmueble: ${type} en ${place} (${op}). ¿Pueden darme más información?`, waPhone)}" target="_blank" rel="noopener">WhatsApp</a>`
              : ''}
          </div>
        </div>
      </article>
    `;
  }

  function renderCards(list) {
    const el = grid();
    if (!el) return;
    el.innerHTML = list.map(card).join('');
    el.querySelectorAll('[data-detail]').forEach((btn) => {
      btn.addEventListener('click', () => openDetail(list.find((p) => p._id === btn.dataset.id)));
    });
    el.querySelectorAll('[data-share]').forEach((btn) => {
      btn.addEventListener('click', () => PS.copyText(PS.propertyLink(list.find((p) => p._id === btn.dataset.id))));
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
    const name = document.getElementById('catalogo-name');
    if (!banner) return;
    if (!state.activeAsesor) {
      banner.hidden = true;
      banner.innerHTML = '';
      if (name) name.textContent = 'Propiedades disponibles';
      return;
    }
    const a = state.activeAsesor;
    banner.hidden = false;
    const photo = a.photo
      ? `<img class="asesor-banner-photo" src="${window.AppConfig.resolveUrl(a.photo)}" alt="">`
      : `<span class="asesor-banner-photo asesor-banner-fallback">${UI.escapeHtml(String(a.name || 'A').charAt(0).toUpperCase())}</span>`;
    const wa = a.phone
      ? `<a class="btn btn-wa btn-sm" href="${PS.whatsappLink(`Hola ${a.name}, vi tu catálogo de propiedades en INMOBLES y me gustaría más información.`, a.phone)}" target="_blank" rel="noopener">WhatsApp</a>`
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
            <a class="btn btn-secondary btn-sm" href="equipo.html">Ver todo el equipo</a>
            <button class="btn btn-secondary btn-sm" type="button" data-clear-asesor>Ver todo</button>
          </div>
        </div>
      </div>
    `;
    if (name) name.textContent = `Propiedades de ${a.name}`;
    const clearBtn = banner.querySelector('[data-clear-asesor]');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      state.asesorId = '';
      state.activeAsesor = null;
      state.page = 1;
      loadProperties();
    });
  }

  function openDetail(record) {
    if (!record) return;
    const type = PS.label(record);
    const op = PS.opText(record);
    const place = PS.placeText(record);
    const photos = (record.photos || []).slice(0, 6);
    const gallery = photos.length
      ? photos.map((p) => `<img class="landing-detail-img" src="${window.AppConfig.resolveUrl(p).replace(/"/g, '&quot;')}" alt="Fotografía" loading="lazy" />`).join('')
      : '<div class="landing-card-img placeholder" style="height:200px;"></div>';
    const asesor = PS.asesorOf(record);
    const waPhone = (asesor && asesor.phone) || PS.state.whatsapp;
    const asesorBlock = asesor
      ? `<p class="landing-card-asesor" style="margin:8px 0 0;">&#128100; Asesor: <strong>${UI.escapeHtml(asesor.name)}</strong>${asesor.phone ? ` · &#128222; ${UI.escapeHtml(asesor.phone)}` : ''}</p>`
      : '';
    const share = PS.propertyLink(record);
    const waMsg = `Hola, me interesa: ${type} en ${place} (${op}). Precio publicado: ${Format.currency(record.price)}`;
    const ownWa = waPhone ? PS.whatsappLink(waMsg, waPhone) : '';
    const shareWa = waPhone ? PS.whatsappLink(`${waMsg} Ver: ${share}`, waPhone) : '';

    UI.openModal({
      title: `${type} en ${op.toLowerCase()}`,
      size: 720,
      body: `
        <div class="landing-detail">
          ${gallery}
          <h3>${Format.currency(record.price)}</h3>
          <p class="text-muted">${UI.escapeHtml(place)}</p>
          ${PS.characteristicsText(record) ? `<p><strong>Características:</strong> ${UI.escapeHtml(PS.characteristicsText(record))}</p>` : ''}
          ${record.description ? `<p>${UI.escapeHtml(record.description)}</p>` : ''}
          ${asesorBlock}

          <div style="border-top:1px solid var(--border);margin-top:18px;padding-top:16px;">
            <p style="margin:0 0 10px;font-weight:700;">&#128198;&nbsp; Agenda una visita</p>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;">
              <label style="font-size:13px;">Nombre<input class="form-control" id="prop-date-name" type="text" placeholder="Tu nombre" /></label>
              <label style="font-size:13px;">Fecha<input class="form-control" id="prop-date-date" type="date" /></label>
              <label style="font-size:13px;">Hora<input class="form-control" id="prop-date-time" type="time" /></label>
            </div>
            <button class="btn btn-wa btn-sm" type="button" id="prop-confirm-visit" style="margin-top:12px;" ${ownWa ? '' : 'disabled title="No hay WhatsApp disponible"'}>
              &#128198;&nbsp; Confirmar visita por WhatsApp
            </button>
          </div>

          <div style="border-top:1px solid var(--border);margin-top:18px;padding-top:16px;">
            <p style="margin:0 0 10px;font-weight:700;">&#128176;&nbsp; Calcula tu mensualidad</p>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;">
              <label style="font-size:13px;">Precio<input class="form-control" id="prop-calc-price" type="number" value="${Number(record.price) || ''}" /></label>
              <label style="font-size:13px;">Enganche %<input class="form-control" id="prop-calc-down" type="number" value="10" min="0" max="100" /></label>
              <label style="font-size:13px;">Tasa anual %<input class="form-control" id="prop-calc-rate" type="number" value="10.45" step="0.01" /></label>
              <label style="font-size:13px;">Plazo (años)<input class="form-control" id="prop-calc-years" type="number" value="20" min="1" max="30" /></label>
            </div>
            <div class="text-muted" id="prop-calc-result" style="margin-top:10px;font-size:14px;"></div>
          </div>

          <div style="border-top:1px solid var(--border);margin-top:18px;padding-top:16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;">
            <img src="${PS.qrDataUrl(share, 180)}" alt="QR de la propiedad" style="width:120px;height:120px;border-radius:8px;" />
            <div style="flex:1;min-width:200px;">
              <p style="margin:0 0 6px;font-weight:700;">&#128279;&nbsp; Comparte esta propiedad</p>
              <p class="text-muted" style="font-size:13px;margin:0 0 10px;overflow-wrap:break-word;">${UI.escapeHtml(share)}</p>
              <button class="btn btn-secondary btn-sm" type="button" id="prop-copy-link">&#128203;&nbsp; Copiar enlace</button>
              ${shareWa ? `<a class="btn btn-wa btn-sm" href="${shareWa}" target="_blank" rel="noopener">&#128172;&nbsp; Compartir por WhatsApp</a>` : ''}
            </div>
          </div>
        </div>
      `,
      footer: waPhone
        ? `<a class="btn btn-primary" href="${ownWa}" target="_blank" rel="noopener">Solicitar información por WhatsApp</a>`
        : '',
    });

    const confirmVisit = document.getElementById('prop-confirm-visit');
    if (confirmVisit && ownWa) {
      confirmVisit.addEventListener('click', () => {
        const name = (document.getElementById('prop-date-name').value || '').trim();
        const date = document.getElementById('prop-date-date').value;
        const time = document.getElementById('prop-date-time').value;
        if (!name || !date || !time) {
          UI.toast('Completa tu nombre, fecha y hora.', 'warning');
          return;
        }
        const when = `${new Date(date + 'T' + time).toLocaleString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`;
        const msg = `Hola, quiero AGENDAR una visita para ver: ${type} en ${place} (${op}).\n\nMi nombre: ${name}\nFecha y hora: ${when}\nPrecio publicado: ${Format.currency(record.price)}\n\n¿Está disponible?`;
        window.open(PS.whatsappLink(msg, waPhone), '_blank', 'noopener');
      });
    }

    const copyLink = document.getElementById('prop-copy-link');
    if (copyLink) copyLink.addEventListener('click', () => PS.copyText(share));

    for (const id of ['prop-calc-price', 'prop-calc-down', 'prop-calc-rate', 'prop-calc-years']) {
      const input = document.getElementById(id);
      if (input) input.addEventListener('input', recalc);
    }
    recalc();

    function recalc() {
      const price = Number(document.getElementById('prop-calc-price').value) || 0;
      const down = Number(document.getElementById('prop-calc-down').value) || 0;
      const rate = (Number(document.getElementById('prop-calc-rate').value) || 0) / 100 / 12;
      const years = Number(document.getElementById('prop-calc-years').value) || 0;
      const principal = price * (1 - Math.min(100, Math.max(0, down)) / 100);
      const n = years * 12;
      const out = document.getElementById('prop-calc-result');
      if (!principal || !n || rate <= 0) {
        out.textContent = 'Completa los campos para estimar tu mensualidad.';
        return;
      }
      const payment = (principal * rate * Math.pow(1 + rate, n)) / (Math.pow(1 + rate, n) - 1);
      const totalInterest = payment * n - principal;
      out.innerHTML = `<strong>Mensualidad estimada: ${Format.currency(payment)}</strong> · Financiado: ${Format.currency(principal)} · Intereses: ${Format.currency(totalInterest)}`;
    }
  }

  async function init() {
    await PS.initCommon();

    const url = new URLSearchParams(window.location.search);
    state.asesorId = (url.get('asesorId') || '').trim();
    state.propId = (url.get('prop') || '').trim();
    state.q = (url.get('q') || '').trim();
    state.type = (url.get('type') || '').trim();
    state.operationType = (url.get('operationType') || '').trim();
    state.city = (url.get('city') || '').trim();

    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (el && value) el.value = value;
    };
    setValue('search-q', state.q);
    setValue('search-type', state.type);
    setValue('search-operation', state.operationType);
    setValue('search-city', state.city);

    if (state.asesorId) {
      try {
        state.activeAsesor = await window.API.public.asesor(state.asesorId);
      } catch (error) {
        state.activeAsesor = null;
      }
    }

    const form = document.getElementById('search-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        state.q = (document.getElementById('search-q') ? document.getElementById('search-q').value : '').trim();
        state.operationType = document.getElementById('search-operation').value;
        state.type = document.getElementById('search-type').value;
        state.city = document.getElementById('search-city').value;
        state.page = 1;
        const qs = [
          state.q ? `q=${encodeURIComponent(state.q)}` : '',
          state.operationType ? `operationType=${encodeURIComponent(state.operationType)}` : '',
          state.type ? `type=${encodeURIComponent(state.type)}` : '',
          state.city ? `city=${encodeURIComponent(state.city)}` : '',
          state.asesorId ? `asesorId=${encodeURIComponent(state.asesorId)}` : '',
        ].filter(Boolean).join('&');
        history.replaceState(null, '', `propiedades.html${qs ? '?' + qs : ''}`);
        loadProperties();
      });
    }

    if (!PS.state.catalogDisabled) {
      await loadProperties();
    } else {
      const el = grid();
      if (el) el.innerHTML = '<p class="text-muted landing-empty">El catálogo estará disponible próximamente.</p>';
    }

    PS.initNewsletter();
    PS.initAssistant();

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

document.addEventListener('DOMContentLoaded', () => window.PropiedadesPage.init());