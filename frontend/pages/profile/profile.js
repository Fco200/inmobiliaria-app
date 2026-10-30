'use strict';

window.Pages = window.Pages || {};

window.Pages.profile = {
  title: 'Mi perfil',

  async render(container) {
    container.innerHTML = '<div class="loading">Cargando perfil...</div>';

    let me = null;
    let goals = [];
    let team = [];
    try {
      me = await API.auth.me();
      const g = await API.goals.list({ user: me._id, limit: 10 }).catch(() => ({ data: [] }));
      goals = (g.data || []).filter((x) => x.status === 'activa').slice(0, 3);
      team = await API.users.list({ limit: 500 }).catch(() => []);
      team = Array.isArray(team) ? team : (team.data || []);
    } catch (error) {
      container.innerHTML = UI.errorAlert(error.message);
      return;
    }

    const roleCode = me.role ? (me.role.code || me.role) : '';
    const roleName = me.role ? (me.role.name || me.role.code || me.role) : 'Sin rol';
    const isAdmin = ['admin', 'direccion', 'gerencia', 'superadmin', 'asistencia'].includes(roleCode);
    const myId = me._id || me.id;

    const roleOf = (u) => {
      if (!u || !u.role) return '';
      if (typeof u.role === 'object' && u.role !== null) return u.role.code || u.role.name || '';
      return String(u.role);
    };

    const teamColleagues = team
      .filter((u) => u && u.name && myId && String(u._id) !== String(myId) && String(u.status || 'activo').toLowerCase() !== 'inactivo')
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'))
      .slice(0, 6);

    const teamCards = teamColleagues.length
      ? teamColleagues.map((u) => `
          <div class="directorio-card" data-colleague="${u._id}" style="display:flex;align-items:center;gap:12px;background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;cursor:pointer;">
            <div style="width:46px;height:46px;border-radius:50%;overflow:hidden;border:2px solid #b9912f;background:#f3eee2;flex-shrink:0;">
              ${u.photo
                ? `<img src="${window.AppConfig.resolveUrl(u.photo)}" alt="" style="width:100%;height:100%;object-fit:cover;">`
                : `<span style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;background:linear-gradient(135deg,#b9912f,#8a6a1f);">${UI.escapeHtml(String(u.name).charAt(0).toUpperCase())}</span>`}
            </div>
            <div style="flex:1;min-width:0;">
              <strong style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${UI.escapeHtml(u.name)}</strong>
              <small style="color:var(--text-muted);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${UI.escapeHtml(u.position || 'Asesor inmobiliario')}</small>
            </div>
            <button class="btn btn-wa btn-sm" type="button" data-share-carta="${u._id}" title="Compartir su carta de presentación">&#128172;</button>
            <button class="btn btn-secondary btn-sm" type="button" data-view-carta="${u._id}" title="Ver carta de presentación">&#128424;</button>
          </div>`).join('')
      : '<p class="text-muted" style="margin:0;">No hay otros perfiles en el equipo.</p>';

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

      <div class="card" style="margin-top:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:14px;">
          <div>
            <h3 style="margin:0 0 6px;display:flex;align-items:center;gap:8px;">&#128101; Compartir la carta de otro asesor</h3>
            <p class="text-muted" style="margin:0;font-size:13px;">
              Comparte o descarga la carta de presentación de un colega. También puedes abrir el <a href="directorio.html">directorio completo del equipo</a>.
            </p>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;">${teamCards}</div>
      </div>

      <div class="card" style="margin-top:16px;">
        <h3 style="margin-top:0;display:flex;align-items:center;gap:8px;">&#128276; Notificaciones y privacidad</h3>

        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 0;border-bottom:1px solid var(--border);">
          <div style="flex:1;min-width:220px;">
            <strong>Notificaciones del sistema (push)</strong>
            <div class="text-muted" id="profile-push-status" style="font-size:12px;margin-top:2px;">Cargando...</div>
          </div>
          <div id="profile-push-actions"></div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 0;border-bottom:1px solid var(--border);">
          <div style="flex:1;min-width:220px;">
            <strong>Historial de avisos</strong>
            <div class="text-muted" style="font-size:12px;margin-top:2px;">Borra todos los avisos de tu cuenta.</div>
          </div>
          <button class="btn btn-secondary btn-sm" type="button" data-clear-notifs>&#128465;&nbsp; Borrar historial</button>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 0;">
          <div style="flex:1;min-width:220px;">
            <strong>Historial de actividad</strong>
            <div class="text-muted" style="font-size:12px;margin-top:2px;">Borra el registro de tus acciones en la app.</div>
          </div>
          <button class="btn btn-secondary btn-sm" type="button" data-clear-activity>&#128465;&nbsp; Borrar historial</button>
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
        // Nunca enviar la foto vacía: si el campo quedó sin valor, se conserva la
        // foto actual del perfil para que una actualización de otros campos no la borre.
        if ((!values.photo || String(values.photo).trim() === '') && me.photo) {
          values.photo = me.photo;
        }
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

    // Compartir / descargar la carta de presentación de otro asesor del equipo.
    const colleague = (id) => team.find((u) => u && String(u._id) === String(id));
    container.querySelectorAll('[data-share-carta]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const u = colleague(btn.dataset.shareCarta);
        if (u) CartaPresentacion.shareWhatsApp(u);
      });
    });
    container.querySelectorAll('[data-view-carta]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const u = colleague(btn.dataset.viewCarta);
        if (u) CartaPresentacion.openPdf(u);
      });
    });
    container.querySelectorAll('[data-colleague]').forEach((card) => {
      card.addEventListener('click', () => { window.location.href = 'directorio.html'; });
    });

    // Notificaciones push + borrado de historial (avisos / actividad).
    // Como Configuración es solo para administradores, el Perfil es el lugar
    // donde cualquier usuario (incluido el soporte) gestiona sus avisos.
    initNotificationsCard(container);

    async function initNotificationsCard(host) {
      const statusEl = host.querySelector('#profile-push-status');
      const actionsEl = host.querySelector('#profile-push-actions');
      if (!actionsEl) return;

      // push.js se carga bajo demanda si aún no está disponible (multipage lo
      // difiere), igual que hace Configuración → Alertas.
      if (!window.PushNotify) {
        await new Promise((resolve) => {
          const s = document.createElement('script');
          s.src = 'js/push.js';
          s.onload = resolve;
          s.onerror = resolve;
          document.head.appendChild(s);
        });
      }
      const Push = window.PushNotify;

      const iosInstall = Push && typeof Push.needsIosInstall === 'function' && Push.needsIosInstall();
      if (Push && iosInstall) {
        if (statusEl) statusEl.textContent = 'En iPhone: agrega la app a la pantalla de inicio para activarlas.';
        actionsEl.innerHTML = '<button class="btn btn-primary btn-sm" type="button" data-push-ios>&#128241;&nbsp; Cómo hacerlo</button>';
      } else if (Push && Push.supported()) {
        try {
          const st = await Push.status();
          if (st.enabled) {
            if (statusEl) statusEl.textContent = 'Activadas en este dispositivo.';
            actionsEl.innerHTML =
              '<button class="btn btn-secondary btn-sm" type="button" data-push-off>&#128263;&nbsp; Desactivar</button> ' +
              '<button class="btn btn-secondary btn-sm" type="button" data-push-test>&#128276;&nbsp; Probar</button>';
          } else {
            if (statusEl) statusEl.textContent = 'No activadas en este dispositivo.';
            actionsEl.innerHTML = '<button class="btn btn-primary btn-sm" type="button" data-push-on>&#128276;&nbsp; Activar</button>';
          }
        } catch (error) {
          if (statusEl) statusEl.textContent = 'No se pudo consultar el estado.';
        }
      } else if (Push) {
        if (statusEl) statusEl.textContent = 'Este navegador o dispositivo no soporta notificaciones push.';
        actionsEl.innerHTML = '';
      }

      const onBtn = actionsEl.querySelector('[data-push-on]');
      if (onBtn) onBtn.addEventListener('click', async () => {
        onBtn.disabled = true;
        onBtn.textContent = 'Activando...';
        try {
          await Push.enable();
          UI.toast('Notificaciones activadas en este dispositivo', 'success');
        } catch (error) {
          UI.toast(error.message, 'error');
        }
        initNotificationsCard(host);
      });
      const offBtn = actionsEl.querySelector('[data-push-off]');
      if (offBtn) offBtn.addEventListener('click', async () => {
        offBtn.disabled = true;
        try {
          await Push.disable();
          UI.toast('Notificaciones desactivadas', 'info');
        } catch (error) {
          UI.toast(error.message, 'error');
        }
        initNotificationsCard(host);
      });
      const testBtn = actionsEl.querySelector('[data-push-test]');
      if (testBtn) testBtn.addEventListener('click', async () => {
        testBtn.disabled = true;
        try {
          await Push.sendTest();
          UI.toast('Notificación de prueba enviada a este dispositivo', 'success');
        } catch (error) {
          UI.toast(error.message, 'error');
        }
        testBtn.disabled = false;
      });
      const iosBtn = actionsEl.querySelector('[data-push-ios]');
      if (iosBtn) iosBtn.addEventListener('click', () => Push.showIosNotificationGuide());

      const clearNotifs = host.querySelector('[data-clear-notifs]');
      if (clearNotifs) clearNotifs.addEventListener('click', () => confirmClear('el historial de avisos', () => API.notifications.clearAll()));
      const clearActivity = host.querySelector('[data-clear-activity]');
      if (clearActivity) clearActivity.addEventListener('click', () => confirmClear('el historial de actividad', () => API.activity.clearAll()));
    }

    function confirmClear(label, action) {
      UI.openModal({
        title: '¿Borrar ' + label + '?',
        body:
          '<p class="text-muted" style="margin:0;">Esta acción no se puede deshacer. Se borrará ' + label + ' de tu cuenta.</p>',
        footer:
          '<button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>' +
          '<button class="btn btn-danger" type="button" data-confirm>&#128465;&nbsp; Borrar</button>',
        size: 440,
      });
      const cancel = document.querySelector('#modal-overlay [data-cancel]');
      if (cancel) cancel.addEventListener('click', () => UI.closeModal());
      const confirmBtn = document.querySelector('#modal-overlay [data-confirm]');
      if (confirmBtn) confirmBtn.addEventListener('click', async () => {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Borrando...';
        try {
          await action();
          UI.closeModal();
          UI.toast('Historial borrado correctamente.', 'success');
          if (window.AppShell && typeof window.AppShell.refreshNotificationBadge === 'function') {
            window.AppShell.refreshNotificationBadge();
          }
        } catch (error) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Borrar';
          UI.toast(error.message, 'error');
        }
      });
    }
  },
};
