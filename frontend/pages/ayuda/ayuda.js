'use strict';

window.Pages = window.Pages || {};

window.Pages.ayuda = {
  title: 'Ayuda y soporte',

  async render(container) {
    container.innerHTML = '<div class="loading">Cargando ayuda...</div>';

    let me = null;
    let support = {};
    try {
      me = await API.auth.me();
      const pub = await API.settings.public().catch(() => null);
      support = (pub && pub.support) || {};
    } catch (error) {
      me = window.ApiClient.getStoredUser() || {};
    }

    const name = (me.name || me.username || '').split(' ')[0];

    const supportName = support.name || 'Soporte';
    const supportTitle = support.title || 'Atención a clientes y equipo';
    const supportWhatsapp = support.whatsapp || '';
    const supportEmail = support.email || '';
    const supportPhoto = support.photo || '';
    const supportIntro = support.intro || '¿Necesitas ayuda? Escríbenos y con gusto te atendemos.';
    const waLink = supportWhatsapp
      ? `https://wa.me/${String(supportWhatsapp).replace(/[^\d]/g, '')}?text=${encodeURIComponent('Hola, necesito ayuda con el sistema INMOBLES.')}`
      : '#';

    const photoHtml = supportPhoto
      ? `<img class="ayuda-avatar" src="${window.AppConfig.resolveUrl(supportPhoto)}" alt="${UI.escapeHtml(supportName)}">`
      : `<span class="ayuda-avatar ayuda-avatar-fallback">${UI.escapeHtml(String(supportName).charAt(0).toUpperCase())}</span>`;

    const whatsappCard = supportWhatsapp
      ? `<a class="card ayuda-contact-card anim-fade-in-up anim-delay-1" href="${waLink}" target="_blank" rel="noopener">
           <span class="ayuda-contact-icon" style="background:#25d366;">&#128172;</span>
           <span class="ayuda-contact-body">
             <strong>WhatsApp de soporte</strong>
             <small>Respuesta rápida para cualquier duda</small>
           </span>
           <span class="btn btn-sm" style="background:#25d366;color:#fff;border:none;">&#9998;&nbsp; Escribir</span>
         </a>`
      : '';

    const emailCard = supportEmail
      ? `<a class="card ayuda-contact-card anim-fade-in-up anim-delay-2" href="mailto:${UI.escapeHtml(supportEmail)}">
           <span class="ayuda-contact-icon" style="background:#7B3FA0;">&#9993;</span>
           <span class="ayuda-contact-body">
             <strong>Correo electrónico</strong>
             <small>${UI.escapeHtml(supportEmail)}</small>
           </span>
         </a>`
      : '';

    container.innerHTML = `
      <div class="page-header">
        <h2>&#128172;&nbsp; Ayuda y soporte</h2>
      </div>

      <div class="ayuda-hero">
        <div class="ayuda-hero-col">
          <div class="ayuda-hero-brands">
            <img src="logoinmobles.png" alt="INMOBLES" class="ayuda-brand-logo">
            <span class="ayuda-brand-plus">&#43;</span>
            <img src="fv_digital_logo.png.webp" alt="FV DIGITAL" class="ayuda-brand-dev">
          </div>
          <h2>¡Hola, ${UI.escapeHtml(name || 'usuario')}!</h2>
          <p>${UI.escapeHtml(supportIntro)}</p>
        </div>
      </div>

      <div class="ayuda-support-row">
        <div class="card ayuda-support-card">
          <div class="ayuda-support-head">
            ${photoHtml}
            <div class="ayuda-support-info">
              <h3>${UI.escapeHtml(supportName)}</h3>
              <p>${UI.escapeHtml(supportTitle)}</p>
              <div class="ayuda-badge-online"><span class="status-dot"></span> Disponible</div>
            </div>
          </div>
          <div class="ayuda-support-contact">
            ${whatsappCard}
            ${emailCard}
            ${support.facebook ? `<a class="card ayuda-contact-card anim-fade-in-up anim-delay-3" href="${UI.escapeHtml(support.facebook)}" target="_blank" rel="noopener">
              <span class="ayuda-contact-icon" style="background:#1877f2;">f</span>
              <span class="ayuda-contact-body"><strong>Facebook</strong><small>@${UI.escapeHtml(support.facebook.replace(/^https?:\/\/(www\.)?(facebook\.com|fb\.com)\//, ''))}</small></span>
            </a>` : ''}
            ${support.instagram ? `<a class="card ayuda-contact-card anim-fade-in-up anim-delay-4" href="${UI.escapeHtml(support.instagram)}" target="_blank" rel="noopener">
              <span class="ayuda-contact-icon" style="background:linear-gradient(45deg,#f58529,#dd2a7b,#8134af);">&#128247;</span>
              <span class="ayuda-contact-body"><strong>Instagram</strong><small>@${UI.escapeHtml(support.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//, ''))}</small></span>
            </a>` : ''}
          </div>
        </div>

        <div class="ayuda-actions-col">
          <div class="card ayuda-action-card anim-fade-in-up anim-delay-1">
            <div class="ayuda-action-icon">&#128640;</div>
            <div>
              <strong>Guía rápida</strong>
              <p>Repasa el tutorial de bienvenida cuando quieras.</p>
            </div>
            <button class="btn btn-primary btn-sm" type="button" data-guia>&#128279;&nbsp; Ver guía</button>
          </div>

          <div class="card ayuda-action-card anim-fade-in-up anim-delay-2">
            <div class="ayuda-action-icon">&#128100;</div>
            <div>
              <strong>Mi perfil</strong>
              <p>Actualiza tus datos personales y foto.</p>
            </div>
            <a class="btn btn-secondary btn-sm" href="profile.html">Ir a perfil</a>
          </div>

          <div class="card ayuda-action-card anim-fade-in-up anim-delay-3">
            <div class="ayuda-action-icon">&#128274;</div>
            <div>
              <strong>Cambiar contraseña</strong>
              <p>Actualiza tu contraseña de acceso.</p>
            </div>
            <button class="btn btn-secondary btn-sm" type="button" data-password>&#9998;&nbsp; Cambiar</button>
          </div>

          <div class="card ayuda-action-card anim-fade-in-up anim-delay-4">
            <div class="ayuda-action-icon">&#128203;</div>
            <div>
              <strong>Asistente IA</strong>
              <p>Pregunta por propiedades, clientes, citas y más.</p>
            </div>
            <button class="btn btn-secondary btn-sm" type="button" data-assistant>&#129302;&nbsp; Preguntar</button>
          </div>
        </div>
      </div>

      <div class="card ayuda-footer anim-fade-in-up anim-delay-5">
        <div class="ayuda-footer-brands">
          <img src="logoinmobles.png" alt="INMOBLES" class="ayuda-foot-brand">
          <span class="ayuda-brand-plus">&#43;</span>
          <img src="fv_digital_logo.png.webp" alt="FV DIGITAL" class="ayuda-foot-dev">
        </div>
        <p>
          <strong>INMOBLES</strong> &times; <strong style="background:linear-gradient(135deg,#7B3FA0,#5B2D8E);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;">FV DIGITAL</strong>
        </p>
        <small class="text-muted">&copy; ${new Date().getFullYear()} INMOBLES · Desarrollado por FV Digital · Soluciones Digitales y Desarrollo</small>
      </div>
    `;

    const guiaBtn = container.querySelector('[data-guia]');
    if (guiaBtn) {
      guiaBtn.addEventListener('click', () => {
        if (window.Onboarding) window.Onboarding.show();
        else if (window.App && window.App.reopenOnboarding) window.App.reopenOnboarding();
      });
    }

    const passBtn = container.querySelector('[data-password]');
    if (passBtn) passBtn.addEventListener('click', openPasswordModal);

    const assistBtn = container.querySelector('[data-assistant]');
    if (assistBtn) {
      assistBtn.addEventListener('click', () => {
        const panel = document.getElementById('assistant-panel');
        if (panel) {
          panel.hidden = panel.hidden ? false : true;
          const q = document.getElementById('assistant-question');
          if (q && !panel.hidden) q.focus();
        } else {
          UI.toast('Abre el asistente desde el botón flotante &#129302;', 'info');
        }
      });
    }

    function openPasswordModal() {
      const modal = UI.openModal({
        title: 'Cambiar contraseña',
        body: `
          <p class="text-muted" style="margin-top:0;">Elige una contraseña segura: mínimo 8 caracteres, con mayúscula, minúscula y número.</p>
          <div class="form-group">
            <label for="pw-current">Contraseña actual</label>
            <div class="password-wrap">
              <input class="form-control" id="pw-current" type="password" autocomplete="current-password">
              <button type="button" class="password-toggle" data-toggle-pw="pw-current">&#128065;</button>
            </div>
          </div>
          <div class="form-group">
            <label for="pw-new">Nueva contraseña</label>
            <div class="password-wrap">
              <input class="form-control" id="pw-new" type="password" autocomplete="new-password" minlength="8">
              <button type="button" class="password-toggle" data-toggle-pw="pw-new">&#128065;</button>
            </div>
          </div>
          <div class="form-group">
            <label for="pw-confirm">Confirmar nueva contraseña</label>
            <div class="password-wrap">
              <input class="form-control" id="pw-confirm" type="password" autocomplete="new-password" minlength="8">
              <button type="button" class="password-toggle" data-toggle-pw="pw-confirm">&#128065;</button>
            </div>
          </div>
          <div id="pw-error" class="alert alert-error hide"></div>
        `,
        footer: `
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary" type="button" data-ok>Actualizar contraseña</button>
        `,
        size: 460,
      });

      const overlay = modal.bodyEl.closest('#modal-overlay');
      const errBox = modal.bodyEl.querySelector('#pw-error');

      overlay.querySelectorAll('[data-toggle-pw]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const input = document.getElementById(btn.dataset.togglePw);
          if (!input) return;
          const show = input.type === 'password';
          input.type = show ? 'text' : 'password';
          btn.innerHTML = show ? '&#128064;' : '&#128065;';
        });
      });

      const cancelBtn = overlay.querySelector('[data-cancel]');
      if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());

      const okBtn = overlay.querySelector('[data-ok]');
      if (okBtn) {
        okBtn.addEventListener('click', async () => {
          const current = document.getElementById('pw-current').value;
          const next = document.getElementById('pw-new').value;
          const confirm = document.getElementById('pw-confirm').value;

          if (!current || !next || !confirm) {
            errBox.textContent = 'Completa todos los campos.';
            errBox.classList.remove('hide');
            return;
          }
          if (next.length < 8) {
            errBox.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.';
            errBox.classList.remove('hide');
            return;
          }
          if (!/[A-Z]/.test(next)) {
            errBox.textContent = 'La nueva contraseña debe incluir al menos una mayúscula.';
            errBox.classList.remove('hide');
            return;
          }
          if (!/[a-z]/.test(next)) {
            errBox.textContent = 'La nueva contraseña debe incluir al menos una minúscula.';
            errBox.classList.remove('hide');
            return;
          }
          if (!/\d/.test(next)) {
            errBox.textContent = 'La nueva contraseña debe incluir al menos un número.';
            errBox.classList.remove('hide');
            return;
          }
          if (next !== confirm) {
            errBox.textContent = 'Las contraseñas no coinciden.';
            errBox.classList.remove('hide');
            return;
          }

          okBtn.disabled = true;
          okBtn.classList.add('loading');
          try {
            await API.auth.changePassword({ currentPassword: current, newPassword: next });
            UI.closeModal();
            UI.toast('Contraseña actualizada correctamente', 'success');
          } catch (error) {
            okBtn.disabled = false;
            okBtn.classList.remove('loading');
            errBox.textContent = error.message || 'No se pudo cambiar la contraseña.';
            errBox.classList.remove('hide');
          }
        });
      }
    }
  },
};
