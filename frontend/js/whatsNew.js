'use strict';

// Aviso de "Lo nuevo llegó" del módulo de Clientes.
// Se muestra una vez por usuario y release; el botón "Novedades" de la barra
// permite volver a verlo. Usa un overlay propio (por encima de los modales y
// por debajo de la bienvenida) para no chocar con UI.openModal.
window.WhatsNew = (() => {
  const RELEASE = 'clientes-2026-11';
  const OVERLAY_ID = 'whatsnew-overlay';
  // Si otro aviso ya está en pantalla, no nos apilamos y tampoco marcamos el
  // aviso como visto: podrá mostrarse al volver a abrir Clientes.
  const BLOCKING_OVERLAYS = '#welcome-overlay, #modal-overlay, #mtn-overlay, #idle-overlay, #ccarta-overlay';

  let active = false;

  function userKey() {
    const user = (window.ApiClient && window.ApiClient.getStoredUser()) || {};
    const id = user._id || user.id || user.username || 'anon';
    return `crm_clients_whatsnew_${RELEASE}_${id}`;
  }

  function isSeen() {
    try { return localStorage.getItem(userKey()) === '1'; } catch (e) { return false; }
  }

  function markSeen() {
    try { localStorage.setItem(userKey(), '1'); } catch (e) { /* almacenamiento bloqueado */ }
  }

  function createParticles(container) {
    for (let i = 0; i < 22; i += 1) {
      const p = document.createElement('span');
      p.className = 'whatsnew-particle';
      const size = 3 + Math.random() * 7;
      p.style.left = `${Math.random() * 100}%`;
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      p.style.animationDuration = `${3.5 + Math.random() * 5}s`;
      p.style.animationDelay = `${Math.random() * 2.5}s`;
      container.appendChild(p);
    }
  }

  function open(opts) {
    if (active || document.getElementById(OVERLAY_ID)) return null;
    active = true;
    markSeen();

    const onClose = (opts && opts.onClose) || null;
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'whatsnew-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'whatsnew-title');

    overlay.innerHTML = `
      <div class="whatsnew-particles" aria-hidden="true"></div>
      <div class="whatsnew-card">
        <button class="whatsnew-close" type="button" aria-label="Cerrar novedades">&times;</button>
        <div class="whatsnew-badge">&#10024; Nueva implementación</div>
        <div class="whatsnew-icon" aria-hidden="true">&#127881;</div>
        <h2 class="whatsnew-title" id="whatsnew-title">¡Lo nuevo llegó!</h2>
        <p class="whatsnew-lead">Clientes ya trabaja con una experiencia más clara, rápida y lista para todo el equipo.</p>
        <ul class="whatsnew-list">
          <li class="whatsnew-item"><span aria-hidden="true">&#128640;</span><span>Embudo con etapas claras, de prospecto a cierre.</span></li>
          <li class="whatsnew-item"><span aria-hidden="true">&#128196;</span><span>Formatos compartidos sin duplicados ni plantillas muertas.</span></li>
          <li class="whatsnew-item"><span aria-hidden="true">&#128202;</span><span>Reportes por rol con tickets, gastos y gerencia visible.</span></li>
          <li class="whatsnew-item"><span aria-hidden="true">&#128276;</span><span>Este aviso se puede volver a abrir cuando quieras.</span></li>
        </ul>
        <button class="btn btn-primary whatsnew-btn" type="button" id="whatsnew-continue">¡Vamos a verlo! &rarr;</button>
        <p class="whatsnew-footer">INMOBLES &times; FV DIGITAL</p>
      </div>
    `;

    document.body.appendChild(overlay);
    createParticles(overlay.querySelector('.whatsnew-particles'));

    function onKeydown(e) {
      if (e.key === 'Escape' || e.key === 'Esc') close();
    }

    function close() {
      if (!active) return;
      active = false;
      document.removeEventListener('keydown', onKeydown);
      overlay.classList.add('closing');
      setTimeout(() => {
        overlay.remove();
        if (onClose) onClose();
      }, 450);
    }

    overlay.querySelector('.whatsnew-close').addEventListener('click', close);
    overlay.querySelector('#whatsnew-continue').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKeydown);

    setTimeout(() => {
      overlay.classList.add('show');
      const btn = overlay.querySelector('#whatsnew-continue');
      if (btn && typeof btn.focus === 'function') btn.focus();
    }, 30);

    return { close };
  }

  function maybeShow() {
    if (isSeen()) return false;
    if (document.querySelector(BLOCKING_OVERLAYS)) return false;
    open();
    return true;
  }

  return { open, maybeShow, isSeen };
})();
