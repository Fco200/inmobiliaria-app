// Onboarding: guía rápida de bienvenida en 5 pasos.
// Se muestra automáticamente a los USUARIOS NUEVOS en su primera sesión
// (cuando el backend reporta hasCompletedOnboarding=false) y puede reabrirse
// desde el botón '?' del encabezado o desde Ayuda en cualquier momento.
// Al terminar, se marca en el backend para no volver a mostrarse sola.
window.Onboarding = (() => {
  'use strict';

  const LS_SESSION_KEY = 'crm_onboarding_session';

  const STEPS = [
    {
      icon: '&#128640;',
      title: 'Bienvenido a INMOBLES',
      text: 'Tu CRM inmobiliario: administra propiedades, clientes, negocios, citas y más desde un solo lugar.',
    },
    {
      icon: '&#127968;',
      title: 'Propiedades y captación',
      text: 'Registra tus avalúos, lleva su historial de precios y administra la captación de nuevas propiedades.',
    },
    {
      icon: '&#129309;',
      title: 'Clientes y negocios',
      text: 'Perfila a tus clientes, haz seguimiento desde prospecting y cierra negocios con promesas y notarías.',
    },
    {
      icon: '&#128221;',
      title: 'Formularios y documentos',
      text: 'Usa los formatos rápidos (p. ej. la Hoja de Visita) y genera documentos oficiales con tu firma digital.',
    },
    {
      icon: '&#128737;',
      title: 'Ayuda y soporte',
      text: 'En el módulo de Ayuda encuentras soporte por WhatsApp, la guía y el cambio de contraseña.',
    },
    {
      icon: '&#127881;',
      title: 'Estás listo',
      text: 'Haz clic en Finalizar para empezar a operar. Desde Ayuda o el botón (?) puedes ver esta guía cuando quieras.',
    },
  ];

  let active = false;
  let presented = false;

  function isNewUser() {
    const user = (window.ApiClient && window.ApiClient.getStoredUser()) || {};
    return !user.hasCompletedOnboarding;
  }

  function isShownThisSession() {
    try { return localStorage.getItem(LS_SESSION_KEY) === '1'; } catch (e) { return false; }
  }

  function markShownThisSession() {
    try { localStorage.setItem(LS_SESSION_KEY, '1'); } catch (e) {}
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
    };

    const close = async () => {
      await finish();
      UI.closeModal();
      active = false;
    };

    overlay.querySelector('[data-skip]').addEventListener('click', close);
    refs.btnPrev.addEventListener('click', () => {
      if (step > 0) { step -= 1; renderStep(step, refs); }
    });
    refs.btnNext.addEventListener('click', () => {
      if (step < STEPS.length - 1) { step += 1; renderStep(step, refs); }
      else { close(); }
    });

    renderStep(step, refs);
  }

  // Muestra automáticamente solo a usuarios nuevos que aún no culminan la guía.
  function maybeShow() {
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
    openGuide({ firstLogin: true });
  }

  // Forzado desde el botón (?) o Ayuda: siempre abierto, sin condición de nuevo usuario.
  function show() {
    presented = true;
    openGuide();
  }

  return { show, maybeShow };
})();
