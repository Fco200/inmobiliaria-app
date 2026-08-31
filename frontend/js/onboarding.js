// Onboarding: guía rápida de bienvenida en 5 pasos.
// Se muestra una única vez por sesión y puede omitirse permanentemente
// (checkbox "No volver a mostrar"). Se reabre desde ajustes con
// App.reopenOnboarding().
window.Onboarding = (() => {
  'use strict';

  const LS_KEY = 'crm_welcome_dismissed';

  const STEPS = [
    {
      icon: '&#128640;',
      title: 'Bienvenido a INMOBILES',
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
      icon: '&#128640;',
      title: 'Estás listo',
      text: 'Haz clic en Finalizar para empezar a operar. Desde Ajustes puedes ver esta guía cuando quieras.',
    },
  ];

  let active = false;
  let presented = false;

  function isDismissed() {
    let raw = null;
    try { raw = localStorage.getItem(LS_KEY); } catch (error) {}
    return raw === '1';
  }

  function dismissForever() {
    try { localStorage.setItem(LS_KEY, '1'); } catch (error) {}
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

  function openGuide() {
    if (active) return;
    active = true;

    const footer = `
      <button class="btn btn-secondary" type="button" data-prev>Anterior</button>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-right:auto;cursor:pointer;">
        <input type="checkbox" data-dontshow> No volver a mostrar
      </label>
      <button class="btn btn-secondary" type="button" data-skip>Saltar</button>
      <button class="btn btn-primary" type="button" data-next>Siguiente</button>
    `;

    const modal = UI.openModal({
      title: 'Guía rápida de INMOBILES',
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

    const close = () => { UI.closeModal(); active = false; };

    overlay.querySelector('[data-skip]').addEventListener('click', close);
    overlay.querySelector('[data-dontshow]').addEventListener('change', (e) => {
      if (e.target.checked) dismissForever();
    });
    refs.btnPrev.addEventListener('click', () => {
      if (step > 0) { step -= 1; renderStep(step, refs); }
    });
    refs.btnNext.addEventListener('click', () => {
      if (step < STEPS.length - 1) { step += 1; renderStep(step, refs); }
      else { close(); }
    });

    renderStep(step, refs);
  }

  function maybeShow() {
    if (presented) return;
    presented = true;
    if (isDismissed()) return;
    openGuide();
  }

  // Forzado desde ajustes: ignora la bandera de sesión pero no el "no volver".
  function show() {
    if (isDismissed()) return;
    presented = true;
    openGuide();
  }

  return { show, maybeShow };
})();