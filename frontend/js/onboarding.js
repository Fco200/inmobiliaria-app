// Onboarding: guía rápida de bienvenida paso a paso.
// Se muestra automáticamente a los USUARIOS NUEVOS en su primera sesión
// (cuando el backend reporta hasCompletedOnboarding=false) y puede reabrirse
// desde el botón '?' del encabezado o desde Ayuda en cualquier momento.
// Al terminar, se marca en el backend para no volver a mostrarse sola y, si se
// pasó un callback onFinish (primera sesión), se invita a activar las
// notificaciones.
window.Onboarding = (() => {
  'use strict';

  const LS_SESSION_KEY = 'crm_onboarding_session';

  // La bandera de "mostrado en esta sesión" es POR USUARIO: no se bloquea la
  // guía de un usuario nuevo por el historial dejado por otro usuario en el
  // mismo navegador/dispositivo.
  function sessionKey() {
    const user = (window.ApiClient && window.ApiClient.getStoredUser()) || {};
    const id = user._id || user.id || user.username || 'anon';
    return `${LS_SESSION_KEY}_${id}`;
  }

  const STEPS = [
    {
      icon: '&#128640;',
      title: 'Bienvenido a INMOBLES',
      text: 'Tu CRM inmobiliario: propiedades, clientes, negocios, citas, metas y documentos, todo en un solo lugar. Te mostramos lo esencial en un minuto.',
    },
    {
      icon: '&#129517;',
      title: 'Tu menú lateral',
      text: 'Muévete entre módulos desde el menú lateral. Pulsa el botón (&#9776;) para plegarlo y dejar más espacio a tu trabajo; en el celular se abre como panel deslizante.',
    },
    {
      icon: '&#128172;',
      title: 'Avisos y chat en paneles',
      text: 'Los accesos rápidos de la derecha abren los Avisos y el Chat en un panel flotante, sin salir de la página en la que estás trabajando.',
    },
    {
      icon: '&#127968;',
      title: 'Propiedades y captación',
      text: 'Registra tus avalúos, lleva su historial de precios y administra la captación de nuevas propiedades con fotos y documentos.',
    },
    {
      icon: '&#128230;',
      title: 'Propiedades',
      text: 'Consulta las propiedades que el equipo comparte: filtra por asesor o texto, revisa el mercado y el historial, y abre cualquiera para agendar citas, crear negocios o compartir por WhatsApp. Desde aquí no se publica: eso se hace al captar.',
    },
    {
      icon: '&#129309;',
      title: 'Clientes y negocios',
      text: 'Perfila a tus clientes, haz seguimiento desde prospecting y cierra negocios con promesas, notarías y comisiones.',
    },
    {
      icon: '&#128197;',
      title: 'Agenda y pendientes',
      text: 'Agenda citas, administra tareas y da seguimiento a tus metas; el sistema te recuerda lo importante mediante notificaciones.',
    },
    {
      icon: '&#128221;',
      title: 'Formularios y documentos',
      text: 'Usa los formatos rápidos (p. ej. la Hoja de Visita) y genera documentos oficiales con tu firma digital.',
    },
    {
      icon: '&#128227;',
      title: 'Catálogo público',
      text: 'Publica propiedades en el sitio web, donde tus clientes buscan por zona, tipo, operación y rango de precio.',
    },
    {
      icon: '&#128276;',
      title: 'Activa las notificaciones',
      text: 'Recibe los avisos del CRM al instante en este dispositivo, aunque la app esté cerrada. Si lo prefieres después, puedes activarlas desde tu Perfil.',
    },
    {
      icon: '&#127881;',
      title: 'Estás listo',
      text: 'Haz clic en Finalizar para empezar a operar. Desde Ayuda o el botón (?) puedes ver esta guía cuando quieras.',
    },
  ];

  let active = false;
  let presented = false;
  let pendingOnFinish = null;

  function isNewUser() {
    const user = (window.ApiClient && window.ApiClient.getStoredUser()) || {};
    return !user.hasCompletedOnboarding;
  }

  function isShownThisSession() {
    try { return localStorage.getItem(sessionKey()) === '1'; } catch (e) { return false; }
  }

  function markShownThisSession() {
    try { localStorage.setItem(sessionKey(), '1'); } catch (e) {}
  }

  function renderStep(step, refs) {
    const pct = Math.round(((step + 1) / STEPS.length) * 100);
    refs.body.innerHTML = `
      <div style="text-align:center;">
        <div style="font-size:44px;line-height:1;">${STEPS[step].icon}</div>
        <h3 style="margin:14px 0 6px;">${UI.escapeHtml(STEPS[step].title)}</h3>
        <p class="text-muted" style="font-size:14px;margin:0 auto;max-width:430px;">${UI.escapeHtml(STEPS[step].text)}</p>
        <div class="progress" style="margin-top:20px;"><div class="progress-bar" style="width:${pct}%;"></div></div>
        <small class="text-muted">Paso ${step + 1} de ${STEPS.length}</small>
      </div>
    `;
    refs.btnPrev.style.visibility = step === 0 ? 'hidden' : 'visible';
    refs.btnNext.textContent = step === STEPS.length - 1 ? 'Finalizar' : 'Siguiente';
  }

  function openGuide(opts) {
    if (active) return;
    active = true;

    // Sonido de guía al abrir el onboarding.
    if (window.Sounds) window.Sounds.welcome().catch(() => {});

    const isFirst = !!(opts && opts.firstLogin) || isNewUser();

    const footer = `
      <button class="btn btn-secondary" type="button" data-prev>Anterior</button>
      <button class="btn btn-secondary" type="button" data-skip>${isFirst ? 'Saltar por ahora' : 'Cerrar'}</button>
      <button class="btn btn-primary" type="button" data-next>Siguiente</button>
    `;

    const modal = UI.openModal({
      title: 'Guía rápida de INMOBLES',
      body: '<div class="loading">Cargando...</div>',
      footer,
      size: 560,
    });

    const overlay = modal.bodyEl ? modal.bodyEl.closest('#modal-overlay') : null;
    if (!overlay) {
      active = false;
      return;
    }

    const refs = {
      body: modal.bodyEl,
      btnPrev: overlay.querySelector('[data-prev]'),
      btnNext: overlay.querySelector('[data-next]'),
    };
    let step = 0;

    const finish = async () => {
      markShownThisSession();
      // Sonido de confirmación al finalizar la guía.
      if (window.Sounds) window.Sounds.confirmation().catch(() => {});
      if (isNewUser() && window.ApiClient && window.API && window.API.auth && window.API.auth.completeOnboarding) {
        try {
          await window.API.auth.completeOnboarding();
          const stored = window.ApiClient.getStoredUser();
          if (stored) {
            stored.hasCompletedOnboarding = true;
            try { localStorage.setItem('crm_user', JSON.stringify(stored)); } catch (e) {}
          }
        } catch (e) { /* sin conexión: se reintenta la próxima vez */ }
      }
      // Al terminar (o saltar) la guía, se invoca el callback encadenado. En la
      // primera sesión se usa para invitar a activar las notificaciones.
      if (opts && typeof opts.onFinish === 'function') {
        try { opts.onFinish(); } catch (e) { /* noop */ }
      }
    };

    const close = async () => {
      await finish();
      UI.closeModal();
      active = false;
    };

    overlay.querySelector('[data-skip]').addEventListener('click', close);
    refs.btnPrev.addEventListener('click', () => {
      if (step > 0) { step -= 1; renderStep(step, refs); if (window.Sounds) window.Sounds.step().catch(() => {}); }
    });
    refs.btnNext.addEventListener('click', () => {
      if (step < STEPS.length - 1) { step += 1; renderStep(step, refs); if (window.Sounds) window.Sounds.step().catch(() => {}); }
      else { close(); }
    });

    renderStep(step, refs);
  }

  // Muestra automáticamente solo a usuarios nuevos que aún no culminan la guía.
  function maybeShow(opts) {
    // El callback encadenado (p. ej. invitar a activar notificaciones) se guarda
    // aunque la guía se abra después del mensaje de bienvenida, para no perderlo
    // si la apertura automática ya había quedado en espera.
    if (opts && typeof opts.onFinish === 'function') pendingOnFinish = opts.onFinish;
    if (presented) return;
    presented = true;
    if (!isNewUser()) return;
    if (isShownThisSession()) return;
    // No abrir la guía encima del mensaje de bienvenida si aún está visible.
    if (document.getElementById('welcome-overlay')) {
      // Se reintenta cuando el overlay de bienvenida se cierre.
      const observer = new MutationObserver(() => {
        if (!document.getElementById('welcome-overlay')) {
          observer.disconnect();
          presented = false;
          maybeShow();
        }
      });
      observer.observe(document.body, { childList: true, subtree: false });
      return;
    }
    markShownThisSession();
    openGuide({ firstLogin: true, onFinish: pendingOnFinish });
  }

  // Forzado desde el botón (?) o Ayuda: siempre abierto, sin condición de nuevo usuario.
  function show(opts) {
    presented = true;
    openGuide(opts || {});
  }

  return { show, maybeShow };
})();
