'use strict';

// ─── Página pública de INMOBLES: módulo común ───────────────────────────────
// Datos de contacto, helpers de WhatsApp/enlaces/QR, config de header+footer,
// newsletter, asistente virtual y navegación. Lo usan landing (Inicio),
// propiedades, equipo, servicios, contacto y asesor.html.
window.PublicSite = (() => {
  const OWNER_WHATSAPP = '5216623188580';
  const OWNER_PHONE = '+5216623188580';
  const OWNER_PHONE_DISPLAY = '+52 1 662 318 8580';
  const OWNER_EMAIL = 'asesor@inmobiliaria.com';
  const OWNER_WEBSITE = 'https://inmobles.com';
  const AGENCY = 'INMOBLES';

  // Datos del DESARROLLADOR de la plataforma (FCO / FVO DIGITAL HMO). NO son
  // los datos de contacto de la inmobiliaria: se usan SOLO en la promo del pie
  // de página ("¿Te interesa un proyecto como este?"). El número de contacto de
  // la inmobiliaria (Alberto) sigue siendo OWNER_* más arriba.
  const DEV_WHATSAPP = '5216625374491';
  const DEV_PHONE = '+526625374491';
  const DEV_PHONE_DISPLAY = '662 537 4491';

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
    whatsapp: '',
    agencyName: AGENCY,
    websiteUrl: OWNER_WEBSITE,
    email: OWNER_EMAIL,
    catalogDisabled: false,
  };

  function digits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  // Normaliza a los dígitos que wa.me espera, con la lada del país una sola
  // vez (evita enlaces 5252… cuando el número ya traía +52 o 0052).
  function waNumber(value, countryCode = '52') {
    let d = digits(value);
    if (!d) return '';
    const cc = String(countryCode);
    if (d.indexOf('00') === 0) d = d.slice(2);
    if (d.indexOf(cc + cc) === 0) d = d.slice(cc.length);
    if (d.length > 10 && d.charAt(0) === '0') d = d.replace(/^0+/, '');
    if (d.length === cc.length + 11 && d.indexOf(`${cc}1`) === 0) d = cc + d.slice(cc.length + 1);
    if (d.length === 10) d = cc + d;
    return d;
  }

  // Convierte un número (con código de país) al formato amigable "+52 1 662 318 8580".
  function formatPhone(value, fallback) {
    const d = digits(value);
    if (!d) return fallback || '';
    let local = d;
    if (local.length === 13 && local.startsWith('521')) local = local.slice(3);
    else if (local.length === 12 && local.startsWith('52')) local = local.slice(2);
    if (local.length === 10) return `+52 1 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
    return d;
  }

  // Enlace de WhatsApp. Si no se pasa número usa el del negocio (state.whatsapp).
  function whatsappLink(text, phone) {
    const num = waNumber(phone || state.whatsapp);
    if (!num) return '';
    return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
  }

  // Enlace público directo a la ficha de una propiedad (deep-link).
  function propertyLink(record) {
    const base = window.location.origin && window.location.origin !== 'null' ? window.location.origin : '';
    return `${base}/propiedades.html?prop=${encodeURIComponent(String(record._id))}`;
  }

  function qrDataUrl(text, size) {
    const s = size || 180;
    if (window.PublicQR) return window.PublicQR.toDataUrl(text, s);
    return `https://api.qrserver.com/v1/create-qr-code/?size=${s}x${s}&margin=8&data=${encodeURIComponent(String(text))}`;
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
    if (window.UI) UI.toast('Enlace copiado', 'success');
  }

  function label(record) {
    return TYPE_LABELS[record.type] || record.type || 'Inmueble';
  }

  function opText(record) {
    return (record.operationType || '').toUpperCase();
  }

  function placeText(record) {
    return [record.address, record.zone, record.city, record.state].filter(Boolean).join(', ') || 'Sin ubicación';
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

  function asesorOf(record) {
    const a = record.responsibleUser;
    if (!a) return null;
    return typeof a === 'object' ? a : null;
  }

  // ── Config de contacto (header + footer) desde settings/backend ──────────
  function applyConfig(settings) {
    const s = settings || {};
    const l = s.landing || {};
    state.whatsapp = waNumber(l.whatsappNumber || s.whatsappNumber || OWNER_WHATSAPP);
    state.agencyName = s.agencyName || l.agencyName || AGENCY;
    state.websiteUrl = l.websiteUrl || s.websiteUrl || OWNER_WEBSITE;
    state.email = l.contactEmail || s.contactEmail || OWNER_EMAIL;
    state.catalogDisabled = l.catalogEnabled === false;

    const phone = state.whatsapp ? `+${state.whatsapp}` : OWNER_PHONE;
    const display = formatPhone(state.whatsapp || phone, OWNER_PHONE_DISPLAY);

    const text = (id, value) => {
      const el = document.getElementById(id);
      if (el && value) el.textContent = value;
    };
    const href = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.href = value || '';
    };
    const inner = (id, value) => {
      const el = document.getElementById(id);
      if (el && value) el.innerHTML = value;
    };

    text('brand-name', state.agencyName);
    text('brand-tagline', l.brandTagline || 'Profesionales en Negocios Inmobiliarios');
    text('footer-brand', state.agencyName);

    href('header-phone', `tel:${phone}`);
    text('header-phone-text', display);
    href('footer-phone', `tel:${phone}`);
    text('footer-phone-text', display);

    const waUrl = state.whatsapp ? `https://wa.me/${state.whatsapp}` : '';
    const waLabel = state.whatsapp ? `WhatsApp ${formatPhone(state.whatsapp, display)}` : 'WhatsApp';
    inner('header-wa', state.whatsapp ? `&#128172; ${waLabel}` : '');
    if (document.getElementById('header-wa')) document.getElementById('header-wa').href = waUrl;
    inner('footer-wa', state.whatsapp ? `&#128172; ${waLabel}` : '&#128172; WhatsApp');
    href('footer-wa', waUrl);
    href('footer-email', state.email ? `mailto:${state.email}` : '');
    href('nav-website', state.websiteUrl);
    href('footer-website', state.websiteUrl);

    href('cta-wa-float', waUrl);
    href('cta-call-float', `tel:${phone}`);

    // Promo de marca del DESARROLLADOR (FCO · FVO DIGITAL HMO) al pie de la
    // página pública: "¿Te interesa un proyecto como este? Llámame 662 537 4491".
    // Es independiente del contacto de la inmobiliaria (Alberto, OWNER_*).
    const promoTel = document.getElementById('footer-promo-tel');
    if (promoTel) {
      promoTel.href = `tel:${DEV_PHONE}`;
      promoTel.textContent = `Llámame ${DEV_PHONE_DISPLAY}`;
    }
  }

  // ── Navegación: menú hamburguesa + anclas suaves ─────────────────────────
  function initNav() {
    const toggle = document.getElementById('nav-toggle');
    const nav = document.getElementById('landing-nav');
    if (toggle && nav) {
      toggle.addEventListener('click', function onToggle() {
        nav.classList.toggle('open');
        this.classList.toggle('active');
      });
    }
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

  /**
   * Inicializa lo común de cualquier página pública:
   *  - año del footer, service worker, menú,
   *  - carga settings públicos y aplica teléfonos/redes/website de la página.
   * Devuelve settings (o null si no hay backend).
   */
  async function initCommon() {
    const year = document.getElementById('footer-year');
    if (year) year.textContent = String(new Date().getFullYear());

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    initNav();

    let settings = null;
    try {
      settings = await window.API.settings.public();
    } catch (error) {
      settings = null;
    }
    applyConfig(settings);
    return settings;
  }

  // ── Newsletter ───────────────────────────────────────────────────────────
  function initNewsletter() {
    const form = document.getElementById('newsletter-form');
    const msg = document.getElementById('newsletter-msg');
    if (!form) return;
    const emailInput = document.getElementById('newsletter-email');
    // Valida la estructura de un correo: algo@dominio.ext
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (emailInput) {
      emailInput.setAttribute('type', 'email');
      const liveCheck = () => {
        if (!msg) return;
        const v = emailInput.value.trim();
        if (v && !EMAIL_RE.test(v)) {
          msg.textContent = 'Escribe un correo válido, por ejemplo: nombre@correo.com';
          msg.classList.remove('ok');
          msg.classList.add('err');
        } else if (v) {
          msg.textContent = '';
          msg.classList.remove('ok', 'err');
        }
      };
      emailInput.addEventListener('input', liveCheck);
      emailInput.addEventListener('blur', liveCheck);
    }
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = emailInput;
      const value = (email && email.value.trim()) || '';
      const show = (text, kind) => {
        if (msg) {
          msg.textContent = text;
          msg.classList.remove('ok', 'err');
          if (kind) msg.classList.add(kind);
        }
      };
      if (!value) {
        show('Escribe tu correo electrónico.', 'err');
        if (email) email.focus();
        return;
      }
      if (!EMAIL_RE.test(value)) {
        show('Ese correo no parece válido. Verifica la estructura, p. ej. nombre@correo.com', 'err');
        if (email) email.focus();
        return;
      }
      const btn = form.querySelector('button[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.classList.add('loading');
      }
      try {
        const result = await window.API.public.newsletterSubscribe({ email: value });
        show(result.message || '¡Gracias por suscribirte!', 'ok');
        form.reset();
      } catch (error) {
        show(error.message || 'No se pudo suscribir. Intenta de nuevo.', 'err');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.classList.remove('loading');
        }
      }
    });
  }

  // ── Asistente virtual (chat públic, responde desde el backend) ───────────

  // Tips que aparecen UNA SOLA VEZ al lado de la burbuja del asistente.
  // Para "alimentar" el sistema con más mensajes, basta con agregar aquí otro
  // objeto { id, text, icon }: cada id se muestra una sola vez por navegador y
  // se van mostrando en orden en las siguientes visitas.
  const ASSISTANT_TIPS = [
    { id: 'bubble_help', text: '¡Da clic aquí en la burbuja para ayudarte!', icon: '&#128070;' },
  ];
  const ASSISTANT_TIPS_KEY = 'inmobles_assistant_tips_seen';

  function assistantSeenTips() {
    try {
      const raw = localStorage.getItem(ASSISTANT_TIPS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function markAssistantTipSeen(id) {
    try {
      const seen = assistantSeenTips();
      if (!seen.includes(id)) {
        seen.push(id);
        localStorage.setItem(ASSISTANT_TIPS_KEY, JSON.stringify(seen));
      }
    } catch (e) { /* almacenamiento bloqueado: el tip se sigue mostrando */ }
  }

  function showAssistantTip(widget, toggle) {
    const seen = assistantSeenTips();
    const tip = ASSISTANT_TIPS.find((t) => t && t.id && t.text && !seen.includes(t.id));
    if (!tip || !widget || !toggle) return;

    const bubble = document.createElement('div');
    bubble.className = 'landing-assistant-tip';
    bubble.setAttribute('role', 'status');

    const icon = document.createElement('span');
    icon.className = 'landing-assistant-tip-icon';
    icon.innerHTML = tip.icon || '&#128070;';
    const text = document.createElement('span');
    text.className = 'landing-assistant-tip-text';
    text.textContent = tip.text;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'landing-assistant-tip-close';
    close.setAttribute('aria-label', 'Cerrar mensaje');
    close.innerHTML = '&times;';
    bubble.append(icon, text, close);
    widget.insertBefore(bubble, toggle);

    let timer = null;
    const dismiss = () => {
      if (timer) clearTimeout(timer);
      markAssistantTipSeen(tip.id);
      if (!bubble.isConnected) return;
      bubble.classList.add('is-leaving');
      setTimeout(() => bubble.remove(), 320);
    };
    close.addEventListener('click', dismiss);
    // Si abre el asistente, el tip ya cumplió su objetivo.
    toggle.addEventListener('click', dismiss, { once: true });
    timer = setTimeout(dismiss, 14000);
  }

  function initAssistant() {
    const root = document.getElementById('assistant-root');
    if (!root) return;

    // En celular el teclado virtual encoge el viewport visible. Sincronizamos
    // dos variables CSS para que el panel se ajuste y el campo nunca quede
    // tapado por el teclado (funciona aunque el navegador no soporte dvh).
    const syncViewport = () => {
      const vv = window.visualViewport;
      const height = vv ? vv.height : window.innerHeight;
      const keyboard = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      root.style.setProperty('--ast-vh', `${Math.round(height)}px`);
      root.style.setProperty('--ast-kb', `${Math.round(keyboard)}px`);
    };
    syncViewport();
    window.addEventListener('resize', syncViewport);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncViewport);
      window.visualViewport.addEventListener('scroll', syncViewport);
    }

    root.innerHTML = `
      <div class="landing-assistant-widget">
        <div class="landing-assistant-panel" id="ast-panel" hidden>
          <div class="landing-assistant-head">
            <strong>Asistente INMOBLES</strong>
            <button type="button" class="landing-assistant-close" id="ast-close" aria-label="Cerrar">&times;</button>
          </div>
          <div class="landing-assistant-body" id="ast-body">
            <div class="landing-assistant-msg bot ast-enter">¡Hola! Soy el asistente de INMOBLES. ¿Qué buscas? Pregunta por propiedades, precios, financiamiento o cómo agendar una visita.</div>
          </div>
          <form class="landing-assistant-input" id="ast-form">
            <input class="form-control" id="ast-q" type="text" placeholder="Escribe tu pregunta..." autocomplete="off" />
            <button class="btn btn-primary btn-sm" type="submit">&#10148;</button>
          </form>
        </div>
        <button class="landing-assistant-toggle" id="ast-toggle" type="button">&#128172;&nbsp; ¿Te ayudamos?</button>
      </div>
    `;

    const panel = document.getElementById('ast-panel');
    const body = document.getElementById('ast-body');
    const toggle = document.getElementById('ast-toggle');
    const close = document.getElementById('ast-close');
    const form = document.getElementById('ast-form');
    const input = document.getElementById('ast-q');

    const appendMsg = (text, who) => {
      const div = document.createElement('div');
      div.className = `landing-assistant-msg ${who} ast-enter`;
      div.textContent = text;
      body.appendChild(div);
      body.scrollTop = body.scrollHeight;
      return div;
    };

    // Indicador de "escribiendo" mientras llega la respuesta del backend.
    const appendTyping = () => {
      const div = document.createElement('div');
      div.className = 'landing-assistant-msg bot landing-assistant-typing';
      div.setAttribute('aria-label', 'El asistente está escribiendo');
      div.innerHTML = '<span></span><span></span><span></span>';
      body.appendChild(div);
      body.scrollTop = body.scrollHeight;
      return div;
    };

    toggle.addEventListener('click', () => {
      const opening = panel.hidden;
      panel.hidden = !opening;
      if (opening && input) input.focus();
    });
    close.addEventListener('click', () => { panel.hidden = true; });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      appendMsg(q, 'user');
      input.value = '';
      const typing = appendTyping();
      try {
        const res = await window.API.public.assistant({ question: q });
        typing.remove();
        appendMsg((res && res.answer) || 'No pude responder en este momento.', 'bot');
      } catch (error) {
        typing.remove();
        appendMsg('No pude conectar con el asistente. Intenta de nuevo.', 'bot');
      }
    });

    // Tip de bienvenida: se muestra una sola vez, justo encima de la burbuja.
    showAssistantTip(root.querySelector('.landing-assistant-widget'), toggle);
  }

  return {
    state,
    digits,
    formatPhone,
    whatsappLink,
    propertyLink,
    qrDataUrl,
    copyText,
    applyConfig,
    initCommon,
    initNav,
    initNewsletter,
    initAssistant,
    label,
    opText,
    placeText,
    characteristicsText,
    asesorOf,
    TYPE_LABELS,
  };
})();