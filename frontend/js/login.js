'use strict';

window.LoginPage = (() => {
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  function initTheme() {
    let theme = '';
    try {
      theme = localStorage.getItem('crm_theme') || '';
    } catch (error) { /* sin almacenamiento */ }
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    const btn = document.getElementById('btn-theme-login');
    if (btn) {
      btn.innerHTML = theme === 'dark' ? '&#127769;' : '&#9788;';
      btn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('crm_theme', next); } catch (e) { /* silencioso */ }
        btn.innerHTML = next === 'dark' ? '&#127769;' : '&#9788;';
      });
    }
  }

  function setError(message) {
    const box = document.getElementById('login-error');
    const hint = document.getElementById('login-hint');
    if (!box) return;
    if (!message) {
      box.classList.add('hide');
      box.textContent = '';
      if (hint) hint.classList.remove('hide');
      return;
    }
    box.textContent = message;
    box.classList.remove('hide');
    if (hint) hint.classList.add('hide');
  }

  function setLoading(loading) {
    const btn = document.getElementById('btn-login');
    const spinner = document.getElementById('login-spinner');
    if (!btn) return;
    btn.disabled = loading;
    btn.classList.toggle('loading', loading);
    if (spinner) spinner.classList.toggle('hide', !loading);
  }

  async function submit(event) {
    event.preventDefault();
    const form = event.target;
    const identifier = form.querySelector('[name="identifier"]').value.trim();
    const password = form.querySelector('[name="password"]').value;
    const remember = Boolean(form.querySelector('[name="remember"]') && form.querySelector('[name="remember"]').checked);

    if (!identifier || !password) {
      setError('Ingresa tu usuario o correo y tu contraseña.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const result = await window.API.auth.login({ identifier, password, remember });
      window.ApiClient.setLogin(result.token, result.user);
      window.location.replace('home.html');
    } catch (error) {
      // El backend puede responder 503 durante mantenimiento; se traduce.
      if (error && error.status === 503 && error.data && error.data.code === 'MAINTENANCE_MODE') {
        setError((error.data.mantenimiento && error.data.mantenimiento.mensaje) || error.data.message || 'El sistema se encuentra en mantenimiento. Intenta más tarde.');
      } else {
        setError(error.message || 'No se pudo iniciar sesión. Intenta nuevamente.');
      }
      setLoading(false);
    }
  }

  // Muestra en el login los distintos estados de mantenimiento:
  //   - ACTIVO        → capa de bloqueo FV DIGITAL con el mensaje personalizado
  //                     (el backend rechaza a quien no sea admin/superadmin con 503).
  //   - CUENTA REGRESIVA → alerta con contador en vivo ("Mantenimiento en progreso").
  //   - programado con aviso previo → banner de aviso.
  let countdownTick = null;

  function formatNum(n) { return String(n).padStart(2, '0'); }

  function hideAllMaintenance() {
    const banner = document.getElementById('login-maintenance-banner');
    const countdown = document.getElementById('login-countdown-alert');
    const overlay = document.getElementById('login-maintenance-overlay');
    if (banner) banner.classList.add('hide');
    if (countdown) countdown.classList.add('hide');
    if (overlay) overlay.classList.add('hide');
    if (countdownTick) { clearInterval(countdownTick); countdownTick = null; }
  }

  function updateCountdownTimeEnds(fin) {
    const timeEl = document.getElementById('login-countdown-time');
    if (!timeEl) return;
    const end = new Date(fin).getTime();
    const render = () => {
      const secs = Math.max(0, Math.floor((end - Date.now()) / 1000));
      timeEl.textContent = `${formatNum(Math.floor(secs / 60))}:${formatNum(secs % 60)}`;
      if (secs <= 0) refreshMaintenanceStatus();
    };
    render();
    if (countdownTick) clearInterval(countdownTick);
    countdownTick = setInterval(render, 1000);
  }

  function showMaintenanceActive(estado) {
    // DESACTIVADO: la capa de bloqueo del login se ha eliminado. El formulario
    // permanece siempre visible sin importar el estado de mantenimiento.
    return;
  }

  function showMaintenanceCountdown(estado) {
    // DESACTIVADO: la alerta de cuenta regresiva se oculta siempre.
    const countdown = document.getElementById('login-countdown-alert');
    const overlay = document.getElementById('login-maintenance-overlay');
    const banner = document.getElementById('login-maintenance-banner');
    if (banner) banner.classList.add('hide');
    if (overlay) overlay.classList.add('hide');
    if (countdown) countdown.classList.add('hide');
  }

  async function refreshMaintenanceStatus() {
    const banner = document.getElementById('login-maintenance-banner');
    const countdown = document.getElementById('login-countdown-alert');
    const overlay = document.getElementById('login-maintenance-overlay');
    if (!banner && !countdown && !overlay) return;
    try {
      if (!window.API || !window.API.config || !window.API.config.mantenimiento) return;
      const estado = await window.API.config.mantenimiento();

      // 1) MANTENIMIENTO ACTIVO.
      if (estado && (estado.activo === true || estado.mantenimientoActivo === true)) {
        showMaintenanceActive(estado);
        if (countdownTick) { clearInterval(countdownTick); countdownTick = null; }
        return;
      }
      // 2) CUENTA REGRESIVA en curso.
      if (estado && estado.enCuentaRegresiva === true && estado.finCuentaRegresiva) {
        showMaintenanceCountdown(estado);
        if (banner) banner.classList.add('hide');
        return;
      }
      // 3) PROGRAMADO con aviso previo → banner.
      if (estado && estado.programado && estado.mostrarAvisoPrevio) {
        hideAllMaintenance();
        if (banner) {
          const msgEl = document.getElementById('login-maint-msg');
          if (msgEl) msgEl.textContent = (estado.mensaje && estado.mensaje.trim()) || 'Estamos realizando mejoras. Intenta más tarde.';
          banner.classList.remove('hide');
        }
        return;
      }
      // Sin mantenimiento.
      hideAllMaintenance();
    } catch (e) {
      hideAllMaintenance();
    }
  }

  // ---- Registro con Google ----

  let pendingGoogle = null; // { role, roleKey }

  function loadGoogleScript(retries = 2) {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.accounts) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (window.google && window.google.accounts) {
          resolve();
        } else {
          reject(new Error('El SDK de Google se cargó pero no quedó disponible. Recarga la página e inténtalo de nuevo.'));
        }
      };
      script.onerror = () => {
        if (retries > 0) {
          setTimeout(() => {
            script.remove();
            loadGoogleScript(retries - 1).then(resolve).catch(reject);
          }, 900);
        } else {
          reject(
            new Error(
              'No se pudo cargar el SDK de Google. Revisa tu conexión a internet y desactiva bloqueadores de anuncios o proxys (VPN).'
            )
          );
        }
      };
      document.head.appendChild(script);
    });
  }

  async function refreshGoogleStatus() {
    const status = document.getElementById('google-status');
    if (!status) return;
    try {
      const info = await window.API.settings.public();
      status.textContent = info.googleClientIdConfigured ? 'Google disponible' : 'Google por configurar';
      status.dataset.ready = info.googleClientIdConfigured ? '1' : '0';
    } catch (error) {
      status.textContent = 'Servidor no disponible';
      status.dataset.ready = '0';
    }
  }

  function openRoleModal() {
    const modal = UI.openModal({
      title: 'Registrarse con Google',
      body: `
        <p class="text-muted" style="margin-top:0;">Antes de continuar con tu cuenta de Google, selecciona tu rol en la empresa.</p>
        <div style="display:flex;flex-direction:column;gap:10px;margin:14px 0;">
          <label class="role-option selected" data-role="asesor">
            <input type="radio" name="google-role" value="asesor" checked>
            <span><strong>Asesor</strong><br><small class="text-muted">Acceso a sus indicadores y módulos de trabajo.</small></span>
          </label>
          <label class="role-option" data-role="admin">
            <input type="radio" name="google-role" value="admin">
            <span><strong>Administrador</strong><br><small class="text-muted">Control total del sistema.</small></span>
          </label>
          <label class="role-option" data-role="gerencia">
            <input type="radio" name="google-role" value="gerencia">
            <span><strong>Gerencia</strong><br><small class="text-muted">Reportes y supervisión del equipo.</small></span>
          </label>
        </div>
        <div class="form-group" id="google-key-wrap" style="display:none;">
          <label for="google-role-key">Clave secreta</label>
          <input class="form-control" id="google-role-key" type="password" placeholder="Ingresa la clave de registro">
          <small class="text-muted">Esta clave la configura el administrador o la gerencia.</small>
        </div>
        <div id="google-role-error" class="alert alert-error hide"></div>
      `,
      footer: `
        <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
        <button class="btn btn-primary" type="button" data-ok>Continuar con Google</button>
      `,
      size: 520,
    });
    const bodyEl = modal.bodyEl;
    const overlay = bodyEl.closest('#modal-overlay');
    const keyWrap = bodyEl.querySelector('#google-key-wrap');
    const keyInput = bodyEl.querySelector('#google-role-key');
    const errBox = bodyEl.querySelector('#google-role-error');

    bodyEl.querySelectorAll('[data-role]').forEach((label) => {
      label.addEventListener('click', () => {
        bodyEl.querySelectorAll('[data-role]').forEach((l) => l.classList.remove('selected'));
        label.classList.add('selected');
        const isBoss = label.dataset.role === 'admin' || label.dataset.role === 'gerencia';
        keyWrap.style.display = isBoss ? 'block' : 'none';
        if (!isBoss) keyInput.value = '';
      });
    });

    if (overlay) {
      const cancelBtn = overlay.querySelector('[data-cancel]');
      if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());
      const okBtnEl = overlay.querySelector('[data-ok]');
      if (okBtnEl) okBtnEl.addEventListener('click', async () => {
        errBox.classList.add('hide');
        const selected = bodyEl.querySelector('[data-role].selected') || bodyEl.querySelector('[data-role]');
        const role = selected ? selected.dataset.role : 'asesor';
        const roleKey = role === 'admin' || role === 'gerencia' ? keyInput.value.trim() : '';
        const okBtn = overlay.querySelector('[data-ok]');
        okBtn.disabled = true;
        try {
          if (role === 'admin' || role === 'gerencia') {
            await window.API.auth.checkRegisterKey({ role, roleKey });
          }
          const info = await window.API.settings.public();
          if (!info.googleClientIdConfigured || !info.googleClientId) {
            okBtn.disabled = false;
            UI.closeModal();
            UI.toast('El registro con Google aún no está configurado. Pídele al administrador que agregue el Google Client ID.', 'error');
            return;
          }
          pendingGoogle = { role, roleKey, clientId: info.googleClientId };
          UI.closeModal();
          await startGoogleSignIn();
        } catch (error) {
          okBtn.disabled = false;
          errBox.textContent = error.message || 'No se pudo validar la clave.';
          errBox.classList.remove('hide');
        }
      });
    }
  }

  async function startGoogleSignIn() {
    if (!pendingGoogle) return;
    const { role, roleKey, clientId } = pendingGoogle;
    try {
      await loadGoogleScript();
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => finishGoogleSignIn(role, roleKey, response),
      });
      window.google.accounts.id.prompt();
    } catch (error) {
      UI.toast(error.message || 'No se pudo iniciar la sesión con Google.', 'error');
    }
  }

  async function finishGoogleSignIn(role, roleKey, response) {
    if (!response || !response.credential) {
      UI.toast('Google no devolvió una credencial válida.', 'error');
      return;
    }
    try {
      const result = await window.API.auth.google({ credential: response.credential, role, roleKey });
      window.ApiClient.setLogin(result.token, result.user);
      UI.toast('Registro con Google completado', 'success');
      window.location.replace('home.html');
    } catch (error) {
      UI.toast(error.message || 'No se pudo completar el registro.', 'error');
    }
  }

  // ---- Soporte Técnico (modal) ----

  function soporteLoginFlow() {
    const modal = document.getElementById('soporte-modal');
    const identifier = document.getElementById('soporte-identifier');
    const password = document.getElementById('soporte-password');
    const errBox = document.getElementById('soporte-error');
    const btn = document.getElementById('btn-soporte-login');
    const spinner = document.getElementById('soporte-spinner');

    function showError(message) {
      if (!errBox) return;
      errBox.textContent = message;
      errBox.classList.remove('hide');
      errBox.classList.add('anim-alert-error');
    }

    function clearError() {
      if (!errBox) return;
      errBox.classList.add('hide');
      errBox.textContent = '';
    }

    function setLoading(loading) {
      if (!btn) return;
      btn.disabled = loading;
      if (spinner) spinner.classList.toggle('hide', !loading);
    }

    async function submitLogin(event) {
      event.preventDefault();
      const idVal = (identifier.value || '').trim();
      const passVal = password.value;
      if (!idVal || !passVal) {
        showError('Ingresa tu usuario y contraseña de soporte.');
        return;
      }
      clearError();
      setLoading(true);
      try {
        const result = await window.API.soporte.login({ identifier: idVal, password: passVal });
        localStorage.setItem('soporte_token', result.token);
        localStorage.setItem('soporte_user', JSON.stringify(result.data.user));
        window.location.replace('soporte.html');
      } catch (error) {
        showError(error.message || 'Credenciales de soporte incorrectas.');
        setLoading(false);
      }
    }

    function open() {
      if (!modal) return;
      clearError();
      modal.hidden = false;
      modal.classList.add('open');
      setTimeout(() => { if (identifier) identifier.focus(); }, 120);
    }

    function close() {
      if (!modal) return;
      modal.classList.remove('open');
      setTimeout(() => { modal.hidden = true; }, 200);
    }

    const openBtn = document.getElementById('btn-soporte');
    if (openBtn) openBtn.addEventListener('click', open);

    modal.querySelectorAll('[data-soporte-close]').forEach((el) => {
      el.addEventListener('click', close);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && !modal.hidden) close();
    });

    const soporteForm = document.getElementById('soporte-form');
    if (soporteForm) soporteForm.addEventListener('submit', submitLogin);

    const sToggle = document.getElementById('btn-toggle-soporte-password');
    if (sToggle && password) {
      sToggle.addEventListener('click', () => {
        const show = password.type === 'password';
        password.type = show ? 'text' : 'password';
        sToggle.innerHTML = show ? '&#128064;' : '&#128065;';
        sToggle.classList.toggle('active', show);
      });
    }
  }

  // ---- Restablecer contraseña (¿Olvidaste tu contraseña?) ----

  function forgotPasswordFlow() {
    const btn = document.getElementById('btn-forgot-password');
    if (!btn) return;

    const SUPPORT_EMAIL = 'FranciscoAguayo2005@gmail.com';

    btn.addEventListener('click', () => {
      const currentIdentifier = (document.getElementById('identifier') || {}).value || '';
      const modal = UI.openModal({
        title: '&#128274;&nbsp; Restablecer contraseña',
        size: 480,
        body: `
          <p style="margin:0 0 14px;" class="text-muted">Ingresa tu usuario o correo de la cuenta. Avisaremos al administrador y al soporte técnico para que te ayuden a restablecerla.</p>
          <div class="form-group">
            <label for="fp-identifier">Usuario o correo</label>
            <input class="form-control" id="fp-identifier" type="text" value="${UI.escapeHtml(currentIdentifier)}" placeholder="usuario o correo@ejemplo.com" autofocus>
          </div>
          <div id="fp-error" class="alert alert-error hide" role="alert"></div>
        `,
        footer: `
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary" type="button" data-ok>&#10148;&nbsp; Enviar solicitud</button>
        `,
      });

      const bodyEl = modal.bodyEl;
      const overlay = bodyEl.closest('#modal-overlay');
      if (!overlay) return;

      const input = bodyEl.querySelector('#fp-identifier');
      const errBox = bodyEl.querySelector('#fp-error');
      const okBtn = overlay.querySelector('[data-ok]');
      const cancelBtn = overlay.querySelector('[data-cancel]');

      if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());
      if (okBtn) {
        okBtn.addEventListener('click', async () => {
          const identifier = (input.value || '').trim();
          if (!identifier) {
            errBox.textContent = 'Ingresa tu usuario o correo.';
            errBox.classList.remove('hide');
            return;
          }
          errBox.classList.add('hide');
          okBtn.disabled = true;
          try {
            await window.API.auth.forgotPassword({ identifier });
            UI.closeModal();
            showResetInstructions(identifier);
          } catch (error) {
            okBtn.disabled = false;
            errBox.textContent = error.message || 'No se pudo enviar la solicitud. Intenta de nuevo.';
            errBox.classList.remove('hide');
          }
        });
      }
      if (input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && okBtn) okBtn.click();
        });
      }
    });

    // El primer paso ya notificó a administrador y soporte. Al cerrar esa ventana,
    // se pide al asesor enviar un correo al soporte para restablecer la contraseña,
    // con botón funcional que abre su correo con un mensaje preestablecido.
    function showResetInstructions(identifier) {
      const subject = 'Solicitud de restablecimiento de contraseña - INMOBLES';
      const body =
        'Hola, soy asesor de INMOBLES y olvidé mi contraseña.\n\n' +
        `Mi usuario o correo es: ${identifier}\n\n` +
        'Solicito que me ayuden a restablecerla. ¡Gracias!';
      const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

      const modal = UI.openModal({
        title: '&#9993;&nbsp; Restablecer contraseña',
        size: 520,
        body: `
          <p style="margin:0 0 10px;">Ya avisamos al <strong>administrador</strong> y al <strong>soporte técnico</strong> sobre tu solicitud.</p>
          <p style="margin:0 0 14px;" class="text-muted">Para que puedan restablecer tu contraseña, envía ahora un correo al soporte con tus datos. Al hacer clic en el botón se abrirá tu correo con el mensaje ya redactado.</p>
          <div style="background:#faf8fd;border:1px solid #f0edf3;border-radius:12px;padding:12px 14px;font-size:13px;color:#3d3560;word-break:break-all;">${UI.escapeHtml(mailto)}</div>
        `,
        footer: `
          <button class="btn btn-secondary" type="button" data-cancel>Cerrar</button>
          <a class="btn btn-primary" href="${mailto}" target="_blank" rel="noopener" data-mail>&#128231;&nbsp; Abrir correo al soporte</a>
        `,
      });

      const overlay = modal.bodyEl.closest('#modal-overlay');
      if (overlay) {
        const closeBtn = overlay.querySelector('[data-cancel]');
        if (closeBtn) closeBtn.addEventListener('click', () => UI.closeModal());
      }
    }
  }

  function setup() {
    registerServiceWorker();

    const year = document.getElementById('login-year');
    if (year) year.textContent = String(new Date().getFullYear());

    if (window.ApiClient.isAuthenticated()) {
      window.location.replace('home.html');
      return;
    }

    const form = document.getElementById('login-form');
    if (form) form.addEventListener('submit', submit);

    forgotPasswordFlow();

    const toggle = document.getElementById('btn-toggle-password');
    const password = document.getElementById('password');
    if (toggle && password) {
      toggle.addEventListener('click', () => {
        const show = password.type === 'password';
        password.type = show ? 'text' : 'password';
        // innerHTML (no textContent): los emojis se pasan como entidad HTML.
        toggle.innerHTML = show ? '&#128064;' : '&#128065;';
        toggle.classList.toggle('active', show);
        toggle.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
        toggle.title = show ? 'Ocultar contraseña' : 'Mostrar contraseña';
      });
    }

    const googleBtn = document.getElementById('btn-google');
    if (googleBtn) googleBtn.addEventListener('click', openRoleModal);

    refreshGoogleStatus();
    refreshMaintenanceStatus();
    // Revisión periódica del estado de mantenimiento en la pantalla de login.
    setInterval(refreshMaintenanceStatus, 20000);

    if (window.AppInstall) window.AppInstall.init();
  }

  function init() {
    initTheme();
    setup();
    soporteLoginFlow();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => window.LoginPage.init());
