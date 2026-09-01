'use strict';

/*
 * Mantenimiento programado (CRM).
 *
 * Módulo global inyectado por el shell (multipage.js) en todas las páginas
 * protegidas del CRM. Gestiona la cuenta regresiva de 5 minutos y el
 * auto-logout para los roles de consumo (Asesor/Operador) cuando hay un
 * mantenimiento activo o programado con aviso previo.
 *
 * Comportamiento por rol:
 *   - Asesor/Operador: se muestra un modal flotante (no bloqueante) con la
 *     cuenta regresiva. Al llegar a 00:00 se limpia localStorage y se redirige
 *     a la pantalla de mantenimiento (auto-logout). Si el mantenimiento YA está
 *     activo, se redirige de inmediato.
 *   - Admin/Gerencia/Superadmin: NO reciben cuenta regresiva ni auto-logout;
 *     pueden seguir trabajando.
 *
 * Mecanismos:
 *   - Polling a GET /api/config/mantenimiento cada 30 s (fuente fiable).
 *   - Eventos Socket.io 'mantenimiento-alerta' / 'mantenimiento-iniciado'
 *     cuando el panel de soporte los emite (real, inmediato).
 */

window.Mantenimiento = (() => {
  const POLL_INTERVAL_MS = 30000;
  const CONSUMER_ROLES = ['asesor', 'operador'];

  let timer = null;
  let countdownTimer = null;
  let currentRole = '';
  let currentMessage = '';
  let countdownSecs = 0;
  let countdownEndTime = null;
  let modalEl = null;
  let alreadyLoggedOut = false;

  function baseUrl() {
    if (window.AppConfig && window.AppConfig.API_URL) return window.AppConfig.API_URL;
    return window.location.origin + '/api';
  }

  function currentUserRole() {
    if (!window.ApiClient || !window.ApiClient.getStoredUser) return '';
    const user = window.ApiClient.getStoredUser();
    if (!user || !user.role) return '';
    const role = user.role;
    return (typeof role === 'object' && role !== null ? role.code : role) || (typeof role === 'string' ? role : '');
  }

  function isConsumerRole() {
    return CONSUMER_ROLES.includes(currentRole);
  }

  function maintenanceUrl() {
    const params = [];
    if (currentMessage) params.push(`m=${encodeURIComponent(currentMessage)}`);
    return params.length ? `/mantenimiento.html?${params.join('&')}` : '/mantenimiento.html';
  }

  // Auto-logout: limpia el almacenamiento local y redirige a la pantalla de
  // mantenimiento. Solo debe ejecutarse una vez por sesión.
  function autoLogout() {
    if (alreadyLoggedOut || !isConsumerRole()) return;
    alreadyLoggedOut = true;
    stopTimers();
    removeModal();
    try { localStorage.clear(); } catch (e) { /* sin almacenamiento */ }
    window.location.replace(maintenanceUrl());
  }

  function fetchEstado() {
    return new Promise((resolve) => {
      if (window.API && window.API.config && window.API.config.mantenimiento) {
        window.API.config.mantenimiento().then(resolve).catch(() => resolve(null));
        return;
      }
      fetch(`${baseUrl()}/config/mantenimiento`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })
        .then((r) => (r.ok ? r.json() : r.json()))
        .then((data) => {
          if (data && data.data) resolve(data.data);
          else resolve(null);
        })
        .catch(() => resolve(null));
    });
  }

  async function check() {
    if (!isConsumerRole()) return;
    const estado = await fetchEstado();
    if (!estado) return;

    // Mantenimiento YA activo → salida inmediata.
    if (estado.activo === true || estado.mantenimientoActivo === true) {
      currentMessage = estado.mensaje || '';
      autoLogout();
      return;
    }

    // Mantenimiento programado con aviso previo a 5:00 o menos de comenzar.
    if (
      estado.programado &&
      estado.mostrarAvisoPrevio &&
      estado.fechaProgramada &&
      estado.cuentaRegresiva !== null &&
      estado.cuentaRegresiva !== undefined &&
      estado.cuentaRegresiva > 0 &&
      estado.cuentaRegresiva <= 60 * 5
    ) {
      currentMessage = estado.mensaje || '';
      // La cuenta regresiva llega como segundos hasta fechaProgramada; el modal
      // se muestra si falta 5:00 o menos.
      const secs = Math.min(Math.max(0, Math.round(estado.cuentaRegresiva)), 60 * 5);
      startCountdown(secs, new Date(estado.fechaProgramada).getTime());
    } else if (estado.programado && (!estado.mostrarAvisoPrevio || !estado.fechaProgramada)) {
      removeModal();
    }
  }

  function startCountdown(secs, targetTime) {
    if (modalEl) return; // ya hay una cuenta atrás en curso
    countdownSecs = secs;
    countdownEndTime = targetTime ? targetTime : Date.now() + secs * 1000;
    currentMessage = currentMessage || 'El sistema está en mantenimiento programado. Guarda tu trabajo.';
    renderModal();
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  function tick() {
    if (countdownEndTime === null) return;
    const remaining = Math.max(0, Math.floor((countdownEndTime - Date.now()) / 1000));
    countdownSecs = remaining;
    updateDisplay();
    if (remaining <= 0) autoLogout();
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${pad(m)}:${pad(s)}`;
  }

  function renderModal() {
    removeModal();
    const overlay = document.createElement('div');
    overlay.id = 'mtn-countdown-modal';
    overlay.setAttribute('aria-live', 'assertive');
    overlay.innerHTML = `
      <div class="mtn-card">
        <div class="mtn-brand">
          <img class="mtn-logo" src="/fv_digital_logo.png.webp" alt="FV DIGITAL"
               onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex';">
          <span class="mtn-logo-fallback">FV DIGITAL</span>
        </div>
        <div class="mtn-icon">&#9888;&#65039;</div>
        <div class="mtn-title">Mantenimiento programado</div>
        <div class="mtn-msg"></div>
        <div class="mtn-timer">
          <span class="mtn-time">--:--</span>
          <span class="mtn-timer-label">El sistema se cerrará automáticamente al llegar a 00:00</span>
        </div>
        <div class="mtn-note">Guarda tu trabajo antes de que finalice la cuenta regresiva.</div>
      </div>`;
    document.body.appendChild(overlay);
    modalEl = overlay;
  }

  function removeModal() {
    if (modalEl) {
      const el = modalEl;
      modalEl = null;
      el.remove();
    }
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function updateDisplay() {
    if (!modalEl) return;
    const msgEl = modalEl.querySelector('.mtn-msg');
    if (msgEl) msgEl.textContent = currentMessage || '';
    const timeEl = modalEl.querySelector('.mtn-time');
    if (timeEl) timeEl.textContent = formatTime(countdownSecs);
  }

  function stopTimers() {
    if (timer) { clearInterval(timer); timer = null; }
    removeModal();
  }

  function wireSocket() {
    if (!window.Realtime || !window.Realtime.connect) return;
    window.Realtime.connect()
      .then((socket) => {
        if (!socket) return;
        socket.on('mantenimiento-alerta', (payload) => {
          if (!isConsumerRole()) return;
          currentMessage = (payload && payload.mensaje) || currentMessage;
          const targetTime = payload && payload.fechaProgramada
            ? new Date(payload.fechaProgramada).getTime()
            : Date.now() + 5 * 60 * 1000;
          startCountdown(5 * 60, targetTime);
        });
        socket.on('mantenimiento-iniciado', () => {
          if (!isConsumerRole()) return;
          autoLogout();
        });
      })
      .catch(() => {});
  }

  function init() {
    currentRole = currentUserRole();
    if (!isConsumerRole()) return; // solo Asesor/Operador reciben el aviso
    if (!window.ApiClient.isAuthenticated()) return;
    check();
    timer = setInterval(check, POLL_INTERVAL_MS);
    wireSocket();
  }

  // Estilos inyectados una sola vez.
  (function injectStyles() {
    if (document.getElementById('mtn-styles')) return;
    const style = document.createElement('style');
    style.id = 'mtn-styles';
    style.textContent = `
      #mtn-countdown-modal {
        position: fixed; right: 16px; bottom: 16px; z-index: 99999;
        width: 320px; max-width: calc(100vw - 32px);
        box-shadow: 0 18px 50px rgba(0,0,0,.35); border-radius: 16px;
        overflow: hidden; animation: mtn-in .3s ease;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      @keyframes mtn-in { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      .mtn-card {
        background: linear-gradient(135deg,#871f1f,#5a0f0f);
        color: #fff; padding: 18px; text-align: center;
      }
      .mtn-brand { display:flex; justify-content:center; align-items:center; gap:8px; margin-bottom: 10px; }
      .mtn-logo { height: 26px; width:auto; object-fit:contain; }
      .mtn-logo-fallback { display:none; font-weight:800; letter-spacing:1px; color:#f3c86b; font-size:14px; }
      .mtn-icon { font-size: 30px; line-height: 1; }
      .mtn-title { font-weight: 800; font-size: 16px; margin: 8px 0 4px; letter-spacing:.3px; }
      .mtn-msg { font-size: 13px; opacity:.92; line-height:1.4; margin-bottom: 12px; }
      .mtn-timer { background: rgba(0,0,0,.28); border-radius: 12px; padding: 12px; margin: 8px 0; }
      .mtn-time { display:block; font-size: 42px; font-weight: 800; font-variant-numeric: tabular-nums; color:#f3c86b; }
      .mtn-timer-label { display:block; font-size: 11px; opacity:.85; margin-top:4px; }
      .mtn-note { font-size: 11px; opacity:.75; }
    `;
    document.head.appendChild(style);
  })();

  return { init };
})();
