'use strict';

window.Pages = window.Pages || {};

window.Pages.profile = {
  title: 'Mi perfil',

  async render(container) {
    container.innerHTML = '<div class="loading">Cargando perfil...</div>';

    let me = null;
    let goals = [];
    try {
      me = await API.auth.me();
      const g = await API.goals.list({ user: me._id, limit: 10 }).catch(() => ({ data: [] }));
      goals = (g.data || []).filter((x) => x.status === 'activa').slice(0, 3);
    } catch (error) {
      container.innerHTML = UI.errorAlert(error.message);
      return;
    }

    const roleCode = me.role ? (me.role.code || me.role) : '';
    const roleName = me.role ? (me.role.name || me.role.code || me.role) : 'Sin rol';
    const isAdmin = ['admin', 'gerencia'].includes(roleCode);

    const avatar = me.photo
      ? `<img src="${window.AppConfig.resolveUrl(me.photo)}" alt="Foto de perfil" class="profile-cover-avatar">`
      : `<span class="profile-cover-avatar advisor-avatar-fallback">${UI.escapeHtml(String(me.name || me.username || 'U').charAt(0).toUpperCase())}</span>`;

    const goalCard = goals.length
      ? goals.map((goal) => {
          const pct = goal.objectiveAmount ? Math.min(100, (goal.currentResult / goal.objectiveAmount) * 100) : 0;
          const missing = Math.max(0, goal.objectiveAmount - goal.currentResult);
          const onTrack = goal.projection >= goal.objectiveAmount;
          return `
            <div class="profile-goal">
              ${goal.image ? `<img src="${window.AppConfig.resolveUrl(goal.image)}" alt="" class="profile-goal-img">` : ''}
              <div style="flex:1;min-width:0;">
                <div class="profile-goal-head">
                  <strong>${UI.escapeHtml(goal.name)}</strong>
                  <span class="profile-goal-amount">${Format.currency(goal.currentResult)} de ${Format.currency(goal.objectiveAmount)}</span>
                </div>
                ${UI.progressBar(pct)}
                <small class="${onTrack ? 'text-success' : 'text-warning'}">
                  ${onTrack
                    ? `&check; Tu proyección al ritmo actual sugiere que vas a lograr la meta (proyección ${Format.currency(goal.projection)}).`
                    : `Aún te faltan ${Format.currency(missing)} para cumplirla. ¡Vas a lograrlo! (proyección ${Format.currency(goal.projection)})`}
                </small>
              </div>
            </div>`;
        }).join('')
      : '<p class="text-muted" style="margin:0;">No tienes metas activas. <a href="goals.html">Crea una meta</a> para darle seguimiento a tu objetivo mensual.</p>';

    container.innerHTML = `
      <div class="profile-cover card" style="overflow:hidden;">
        <div class="profile-cover-bg"></div>
        <div class="profile-cover-row" style="flex-wrap:wrap;gap:24px;">
          <div style="position:relative;">
            ${avatar}
            <label for="profile-photo-file" style="position:absolute;bottom:4px;right:4px;background:var(--primary);color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;border:2px solid #fff;" title="Cambiar foto">&#128247;</label>
            <input type="file" id="profile-photo-file" accept="image/*" style="display:none;">
          </div>
          <div class="profile-cover-info" style="flex:1;min-width:280px;">
            <h2 style="margin:0 0 4px;">${UI.escapeHtml(me.name)}</h2>
            <p class="profile-cover-position" style="margin:0 0 12px;">${UI.escapeHtml(me.position || 'Asesor inmobiliario')}</p>
            <div class="profile-cover-chips" style="display:flex;flex-wrap:wrap;gap:8px;">
              <span class="profile-chip">${UI.badge(roleName, isAdmin ? 'primary' : 'info')}</span>
              <span class="profile-chip" style="display:flex;align-items:center;gap:4px;">&#128231; ${UI.escapeHtml(me.email)}</span>
              ${me.phone ? `<span class="profile-chip" style="display:flex;align-items:center;gap:4px;">&#128222; ${UI.escapeHtml(me.phone)}</span>` : ''}
              ${me.username ? `<span class="profile-chip" style="display:flex;align-items:center;gap:4px;">@${UI.escapeHtml(me.username)}</span>` : ''}
            </div>
            ${me.bio ? `<p class="profile-cover-bio" style="margin:12px 0 0;font-size:13px;color:var(--text-muted);">${UI.escapeHtml(me.bio)}</p>` : ''}
          </div>
        </div>
      </div>

      <div class="grid grid-2" style="margin-top:16px;">
        <div class="card">
          <h3 style="margin-top:0;display:flex;align-items:center;gap:8px;">&#128100; Información personal</h3>
          <div style="display:grid;gap:12px;">
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
              <span class="text-muted">Nombre completo</span>
              <strong>${UI.escapeHtml(me.name)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
              <span class="text-muted">Correo electrónico</span>
              <strong>${UI.escapeHtml(me.email)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
              <span class="text-muted">Teléfono</span>
              <strong>${UI.escapeHtml(me.phone || 'No registrado')}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
              <span class="text-muted">Usuario</span>
              <strong>@${UI.escapeHtml(me.username)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
              <span class="text-muted">Cargo / Posición</span>
              <strong>${UI.escapeHtml(me.position || 'No especificado')}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
              <span class="text-muted">Rol</span>
              <span>${UI.badge(roleName, isAdmin ? 'primary' : 'info')}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
              <span class="text-muted">Fecha de registro</span>
              <strong>${Format.date(me.joinedAt)}</strong>
            </div>
            ${me.lastLoginAt ? `
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
              <span class="text-muted">Último acceso</span>
              <strong>${Format.dateTime(me.lastLoginAt)}</strong>
            </div>` : ''}
            <div style="display:flex;justify-content:space-between;padding:10px 0;">
              <span class="text-muted">Redes sociales</span>
              <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
                <a href="https://inmobles.com" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">&#127760; Sitio oficial</a>
                ${me.facebook ? `<a href="${UI.escapeHtml(me.facebook)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">Facebook</a>` : ''}
                ${me.instagram ? `<a href="${UI.escapeHtml(me.instagram)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">Instagram</a>` : ''}
                ${!me.facebook && !me.instagram ? '' : ''}
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <h3 style="margin-top:0;display:flex;align-items:center;gap:8px;">&#9998; Editar información</h3>
          <form id="profile-form">
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 16px;">
              ${UI.field('name', 'Nombre', { type: 'text', value: me.name })}
              ${UI.field('email', 'Correo', { type: 'email', value: me.email })}
              ${UI.field('phone', 'Teléfono', { type: 'tel', value: me.phone || '' })}
              ${UI.field('position', 'Cargo', { type: 'text', value: me.position || '' })}
              ${UI.field('username', 'Usuario', { type: 'text', value: me.username })}
              ${UI.field('photo', 'URL de la foto', { type: 'text', value: me.photo || '', hint: 'Pega una URL pública de imagen' })}
              ${UI.field('facebook', 'Facebook', { type: 'text', value: me.facebook || '' })}
              ${UI.field('instagram', 'Instagram', { type: 'text', value: me.instagram || '' })}
              ${UI.field('bio', 'Semblanza', { type: 'textarea', value: me.bio || '', full: true })}
              ${UI.field('password', 'Nueva contraseña', { type: 'password', hint: 'Dejar vacío para no cambiarla' })}
            </div>
            <div style="margin-top:16px;display:flex;gap:10px;align-items:center;">
              <button class="btn btn-primary" type="submit">Guardar cambios</button>
              <span id="profile-photo-status" class="text-muted" style="font-size:12px;"></span>
            </div>
          </form>
        </div>
      </div>

      <div class="card profile-cover-letter" style="margin-top:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
          <div>
            <h3 style="margin:0 0 6px;display:flex;align-items:center;gap:8px;">&#128196; Mi carta de presentación digital</h3>
            <p class="text-muted" style="margin:0;font-size:13px;">
              Apostilla institucional con tu foto, datos de contacto y semblanza. Descárgala en PDF o compártela por WhatsApp con clientes y prospectos.
            </p>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button class="btn btn-primary" type="button" data-carta-pdf>&#128424; Descargar PDF</button>
            <button class="btn btn-wa" type="button" data-carta-wa>&#128172; Compartir por WhatsApp</button>
          </div>
        </div>
        <div class="carta-preview" style="margin-top:16px;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;background:#fff;">
          <div style="background:linear-gradient(135deg,#2d1048,#4A1A6B);color:#fff;padding:12px 16px;display:flex;align-items:center;gap:10px;">
            <img src="logoinmobles.png" alt="" style="height:28px;width:auto;">
            <span style="font-size:14px;font-weight:700;">Carta de presentación</span>
          </div>
          <div style="padding:16px;color:var(--text);">
            ${CartaPresentacion.buildCarta(me, { skipLink: true })}
          </div>
        </div>
      </div>

      ${goals.length ? `
      <div class="card profile-goal-card" style="margin-top:16px;">
        <h3 style="margin-top:0;display:flex;align-items:center;gap:8px;">&#127919; Tu meta en curso</h3>
        <div class="profile-goal-list">${goalCard}</div>
      </div>
      ` : ''}
    `;

    // Puebla el QR de la carta de presentación (genera dataURL de forma robusta).
    if (window.CartaPresentacion && window.CartaPresentacion.populateQr) {
      window.CartaPresentacion.populateQr(container, me);
    }

    // Foto de perfil
    const photoFile = container.querySelector('#profile-photo-file');
    const photoStatus = container.querySelector('#profile-photo-status');
    if (photoFile) {
      photoFile.addEventListener('change', async () => {
        const file = photoFile.files[0];
        if (!file) return;
        if (!file.type || !file.type.startsWith('image/')) {
          UI.toast('El archivo debe ser una imagen.', 'error');
          photoFile.value = '';
          return;
        }
        if (photoStatus) photoStatus.textContent = 'Subiendo foto...';
        try {
          const res = await API.documents.upload(file);
          const url = res.fileUrl;
          const photoField = container.querySelector('#fld-photo');
          if (photoField) photoField.value = url;
          if (photoStatus) photoStatus.textContent = 'Foto subida. Guarda el formulario para aplicarla.';
          UI.toast('Foto subida correctamente.', 'success');
        } catch (error) {
          if (photoStatus) photoStatus.textContent = '';
          UI.toast(error.message, 'error');
        }
        photoFile.value = '';
      });
    }

    // Formulario de perfil
    const profileForm = container.querySelector('#profile-form');
    if (profileForm) {
      profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const values = UI.collectForm(e.target);
        if (!values.password) delete values.password;
        try {
          const result = await API.auth.updateMe(values);
          window.ApiClient.setLogin(window.ApiClient.getToken(), result);
          UI.toast('Perfil actualizado', 'success');
          window.location.reload();
        } catch (error) {
          UI.toast(error.message, 'error');
        }
      });
    }

    // Carta de presentación: PDF + WhatsApp
    const pdfBtn = container.querySelector('[data-carta-pdf]');
    if (pdfBtn) pdfBtn.addEventListener('click', () => CartaPresentacion.openPdf(me));
    const waBtn = container.querySelector('[data-carta-wa]');
    if (waBtn) waBtn.addEventListener('click', () => CartaPresentacion.shareWhatsApp(me));
  },
};
