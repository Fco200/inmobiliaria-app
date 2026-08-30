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
      setError(error.message || 'No se pudo iniciar sesión. Intenta nuevamente.');
      setLoading(false);
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

    if (window.AppInstall) window.AppInstall.init();
  }

  function init() {
    initTheme();
    setup();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => window.LoginPage.init());
