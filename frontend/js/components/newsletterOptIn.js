'use strict';

// Suscripción propia a las noticias del CRM. Se usa en dos lugares:
//  - Bienvenida: pregunta "¿quieres recibir noticias a tu correo?" con Aceptar o Después.
//  - Mi perfil: campo de correo para recibirlas y botón para cancelarlas.
window.NewsletterOptIn = (() => {
  const EMAIL_RX = /^[\w.+-]+@[\w-]+\.[\w.-]+$/;
  const esc = (value) => (window.UI && UI.escapeHtml ? UI.escapeHtml(value) : String(value == null ? '' : value));

  function setMsg(el, text, type) {
    if (!el) return;
    el.textContent = text || '';
    el.style.color = type === 'error' ? '#b91c1c' : type === 'success' ? '#166534' : 'var(--text-muted)';
  }

  function welcomeMarkup(email) {
    return `
      <div class="nl-optin" style="margin:14px 0 4px;padding:14px 16px;border-radius:12px;background:var(--primary-light, #f5f0fa);text-align:left;">
        <strong style="display:block;margin-bottom:4px;">&#128231;&nbsp; ¿Quieres recibir noticias del CRM en tu correo?</strong>
        <p class="text-muted" style="margin:0 0 10px;font-size:13px;">Te avisamos de novedades, promociones y cambios importantes del sistema.</p>
        <form class="nl-optin-form" style="display:flex;gap:8px;flex-wrap:wrap;">
          <input class="form-control" type="email" name="email" value="${esc(email)}" placeholder="Tu correo electrónico" required style="flex:1;min-width:200px;">
          <button class="btn btn-primary" type="submit">&#128276;&nbsp; Sí, quiero recibirlas</button>
          <button class="btn btn-secondary" type="button" data-nl-later>Después</button>
        </form>
        <p class="nl-optin-msg" style="margin:8px 0 0;font-size:12.5px;"></p>
      </div>`;
  }

  function profileMarkup(state) {
    const status = state.subscribed
      ? `Recibes noticias en <strong>${esc(state.email)}</strong>.`
      : 'No recibes noticias por correo en este momento.';
    return `
      <p class="text-muted" style="margin:0 0 12px;font-size:13px;">${status}</p>
      <form class="nl-optin-form" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
        <div style="flex:1;min-width:220px;">
          <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Correo para recibir noticias</label>
          <input class="form-control" type="email" name="email" value="${esc(state.email)}" placeholder="tu@correo.com" required>
        </div>
        <button class="btn btn-primary" type="submit">&#128276;&nbsp; ${state.subscribed ? 'Actualizar correo' : 'Recibir noticias'}</button>
        <button class="btn btn-secondary" type="button" data-nl-cancel ${state.subscribed ? '' : 'disabled'}>Cancelar suscripción</button>
      </form>
      <p class="text-muted" style="margin:8px 0 0;font-size:12px;">Puedes cancelar cuando quieras; dejarás de recibir correos del boletín al instante.</p>
      <p class="nl-optin-msg" style="margin:8px 0 0;font-size:12.5px;"></p>`;
  }

  // Monta la pregunta de bienvenida. Si el usuario ya respondió, no muestra nada.
  async function mountWelcome(host, { onDone } = {}) {
    if (!host) return;
    let state;
    try {
      state = await window.API.newsletter.me();
    } catch (error) {
      host.innerHTML = '';
      if (onDone) onDone();
      return;
    }
    if (state.prompted) {
      host.innerHTML = '';
      if (onDone) onDone();
      return;
    }
    host.innerHTML = welcomeMarkup(state.email);
    const form = host.querySelector('.nl-optin-form');
    const msg = host.querySelector('.nl-optin-msg');
    const finish = (text, type) => {
      setMsg(msg, text, type);
      host.querySelectorAll('button, input').forEach((el) => { el.disabled = true; });
      setTimeout(() => { if (onDone) onDone(); }, 1800);
    };

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = form.elements.email.value.trim().toLowerCase();
      if (!EMAIL_RX.test(email)) return setMsg(msg, 'Ingresa un correo válido.', 'error');
      setMsg(msg, 'Guardando…');
      try {
        const r = await window.API.newsletter.subscribeMe({ email, accept: true });
        finish(r.message || '¡Listo!', 'success');
      } catch (error) {
        setMsg(msg, error.message, 'error');
      }
    });

    host.querySelector('[data-nl-later]').addEventListener('click', async () => {
      try {
        const r = await window.API.newsletter.subscribeMe({ accept: false });
        finish(r.message || 'Puedes activarlo después desde Mi perfil.', 'info');
      } catch (error) {
        setMsg(msg, error.message, 'error');
      }
    });
  }

  // Monta la sección de Mi perfil: correo para recibir y botón para cancelar.
  async function mountProfile(host) {
    if (!host) return;
    host.innerHTML = '<div class="loading">Cargando…</div>';
    let state;
    try {
      state = await window.API.newsletter.me();
    } catch (error) {
      host.innerHTML = UI.errorAlert(error.message);
      return;
    }
    host.innerHTML = profileMarkup(state);
    const form = host.querySelector('.nl-optin-form');
    const msg = host.querySelector('.nl-optin-msg');
    const cancelBtn = host.querySelector('[data-nl-cancel]');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = form.elements.email.value.trim().toLowerCase();
      if (!EMAIL_RX.test(email)) return setMsg(msg, 'Ingresa un correo válido.', 'error');
      setMsg(msg, 'Guardando…');
      try {
        const r = await window.API.newsletter.subscribeMe({ email, accept: true });
        UI.toast(r.message || 'Listo.', 'success');
        mountProfile(host);
      } catch (error) {
        setMsg(msg, error.message, 'error');
      }
    });

    if (cancelBtn) {
      cancelBtn.addEventListener('click', async () => {
        if (!window.confirm('¿Cancelar las noticias por correo? Dejarás de recibir los correos del boletín.')) return;
        cancelBtn.disabled = true;
        try {
          const r = await window.API.newsletter.unsubscribeMe();
          UI.toast(r.message || 'Suscripción cancelada.', 'success');
          mountProfile(host);
        } catch (error) {
          cancelBtn.disabled = false;
          setMsg(msg, error.message, 'error');
        }
      });
    }
  }

  return { mountWelcome, mountProfile };
})();
