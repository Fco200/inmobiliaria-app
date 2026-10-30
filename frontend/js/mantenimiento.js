'use strict';

/*
 * Mantenimiento programado (CRM).
 *
 * Módulo global inyectado por el shell (multipage.js) en todas las páginas
 * protegidas del CRM. Consulta el estado público en /api/config/mantenimiento
 * (polling) y escucha los eventos Socket.io para gestionar:
 *
 *   a) CUENTA REGRESIVA (aviso previo): cuando enCuentaRegresiva está activo,
 *      se muestra un modal flotante no bloqueante con el contador (la ventana
 *      de gracia para guardar el trabajo). Al llegar a 00:00 el sistema pasa a
 *      mantenimiento activo automáticamente.
 *
 *   b) MANTENIMIENTO ACTIVO: los roles afectados ven una capa de bloqueo a
 *      pantalla completa con el mensaje (MANTENIMIENTO ACTIVO) y SOLO un botón
 *      SALIR. El resto de la aplicación queda inaccesible en su pantalla.
 *
 * Roles afectados (bloqueados): Asesor, Admin y Gerencia.
 * Rol exento (no se interrumpe): SUPERADMIN (Soporte Técnico).
 *
 * El index (login) y el panel de soporte NUNCA se bloquean: el superadmin debe
 * poder entrar siempre para activar/desactivar el mantenimiento.
 */

window.Mantenimiento = (() => {
  const POLL_INTERVAL_MS = 15000;
  const EXEMPT_ROLES = ['superadmin'];

  let timer = null;
  let countdownTimer = null;
  let currentRole = '';
  let currentMessage = '';
  let hasta = '';
  let countdownEndTime = null;
  let modalEl = null;
  let overlayEl = null;

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

  // Los roles afectados son los que NO están exentos (Asesor/Admin/Gerencia).
  function esAfectado() {
    return !EXEMPT_ROLES.includes(currentRole);
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
        .then((r) => r.json())
        .then((data) => resolve(data && data.data ? data.data : null))
        .catch(() => resolve(null));
    });
  }

  async function check() {
    const estado = await fetchEstado();
    if (!estado) {
      removeOverlay();
      removeModal();
      return;
    }
    currentMessage = estado.mensaje || '';
    hasta = estado.hasta || '';

    // MANTENIMIENTO ACTIVO → capa de bloqueo a pantalla completa (solo SALIR).
    if (estado.mantenimientoActivo === true || estado.activo === true) {
      if (!esAfectado()) {
        removeOverlay();
        removeModal();
      } else {
        removeModal();
        showOverlay();
      }
      stopCountdownTimer();
      return;
    }

    // No está activo: asegurarse de que no quede nada bloqueado.
    removeOverlay();

    // CUENTA REGRESIVA (aviso previo) → modal flotante con contador.
    if (estado.enCuentaRegresiva === true && estado.finCuentaRegresiva) {
      if (esAfectado()) startCountdown(estado.finCuentaRegresiva);
      return;
    }

    // Sin mantenimiento activo ni cuenta regresiva.
    removeModal();
    stopCountdownTimer();
  }

  // ---- Cuenta regresiva (modal flotante no bloqueante) ----
  function startCountdown(endTime) {
    if (!esAfectado()) return;
    if (modalEl && countdownEndTime === endTime) return; // ya en curso
    countdownEndTime = endTime;
    renderModal();
    updateCountdown();
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(updateCountdown, 1000);
  }

  function stopCountdownTimer() {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    countdownEndTime = null;
  }

  function updateCountdown() {
    if (countdownEndTime === null) return;
    const remaining = Math.max(0, Math.floor((countdownEndTime - Date.now()) / 1000));
    updateModalTime(remaining);
    if (remaining <= 0) {
      // Al expirar la cuenta regresiva el job backend activa el mantenimiento;
      // aquí forzamos la capa de bloqueo por si llega antes el poll.
      stopCountdownTimer();
      removeModal();
      showOverlay();
    }
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function formatTime(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
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
        <div class="mtn-title">&#9888;&#65039; El mantenimiento está por comenzar</div>
        <div class="mtn-msg"></div>
        <div class="mtn-timer">
          <span class="mtn-time">--:--</span>
          <span class="mtn-timer-label">minutos para guardar tus cambios pendientes</span>
        </div>
        <div class="mtn-note">Guarda tu trabajo antes de que finalice la cuenta regresiva.</div>
      </div>`;
    document.body.appendChild(overlay);
    modalEl = overlay;
  }

  function updateModalTime(secs) {
    if (!modalEl) return;
    const msgEl = modalEl.querySelector('.mtn-msg');
    if (msgEl) msgEl.textContent = currentMessage || '';
    const timeEl = modalEl.querySelector('.mtn-time');
    if (timeEl) timeEl.textContent = formatTime(secs);
  }

  function removeModal() {
    if (modalEl) { modalEl.remove(); modalEl = null; }
  }

  // ---- Capa de bloqueo MANTENIMIENTO ACTIVO (pantalla completa, solo SALIR) ----
  function showOverlay() {
    if (overlayEl) {
      updateOverlay();
      return;
    }
    const o = document.createElement('div');
    o.id = 'mtn-overlay';
    o.innerHTML = `
      <div class="mtn-block-card">
        <div class="mtn-block-brand">
          <img class="mtn-logo" src="/fv_digital_logo.png.webp" alt="FV DIGITAL"
               onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex';">
          <span class="mtn-logo-fallback">FV DIGITAL</span>
        </div>
        <div class="mtn-block-icon">&#9888;&#65039;</div>
        <div class="mtn-block-badge">MANTENIMIENTO ACTIVO</div>
        <div class="mtn-block-msg">Estamos realizando mejoras. Vuelve en unos momentos.</div>
        <button class="mtn-block-exit" id="mtn-block-exit" type="button">SALIR</button>
      </div>`;
    document.body.appendChild(o);
    overlayEl = o;
    const btn = o.querySelector('#mtn-block-exit');
    if (btn) btn.addEventListener('click', forceLogout);
    // Evitar cualquier interacción detrás de la capa.
    o.addEventListener('pointerdown', (e) => { if (e.target.closest('#mtn-block-exit')) return; e.preventDefault(); });
    updateOverlay();
  }

  function updateOverlay() {
    if (!overlayEl) return;
    const msgEl = overlayEl.querySelector('.mtn-block-msg');
    if (msgEl) {
      msgEl.textContent = (currentMessage && currentMessage.trim())
        ? currentMessage.trim()
        : 'Estamos realizando mejoras. Vuelve en unos momentos.';
    }
    if (hasta) {
      const note = overlayEl.querySelector('.mtn-block-note');
      if (note) note.textContent = `Fin estimado: ${formatFecha(hasta)}`;
    }
  }

  function removeOverlay() {
    if (overlayEl) { overlayEl.remove(); overlayEl = null; }
  }

  // Cierre de sesión definitivo desde la capa de bloqueo (botón SALIR).
  async function forceLogout() {
    try { if (window.API && window.API.auth.logout) await window.API.auth.logout(); } catch (e) { /* ignore */ }
    window.ApiClient.clearToken();
    window.location.replace('index.html');
  }

  function formatFecha(iso) {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleString('es-MX', {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch (e) { return ''; }
  }

  // Suscripción a eventos Socket.io para respuestas inmediatas.
  function wireSocket() {
    if (!window.Realtime || !window.Realtime.connect) return;
    window.Realtime.connect().then((socket) => {
      if (!socket) return;
      socket.on('mantenimiento-countdown', (payload) => {
        if (!esAfectado()) return;
        if (payload && payload.finCuentaRegresiva) {
          currentMessage = (payload && payload.mensaje) || currentMessage;
          startCountdown(payload.finCuentaRegresiva);
        } else {
          check();
        }
      });
      socket.on('mantenimiento-iniciado', () => {
        check();
      });
      socket.on('mantenimiento-desactivado', () => {
        removeOverlay();
        removeModal();
        stopCountdownTimer();
      });
    }).catch(() => {});
  }

  function init() {
    currentRole = currentUserRole();
    if (!window.ApiClient.isAuthenticated()) return;
    if (timer) { clearInterval(timer); timer = null; }
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
      /* Capa de bloqueo MANTENIMIENTO ACTIVO (pantalla completa) */
      #mtn-overlay {
        position: fixed; inset: 0; z-index: 2147483000;
        background: radial-gradient(circle at 30% 20%, #5a0f0f, #16040a 70%);
        display: flex; align-items: center; justify-content: center; padding: 24px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .mtn-block-card {
        background: linear-gradient(135deg, #871f1f, #5a0f0f);
        color: #fff; border-radius: 18px; padding: 34px 34px 26px;
        max-width: 400px; width: 100%; text-align: center;
        box-shadow: 0 24px 70px rgba(0,0,0,.5); border: 1px solid rgba(243,200,107,.25);
        animation: mtn-in .35s ease;
      }
      @keyframes mtn-in { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      .mtn-block-brand { display: flex; justify-content: center; align-items: center; gap: 8px; margin-bottom: 14px; }
      .mtn-logo { height: 26px; width: auto; object-fit: contain; }
      .mtn-logo-fallback { display: none; font-weight: 800; letter-spacing: 1px; color: #f3c86b; font-size: 14px; }
      .mtn-block-icon { font-size: 42px; line-height: 1; }
      .mtn-block-badge {
        display: inline-block; margin: 14px 0 6px; padding: 6px 18px;
        background: #f3c86b; color: #4a0e0e; border-radius: 999px;
        font-weight: 800; font-size: 14px; letter-spacing: 1.5px;
      }
      .mtn-block-msg { font-size: 14px; line-height: 1.6; opacity: .95; margin-bottom: 8px; }
      .mtn-block-note { font-size: 12px; opacity: .7; margin-bottom: 20px; }
      .mtn-block-exit {
        width: 100%; padding: 13px; border: none; border-radius: 10px; cursor: pointer;
        background: #f3c86b; color: #4a0e0e;
        font-size: 14px; font-weight: 800; letter-spacing: 1px; transition: all .2s;
      }
      .mtn-block-exit:hover { filter: brightness(1.1); }

      /* Modal de cuenta regresiva (flotante, no bloqueante) */
      #mtn-countdown-modal {
        position: fixed; right: 16px; bottom: 16px; z-index: 2147482000;
        width: 330px; max-width: calc(100vw - 32px);
        box-shadow: 0 18px 50px rgba(0,0,0,.4); border-radius: 16px;
        overflow: hidden; animation: mtn-in .3s ease;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .mtn-card { background: linear-gradient(135deg, #871f1f, #5a0f0f); color: #fff; padding: 18px; text-align: center; }
      .mtn-brand { display: flex; justify-content: center; align-items: center; gap: 8px; margin-bottom: 10px; }
      .mtn-icon { font-size: 30px; line-height: 1; }
      .mtn-title { font-weight: 800; font-size: 16px; margin: 8px 0 4px; letter-spacing: .2px; }
      .mtn-msg { font-size: 13px; opacity: .92; line-height: 1.4; margin-bottom: 12px; }
      .mtn-timer { background: rgba(0,0,0,.28); border-radius: 12px; padding: 12px; margin: 8px 0; }
      .mtn-time { display: block; font-size: 40px; font-weight: 800; font-variant-numeric: tabular-nums; color: #f3c86b; }
      .mtn-timer-label { display: block; font-size: 11px; opacity: .85; margin-top: 4px; }
      .mtn-note { font-size: 11px; opacity: .78; }

      @media (max-width: 420px) {
        #mtn-countdown-modal { right: 10px; bottom: 10px; }
        .mtn-block-card { padding: 26px 20px 18px; }
      }
    `;
    document.head.appendChild(style);
  })();

  return { init, check };
})();
