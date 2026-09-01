'use strict';

/*
 * Mantenimiento programado (CRM).
 *
 * Módulo global inyectado por el shell (multipage.js) en todas las páginas
 * protegidas del CRM. Consulta el estado público en /api/config/mantenimiento
 * (polling) y escucha los eventos Socket.io para gestionar:
 *
 *   a) BANNER DE AVISO PREVIO: cuando hay un mantenimiento programado a futuro
 *      con mostrarAvisoPrevio, se muestra un banner superior fijo para los
 *      roles de consumo (Asesor/Operador) con la fecha/hora y el mensaje.
 *
 *   b) CUENTA REGRESIVA DE 5 MIN: cuando enCuentaRegresiva está activo, se
 *      muestra un modal flotante (no bloqueante) con el contador calculado con
 *      base en finCuentaRegresiva y la hora actual. Al llegar a 00:00 se ejecuta
 *      localStorage.clear(), se invalida la sesión y se redirige a la pantalla
 *      de mantenimiento.
 *
 *   c) MANTENIMIENTO ACTIVO: si mantenimientoActivo=true, los roles de consumo
 *      se redirigen de inmediato a la pantalla de bloqueo.
 *
 * Roles de consumo (afectados): Asesor/Operador.
 * Roles exentos (no se interrumpen): ADMIN y SUPERADMIN.
 */

window.Mantenimiento = (() => {
  const POLL_INTERVAL_MS = 20000;
  const EXEMPT_ROLES = ['admin', 'superadmin'];

  let timer = null;
  let countdownTimer = null;
  let currentRole = '';
  let currentMessage = '';
  let countdownEndTime = null;
  let modalEl = null;
  let bannerEl = null;
  let alreadyLoggedOut = false;
  let solicitaLogout = false;

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

  // Los roles afectados son los que NO están exentos (Asesor/Operador/otros).
  function esAfectado() {
    return !EXEMPT_ROLES.includes(currentRole);
  }

  function maintenanceUrl() {
    const params = [];
    if (currentMessage) params.push(`m=${encodeURIComponent(currentMessage)}`);
    return params.length ? `/mantenimiento.html?${params.join('&')}` : '/mantenimiento.html';
  }

  // Auto-logout: limpia localStorage y redirige a la pantalla de mantenimiento.
  function autoLogout() {
    if (alreadyLoggedOut || !esAfectado()) return;
    alreadyLoggedOut = true;
    stopTimers();
    removeModal();
    removeBanner();
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
        .then((r) => r.json())
        .then((data) => resolve(data && data.data ? data.data : null))
        .catch(() => resolve(null));
    });
  }

  async function check() {
    const estado = await fetchEstado();
    if (!estado) return;
    currentMessage = estado.mensaje || currentMessage;

    // 1) MANTENIMIENTO ACTIVO → salida inmediata para roles afectados.
    if (estado.mantenimientoActivo === true || estado.activo === true) {
      autoLogout();
      return;
    }

    // 2) CUENTA REGRESIVA activa → modal con contador en vivo.
    if (estado.enCuentaRegresiva && estado.finCuentaRegresiva) {
      const end = new Date(estado.finCuentaRegresiva).getTime();
      startCountdown(end);
      return;
    }

    // 3) MANTENIMIENTO PROGRAMADO A FUTURO → banner de aviso previo.
    if (estado.programado && estado.mostrarAvisoPrevio && estado.fechaProgramada) {
      removeModalIfNotNeeded();
      showBanner(estado.fechaProgramada);
      return;
    }

    // Sin mantenimiento: limpiar.
    removeModalIfNotNeeded();
    removeBanner();
  }

  // ---- Cuenta regresiva (modal flotante no bloqueante) ----
  function startCountdown(endTime) {
    if (!esAfectado()) return;
    if (modalEl && countdownEndTime === endTime) return; // ya en curso
    countdownEndTime = endTime;
    renderModal();
    // Sincroniza inmediatamente y luego cada segundo.
    updateCountdown();
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(updateCountdown, 1000);
  }

  function updateCountdown() {
    if (countdownEndTime === null) return;
    const remaining = Math.max(0, Math.floor((countdownEndTime - Date.now()) / 1000));
    updateModalTime(remaining);
    if (remaining <= 0) autoLogout();
  }

  function pad(n) { return String(n).padStart(2, '0'); }
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

  function removeModalIfNotNeeded() {
    // Solo se limpia si ya no hay cuenta regresiva activa.
    removeModal();
  }

  // ---- Banner de aviso previo (superior fijo) ----
  function showBanner(fechaProgramada) {
    if (!esAfectado()) return;
    if (bannerEl) {
      // Actualiza si el mensaje/fecha cambió.
      const msgEl = bannerEl.querySelector('.mtn-banner-msg');
      const dateEl = bannerEl.querySelector('.mtn-banner-date');
      if (msgEl) msgEl.textContent = currentMessage || '';
      if (dateEl) dateEl.textContent = formatFecha(fechaProgramada);
      return;
    }
    const b = document.createElement('div');
    b.id = 'mtn-aviso-banner';
    b.innerHTML = `
      <div class="mtn-banner-inner">
        <span class="mtn-banner-icon">&#9888;&#65039;</span>
        <div>
          <strong class="mtn-banner-title">Aviso del Sistema:</strong>
          <span class="mtn-banner-date">Mantenimiento programado para ${formatFecha(fechaProgramada)}.</span>
          <span class="mtn-banner-msg">${escapeHtml(currentMessage || '')}</span>
        </div>
      </div>`;
    document.body.appendChild(b);
    bannerEl = b;
  }

  function removeBanner() {
    if (bannerEl) { bannerEl.remove(); bannerEl = null; }
  }

  function formatFecha(iso) {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return 'el ' + d.toLocaleString('es-MX', {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch (e) { return ''; }
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function stopTimers() {
    if (timer) { clearInterval(timer); timer = null; }
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  }

  // Suscripción a eventos Socket.io para respuestas inmediatas.
  function wireSocket() {
    if (!window.Realtime || !window.Realtime.connect) return;
    window.Realtime.connect().then((socket) => {
      if (!socket) return;
      socket.on('mantenimiento-alerta', (payload) => {
        if (!esAfectado()) return;
        currentMessage = (payload && payload.mensaje) || currentMessage;
        if (payload && payload.fechaProgramada) showBanner(payload.fechaProgramada);
      });
      socket.on('mantenimiento-countdown', (payload) => {
        if (!esAfectado()) return;
        if (payload && payload.fin) { autoLogout(); return; }
        if (payload && payload.finCuentaRegresiva) {
          startCountdown(new Date(payload.finCuentaRegresiva).getTime());
        }
      });
      socket.on('mantenimiento-iniciado', () => {
        if (esAfectado()) autoLogout();
      });
      socket.on('mantenimiento-desactivado', () => {
        removeModal(); removeBanner();
      });
    }).catch(() => {});
  }

  function init() {
    currentRole = currentUserRole();
    if (!window.ApiClient.isAuthenticated()) return;
    stopTimers();
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
      /* Banner de aviso previo (superior fijo) */
      #mtn-aviso-banner {
        position: fixed; top: 0; left: 0; right: 0; z-index: 99998;
        background: linear-gradient(90deg, #7f1d1d, #991b1b); color: #fff;
        box-shadow: 0 4px 18px rgba(0,0,0,.3); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        padding: 9px 16px; display: flex; justify-content: center;
      }
      .mtn-banner-inner { display: flex; align-items: flex-start; gap: 10px; max-width: 1100px; width: 100%; font-size: 13px; line-height: 1.45; }
      .mtn-banner-icon { font-size: 16px; }
      .mtn-banner-title { font-weight: 800; }
      .mtn-banner-date { font-weight: 600; color: #fde68a; }
      .mtn-banner-msg { display: block; color: #fecaca; }

      /* Modal de cuenta regresiva (flotante, no bloqueante) */
      #mtn-countdown-modal {
        position: fixed; right: 16px; bottom: 16px; z-index: 99999;
        width: 330px; max-width: calc(100vw - 32px);
        box-shadow: 0 18px 50px rgba(0,0,0,.4); border-radius: 16px;
        overflow: hidden; animation: mtn-in .3s ease;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      @keyframes mtn-in { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      .mtn-card { background: linear-gradient(135deg, #871f1f, #5a0f0f); color: #fff; padding: 18px; text-align: center; }
      .mtn-brand { display:flex; justify-content:center; align-items:center; gap:8px; margin-bottom: 10px; }
      .mtn-logo { height: 26px; width:auto; object-fit:contain; }
      .mtn-logo-fallback { display:none; font-weight:800; letter-spacing:1px; color:#f3c86b; font-size:14px; }
      .mtn-icon { font-size: 30px; line-height: 1; }
      .mtn-title { font-weight: 800; font-size: 16px; margin: 8px 0 4px; letter-spacing:.2px; }
      .mtn-msg { font-size: 13px; opacity:.92; line-height:1.4; margin-bottom: 12px; }
      .mtn-timer { background: rgba(0,0,0,.28); border-radius: 12px; padding: 12px; margin: 8px 0; }
      .mtn-time { display:block; font-size: 44px; font-weight: 800; font-variant-numeric: tabular-nums; color:#f3c86b; }
      .mtn-timer-label { display:block; font-size: 11px; opacity:.85; margin-top:4px; }
      .mtn-note { font-size: 11px; opacity:.78; }

      @media (max-width: 420px) {
        #mtn-countdown-modal { right: 10px; bottom: 10px; }
      }
    `;
    document.head.appendChild(style);
  })();

  return { init, check };
})();
