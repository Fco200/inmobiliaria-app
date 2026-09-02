'use strict';

window.Pages = window.Pages || {};

window.Pages.settings = {
  title: 'Configuración',

  async render(container) {
    let roles = [];
    let me = null;
    try {
      me = await API.auth.me();
      roles = await API.roles.list();
    } catch (error) {
      container.innerHTML = UI.errorAlert(error.message);
      return;
    }

    const roleCode = me.role ? (me.role.code || me.role) : '';
    const isAdmin = roleCode === 'admin';
    const isBoss = isAdmin || roleCode === 'gerencia';
    if (!isBoss) {
      container.innerHTML = `
        <div class="card">
          <div class="empty-state">
            <p>La configuración del sistema está reservada para el administrador o la gerencia.</p>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="page-header">
        <h2>Configuración</h2>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
        <button class="btn btn-primary" data-tab="users" type="button">Usuarios</button>
        <button class="btn btn-secondary" data-tab="roles" type="button">Roles y permisos</button>
        <button class="btn btn-secondary" data-tab="register" type="button">&#128274;&nbsp; Registro</button>
        <button class="btn btn-secondary" data-tab="alerts" type="button">&#128276;&nbsp; Avisos</button>
        <button class="btn btn-secondary" data-tab="sessions" type="button">&#128275;&nbsp; Sesiones</button>
        <button class="btn btn-secondary" data-tab="catalog" type="button">&#127760;&nbsp; Catálogo público</button>
        <button class="btn btn-secondary" data-tab="activity" type="button">&#128221;&nbsp; Actividad del sistema</button>
      </div>
      <div id="tab-content"></div>
    `;

    const tabContent = container.querySelector('#tab-content');

    container.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('[data-tab]').forEach((b) => {
          b.classList.toggle('btn-primary', b === btn);
          b.classList.toggle('btn-secondary', b !== btn);
        });
        if (btn.dataset.tab === 'users') renderUsers();
        else if (btn.dataset.tab === 'roles') renderRoles();
        else if (btn.dataset.tab === 'register') renderRegister();
        else if (btn.dataset.tab === 'alerts') renderAlerts();
        else if (btn.dataset.tab === 'sessions') renderSessions();
        else if (btn.dataset.tab === 'catalog') renderCatalog();
        else renderActivity();
      });
    });

    function renderAdminOnly() {
      tabContent.innerHTML = `
        <div class="card">
          <div class="empty-state">
            <p>Esta sección está reservada para el administrador.</p>
          </div>
        </div>
      `;
    }

    function deviceLabel(ua) {
      if (!ua) return 'Dispositivo desconocido';
      let browser = 'Navegador';
      if (/Edg\//.test(ua)) browser = 'Edge';
      else if (/OPR\//.test(ua)) browser = 'Opera';
      else if (/Chrome\//.test(ua)) browser = 'Chrome';
      else if (/Firefox\//.test(ua)) browser = 'Firefox';
      else if (/Safari\//.test(ua)) browser = 'Safari';
      let os = 'desconocido';
      if (/Windows/.test(ua)) os = 'Windows';
      else if (/Android/.test(ua)) os = 'Android';
      else if (/iPhone|iPad/.test(ua)) os = 'iOS';
      else if (/Mac OS X/.test(ua)) os = 'macOS';
      else if (/Linux/.test(ua)) os = 'Linux';
      return `${browser} · ${os}`;
    }

    function renderSessions() {
      tabContent.innerHTML = '<div class="loading">Cargando sesiones...</div>';
      API.sessions.list({ limit: 100 })
        .then((result) => {
          const sessions = result.data || [];
          const mine = sessions.filter((s) => s.isCurrent);
          const others = sessions.filter((s) => !s.isCurrent);

          const sessionRow = (s) => `
            <tr>
              <td><strong>${UI.escapeHtml(deviceLabel(s.device))}</strong><br><small class="text-muted">${s.isCurrent ? 'Este dispositivo' : UI.escapeHtml(String(s.device).slice(0, 60))}</small></td>
              <td>${s.remember ? UI.badge('Recordada', 'info') : UI.badge('Temporal', 'muted')}</td>
              <td>${Format.dateTime(s.lastSeenAt)}</td>
              <td>${Format.dateTime(s.expiresAt)}</td>
              <td>${s.isCurrent ? UI.badge('Actual', 'success') : ''}</td>
              <td>
                <button class="btn btn-danger btn-sm" type="button" data-revoke="${s._id}" ${s.isCurrent ? '' : ''}>Cerrar</button>
              </td>
            </tr>`;

          const myTable = `
            <div class="card" style="margin-bottom:16px;">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
                <h3 style="margin:0;">&#128275;&nbsp; Mis sesiones activas</h3>
                ${others.length ? '<button class="btn btn-secondary btn-sm" type="button" data-logout-all>&#128267;&nbsp; Cerrar las demás</button>' : ''}
              </div>
              <p class="text-muted" style="font-size:12px;margin:8px 0 0;">
                Al cerrar una sesión, ese dispositivo quedará sin acceso hasta volver a iniciar sesión.
              </p>
              <div class="table-wrapper" style="margin-top:12px;">
                <table class="table">
                  <thead><tr><th>Dispositivo</th><th>Duración</th><th>Última actividad</th><th>Expira</th><th>Estado</th><th></th></tr></thead>
                  <tbody>${sessions.map(sessionRow).join('') || '<tr><td colspan="6" class="text-muted">Sin sesiones.</td></tr>'}</tbody>
                </table>
              </div>
            </div>`;

          let teamSection = '';
          if (isBoss) {
            const grouped = {};
            sessions.forEach((s) => {
              const uid = s.user && s.user._id ? s.user._id : 'sin-usuario';
              if (!grouped[uid]) {
                grouped[uid] = {
                  name: s.user && s.user.name ? s.user.name : 'Usuario',
                  email: s.user && s.user.email ? s.user.email : '',
                  sessions: [],
                };
              }
              grouped[uid].sessions.push(s);
            });
            const teamRows = Object.values(grouped).map((g) => {
              const last = g.sessions.reduce((acc, s) => {
                const t = s.lastSeenAt ? new Date(s.lastSeenAt).getTime() : 0;
                return t > acc ? t : acc;
              }, 0);
              return `
                <tr>
                  <td><strong>${UI.escapeHtml(g.name)}</strong><br><small class="text-muted">${UI.escapeHtml(g.email)}</small></td>
                  <td>${g.sessions.length}</td>
                  <td>${last ? Format.dateTime(new Date(last)) : '—'}</td>
                  <td><button class="btn btn-danger btn-sm" type="button" data-revoke-user="${g.sessions[0].user._id}">Cerrar todas</button></td>
                </tr>`;
            }).join('');
            teamSection = `
              <div class="card">
                <h3 style="margin-top:0;">&#128101;&nbsp; Sesiones del equipo</h3>
                <div class="table-wrapper" style="margin-top:12px;">
                  <table class="table">
                    <thead><tr><th>Usuario</th><th>Sesiones</th><th>Última actividad</th><th></th></tr></thead>
                    <tbody>${teamRows || '<tr><td colspan="4" class="text-muted">Sin sesiones de otros usuarios.</td></tr>'}</tbody>
                  </table>
                </div>
              </div>`;
          }

          tabContent.innerHTML = `${myTable}${teamSection}`;

          const logoutAllBtn = tabContent.querySelector('[data-logout-all]');
          if (logoutAllBtn) {
            logoutAllBtn.addEventListener('click', async () => {
              try {
                await API.sessions.logoutAll();
                UI.toast('Se cerraron las demás sesiones', 'success');
                renderSessions();
              } catch (error) {
                UI.toast(error.message, 'error');
              }
            });
          }

          tabContent.querySelectorAll('[data-revoke]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const ok = await UI.confirm('¿Cerrar esta sesión? El dispositivo perderá el acceso.');
              if (!ok) return;
              try {
                const res = await API.sessions.revoke(btn.dataset.revoke);
                UI.toast(res.selfRevoked ? 'Sesión actual cerrada' : 'Sesión cerrada', 'success');
                if (res && res.selfRevoked) {
                  window.ApiClient.clearToken();
                  window.location.replace('index.html');
                  return;
                }
                renderSessions();
              } catch (error) {
                UI.toast(error.message, 'error');
              }
            });
          });

          tabContent.querySelectorAll('[data-revoke-user]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const ok = await UI.confirm('¿Cerrar TODAS las sesiones de este usuario?');
              if (!ok) return;
              try {
                await API.sessions.revokeUser(btn.dataset.revokeUser);
                UI.toast('Sesiones del usuario cerradas', 'success');
                renderSessions();
              } catch (error) {
                UI.toast(error.message, 'error');
              }
            });
          });
        })
        .catch((error) => {
          tabContent.innerHTML = UI.errorAlert(error.message);
        });
    }

    function renderCatalog() {
      tabContent.innerHTML = '<div class="loading">Cargando configuración del catálogo...</div>';
      API.settings.public()
        .then((settings) => {
          const l = settings.landing || {};
          tabContent.innerHTML = `
            <div class="card">
              <h3 style="margin-top:0;">&#127760;&nbsp; Catálogo público</h3>
              <p class="text-muted" style="font-size:13px;">
                Cambia aquí los textos del catálogo público (página de inmuebles). Los cambios se reflejan
                de inmediato, sin tocar el código.
              </p>
              <div class="catalog-actions" style="display:flex;gap:10px;margin:14px 0;flex-wrap:wrap;">
                <a class="btn btn-primary" href="landing.html" target="_blank" rel="noopener">&#128279;&nbsp; Abrir catálogo público</a>
              </div>
              <form id="catalog-form">
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 16px;">
                  ${UI.field('whatsappNumber', 'Número de WhatsApp (con código de país)', { type: 'text', value: settings.whatsappNumber || '', placeholder: 'Ej. 5216623188580', hint: 'Solo dígitos. El número que recibirá los mensajes del catálogo.' })}
                  ${UI.field('agencyName', 'Nombre de la agencia / empresa', { type: 'text', value: settings.agencyName || '', placeholder: 'Ej. FV DIGITAL' })}
                  ${UI.field('heroTitle', 'Título del encabezado', { type: 'text', value: l.heroTitle || '', full: true })}
                  ${UI.field('heroSubtitle', 'Subtítulo del encabezado', { type: 'text', value: l.heroSubtitle || '', full: true })}
                  ${UI.field('contactTitle', 'Título de la sección de contacto', { type: 'text', value: l.contactTitle || '' })}
                  ${UI.field('contactText', 'Texto de contacto', { type: 'text', value: l.contactText || '' })}
                  ${UI.field('footerText', 'Texto del pie de página', { type: 'text', value: l.footerText || '' })}
                  ${UI.field('websiteUrl', 'Sitio web oficial (inmobles.com)', { type: 'text', value: l.websiteUrl || '', placeholder: 'https://inmobles.com', hint: 'Enlace que aparece en el menú, pie de página y tarjetas.' })}
                  ${UI.field('catalogEnabled', 'Mostrar el catálogo público', { type: 'checkbox', value: l.catalogEnabled !== false })}
                </div>
                <div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap;">
                  <button class="btn btn-primary" type="submit">Guardar cambios</button>
                  <a class="btn btn-secondary" href="properties.html">Administrar propiedades</a>
                </div>
              </form>
            </div>
          `;

          const form = tabContent.querySelector('#catalog-form');
          if (form) form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const values = UI.collectForm(form);
            const payload = {
              whatsappNumber: values.whatsappNumber,
              agencyName: values.agencyName,
              heroTitle: values.heroTitle,
              heroSubtitle: values.heroSubtitle,
              contactTitle: values.contactTitle,
              contactText: values.contactText,
              footerText: values.footerText,
              websiteUrl: values.websiteUrl,
              catalogEnabled: values.catalogEnabled,
            };
            const btn = form.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.classList.add('loading');
            try {
              await API.settings.landing(payload);
              UI.toast('Catálogo actualizado', 'success');
              renderCatalog();
            } catch (error) {
              UI.toast(error.message, 'error');
              btn.disabled = false;
              btn.classList.remove('loading');
            }
          });
        })
        .catch((error) => {
          tabContent.innerHTML = UI.errorAlert(error.message);
        });
    }

    function renderUsers() {
      if (!isAdmin) return renderAdminOnly();
      tabContent.innerHTML = `
        <div id="solicitudes-admin-card" style="margin-bottom:18px;"></div>
        <div id="users-crud"></div>
      `;
      renderAdminSolicitudes(tabContent.querySelector('#solicitudes-admin-card'));
      crudPage(tabContent.querySelector('#users-crud'), {
        title: 'Usuarios',
        newLabel: 'Nuevo usuario',
        service: {
          list: (params) => API.users.list(params),
          create: (body) => API.users.create(body),
          update: (id, body) => API.users.update(id, body),
          remove: (id) => API.users.remove(id),
        },
        statusOptions: ['activo', 'inactivo'],
        columns: [
          { key: 'name', label: 'Nombre', render: (r) => `${UI.escapeHtml(r.name)}<br><small class="text-muted">@${UI.escapeHtml(r.username)}</small>` },
          { key: 'email', label: 'Correo', render: (r) => UI.escapeHtml(r.email) },
          { key: 'role', label: 'Rol', render: (r) => UI.badge(r.role ? r.role.name : '—', 'info') },
          { key: 'status', label: 'Estado', render: (r) => UI.statusBadge(r.status) },
          { key: 'joinedAt', label: 'Alta', render: (r) => Format.date(r.joinedAt) },
        ],
        fields: [
          { name: 'name', label: 'Nombre', type: 'text', required: true },
          { name: 'username', label: 'Usuario', type: 'text', required: true },
          { name: 'email', label: 'Correo', type: 'email', required: true },
          { name: 'password', label: 'Contraseña', type: 'password', hint: 'Solo si es nuevo o se quiere cambiar' },
          { name: 'role', label: 'Rol', type: 'select', options: roles.map((x) => ({ value: x._id, label: x.name })) },
          { name: 'phone', label: 'Teléfono', type: 'tel' },
          { name: 'position', label: 'Cargo', type: 'text' },
          { name: 'status', label: 'Estado', type: 'select', options: ['activo', 'inactivo'] },
        ],
        formData(values, record) {
          const body = { ...values };
          if (record && !body.password) delete body.password;
          return body;
        },
        onEdit: true,
        onRemove: true,
      });
    }

    function defaultUsernameFromEmailAdmin(email) {
      const base = String(email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9._]/g, '').replace(/^[.\-_]+|[.\-_]+$/g, '');
      const result = (base || 'usuario').slice(0, 18);
      return result.length >= 3 ? result : result + (result.length === 1 ? 'ux' : 'x');
    }

    async function renderAdminSolicitudes(box) {
      if (!box) return;
      try {
        const solicitudes = await API.userRequests.list();        const pendientes = solicitudes.filter((s) => s.status === 'pendiente');
        if (!pendientes.length) {
          box.innerHTML = '';
          return;
        }
        const rolLabel = { asesor: 'Asesor', admin: 'Administrador', gerencia: 'Gerencia' };
        box.innerHTML = `
          <div class="card" style="border-left:4px solid var(--warning);">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
              <div>
                <strong>&#128229;&nbsp; ${pendientes.length} solicitud(es) de acceso pendiente(s)</strong>
                <p class="text-muted" style="font-size:12px;margin:2px 0 0;">Revisa y crea la cuenta desde aquí.</p>
              </div>
            </div>
            <div style="margin-top:12px;">
              ${pendientes.map((s) => `
                <div class="ann-item" style="border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;background:var(--bg-card,var(--surface));">
                  <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;">
                    <div>
                      <strong>${UI.escapeHtml(s.name)}</strong>
                      <div class="text-muted" style="font-size:12px;margin-top:2px;">${UI.escapeHtml(s.email)} &middot; Rol: ${rolLabel[s.role] || s.role} &middot; ${Format.date(s.createdAt)}</div>
                      ${s.phone ? `<div class="text-muted" style="font-size:11px;">Tel: ${UI.escapeHtml(s.phone)}</div>` : ''}
                      ${s.message ? `<div class="text-muted" style="font-size:12px;margin-top:4px;font-style:italic;">"${UI.escapeHtml(s.message)}"</div>` : ''}
                    </div>
                    <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;">
                      <button class="btn btn-primary btn-sm admin-srq-approve" data-id="${s._id}">Aprobar</button>
                      <button class="btn btn-danger btn-sm admin-srq-reject" data-id="${s._id}">Rechazar</button>
                      <button class="btn btn-secondary btn-sm admin-srq-delete" data-id="${s._id}">Eliminar</button>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
        box.querySelectorAll('.admin-srq-approve').forEach((btn) => {
          btn.addEventListener('click', () => {
            const s = pendientes.find((x) => String(x._id) === String(btn.dataset.id));
            if (s) aprobarSolicitudAdmin(s);
          });
        });
        box.querySelectorAll('.admin-srq-reject').forEach((btn) => {
          btn.addEventListener('click', () => {
            const s = pendientes.find((x) => String(x._id) === String(btn.dataset.id));
            if (s) rechazarSolicitudAdmin(s);
          });
        });
        box.querySelectorAll('.admin-srq-delete').forEach((btn) => {
          btn.addEventListener('click', () => {
            const s = pendientes.find((x) => String(x._id) === String(btn.dataset.id));
            if (s && confirm(`¿Eliminar la solicitud de ${s.name}?`)) {
              API.userRequests.remove(s._id).then(() => renderAdminSolicitudes(box)).catch((e) => alert(e.message));
            }
          });
        });
      } catch (e) {
        box.innerHTML = `<div class="card" style="border-left:4px solid var(--danger);padding:12px;"><strong>No se pudieron cargar las solicitudes</strong><p class="text-muted" style="font-size:12px;margin:2px 0 0;">${UI.escapeHtml(e.message || 'Error de red')}</p></div>`;
      }
    }

    async function aprobarSolicitudAdmin(request) {
      const options = roles.map((r) => `<option value="${r._id}" ${r.code === request.role ? 'selected' : ''}>${UI.escapeHtml(r.name)}</option>`).join('');
      const modal = UI.openModal({
        title: '&#128994;&nbsp; Aprobar solicitud',
        size: 540,
        body: `
          <p class="text-muted" style="margin-top:0;">Se creará una cuenta para <strong>${UI.escapeHtml(request.name)}</strong>. Completa los datos.</p>
          <div class="form-group"><label>Nombre *</label><input id="adm-srq-name" type="text" value="${UI.escapeHtml(request.name)}"></div>
          <div class="form-grid">
            <div class="form-group"><label>Usuario *</label><input id="adm-srq-username" type="text" value="${UI.escapeHtml(defaultUsernameFromEmailAdmin(request.email))}"></div>
            <div class="form-group"><label>Correo *</label><input id="adm-srq-email" type="email" value="${UI.escapeHtml(request.email)}"></div>
          </div>
          <div class="form-grid">
            <div class="form-group"><label>Teléfono</label><input id="adm-srq-phone" type="tel" value="${UI.escapeHtml(request.phone || '')}"></div>
            <div class="form-group"><label>Rol *</label><select id="adm-srq-role">${options}</select></div>
          </div>
          <div class="form-group"><label>Contraseña * (mín. 8 caracteres)</label><input id="adm-srq-password" type="password" autocomplete="new-password"></div>
          <div id="adm-srq-error" class="alert alert-error" style="display:none;"></div>
        `,
        footer: `
          <button class="btn btn-secondary" data-cancel type="button">Cancelar</button>
          <button class="btn btn-primary" data-ok type="button">Crear usuario</button>
        `,
      });

      const bodyEl = modal.bodyEl;
      const overlay = bodyEl.closest('#modal-overlay');
      if (!overlay) return;
      const errBox = bodyEl.querySelector('#adm-srq-error');
      const okBtn = overlay.querySelector('[data-ok]');
      const cancelBtn = overlay.querySelector('[data-cancel]');
      const close = () => UI.closeModal();
      if (cancelBtn) cancelBtn.addEventListener('click', close);

      if (okBtn) {
        okBtn.addEventListener('click', async () => {
          const name = bodyEl.querySelector('#adm-srq-name').value.trim();
          const username = bodyEl.querySelector('#adm-srq-username').value.trim().toLowerCase();
          const email = bodyEl.querySelector('#adm-srq-email').value.trim().toLowerCase();
          const phone = bodyEl.querySelector('#adm-srq-phone').value.trim();
          const role = bodyEl.querySelector('#adm-srq-role').value;
          const password = bodyEl.querySelector('#adm-srq-password').value;
          if (!name || username.length < 3 || !/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(email) || !password || password.length < 8) {
            errBox.style.display = 'block';
            errBox.textContent = 'Completa nombre, usuario (3+), correo válido y contraseña (8+).';
            return;
          }
          errBox.style.display = 'none';
          okBtn.disabled = true;
          try {
            await API.users.create({ name, username, email, phone, role, password, status: 'activo' });
            await API.userRequests.handle(request._id, { action: 'aprobada', comment: 'Cuenta creada desde panel admin' });
            UI.closeModal();
            renderUsers();
            UI.toast('Usuario creado y solicitud aprobada.', 'success');
          } catch (error) {
            okBtn.disabled = false;
            errBox.style.display = 'block';
            errBox.textContent = error.message || 'No se pudo crear el usuario.';
          }
        });
      }
      setTimeout(() => bodyEl.querySelector('#adm-srq-name').focus(), 120);
    }

    async function rechazarSolicitudAdmin(request) {
      const modal = UI.openModal({
        title: '&#10060;&nbsp; Rechazar solicitud',
        size: 440,
        body: `
          <p class="text-muted" style="margin-top:0;">¿Rechazar la solicitud de <strong>${UI.escapeHtml(request.name)}</strong>?</p>
          <div class="form-group"><label>Motivo (opcional)</label><textarea id="adm-srq-reason" rows="3"></textarea></div>
          <div id="adm-srq-reject-error" class="alert alert-error" style="display:none;"></div>
        `,
        footer: `
          <button class="btn btn-secondary" data-cancel type="button">Cancelar</button>
          <button class="btn btn-danger" data-ok type="button">Rechazar</button>
        `,
      });
      const bodyEl = modal.bodyEl;
      const overlay = bodyEl.closest('#modal-overlay');
      if (!overlay) return;
      const errBox = bodyEl.querySelector('#adm-srq-reject-error');
      const okBtn = overlay.querySelector('[data-ok]');
      const cancelBtn = overlay.querySelector('[data-cancel]');
      if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());
      if (okBtn) {
        okBtn.addEventListener('click', async () => {
          okBtn.disabled = true;
          try {
            await API.userRequests.handle(request._id, { action: 'rechazada', comment: bodyEl.querySelector('#adm-srq-reason').value.trim() });
            UI.closeModal();
            renderUsers();
            UI.toast('Solicitud rechazada.', 'success');
          } catch (error) {
            okBtn.disabled = false;
            errBox.style.display = 'block';
            errBox.textContent = error.message || 'No se pudo rechazar.';
          }
        });
      }
    }

    function renderRoles() {
      if (!isAdmin) return renderAdminOnly();
      API.roles.list().then((result) => {
        const rows = result
          .map((r) => `
            <tr>
              <td><strong>${UI.escapeHtml(r.name)}</strong><br><small class="text-muted">${UI.escapeHtml(r.description || '')}</small></td>
              <td>${UI.escapeHtml(r.code)}</td>
              <td>${r.permissions ? r.permissions.length : 0} permisos</td>
              <td>${UI.statusBadge(r.status)}</td>
            </tr>`)
          .join('');

        tabContent.innerHTML = `
          <div class="table-wrapper card">
            <table class="table">
              <thead><tr><th>Rol</th><th>Código</th><th>Permisos</th><th>Estado</th></tr></thead>
              <tbody>${rows || '<tr><td colspan="4" class="text-muted">Sin roles</td></tr>'}</tbody>
            </table>
          </div>
        `;
      }).catch((error) => {
        tabContent.innerHTML = UI.errorAlert(error.message);
      });
    }

    function renderRegister() {
      tabContent.innerHTML = '<div class="loading">Cargando...</div>';
      Promise.all([
        API.settings.getRoleKey(),
        API.settings.public().catch(() => null),
      ])
        .then(([keyResult, publicInfo]) => {
          const keyConfigured = Boolean(keyResult && keyResult.configured);
          const googleConfigured = Boolean(publicInfo && publicInfo.googleClientIdConfigured);
          tabContent.innerHTML = `
            <div class="grid grid-2">
              <div class="card">
                <h3 style="margin-top:0;">&#128273;&nbsp; Clave de registro para administrador / gerencia</h3>
                <p class="text-muted" style="font-size:13px;">
                  Cualquier persona que se registre con Google y elija <strong>Administrador</strong> o
                  <strong>Gerencia</strong> deberá escribir esta clave. Los asesores no la necesitan.
                </p>
                <p>
                  Estado:
                  ${keyConfigured
                    ? UI.badge('Clave configurada', 'success')
                    : UI.badge('No configurada', 'danger')}
                </p>
                <div class="form-group">
                  <label for="fld-role-key">Nueva clave (mínimo 6 caracteres)</label>
                  <input class="form-control" id="fld-role-key" type="password" placeholder="••••••••">
                  <small class="text-muted">Al guardar, la clave anterior deja de funcionar.</small>
                </div>
                <button class="btn btn-primary" type="button" data-save-key>&#128190;&nbsp; Guardar clave</button>
                <span id="role-key-status" class="text-muted" style="font-size:12px;margin-left:8px;"></span>
              </div>

              <div class="card">
                <h3 style="margin-top:0;">&#127760;&nbsp; Google Client ID</h3>
                <p class="text-muted" style="font-size:13px;">
                  Necesario para el botón "Registrarse con Google" del inicio de sesión.
                  Crea un <em>OAuth Client ID</em> (tipo Web) en Google Cloud Console y pégalo aquí.
                  <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Abrir Google Cloud Console</a>
                </p>
                <p>
                  Estado:
                  ${googleConfigured
                    ? UI.badge('Google configurado', 'success')
                    : UI.badge('No configurado', 'danger')}
                </p>
                <div class="form-group">
                  <label for="fld-google-id">Google Client ID</label>
                  <input class="form-control" id="fld-google-id" type="text" placeholder="1234567890-abcdef.apps.googleusercontent.com" value="${UI.escapeHtml((publicInfo && publicInfo.googleClientId) || '')}">
                </div>
                <button class="btn btn-secondary" type="button" data-save-google>&#128190;&nbsp; Guardar Google Client ID</button>
                <span id="google-status" class="text-muted" style="font-size:12px;margin-left:8px;"></span>
              </div>
            </div>
          `;

          const keyStatus = tabContent.querySelector('#role-key-status');
          const saveKeyBtn = tabContent.querySelector('[data-save-key]');
          if (saveKeyBtn) saveKeyBtn.addEventListener('click', async () => {
            const value = tabContent.querySelector('#fld-role-key').value;
            if (!value || value.length < 6) {
              UI.toast('La clave debe tener al menos 6 caracteres.', 'error');
              return;
            }
            keyStatus.textContent = 'Guardando...';
            try {
              await API.settings.setRoleKey({ roleKey: value });
              keyStatus.textContent = '';
              UI.toast('Clave de registro actualizada.', 'success');
              tabContent.querySelector('#fld-role-key').value = '';
              renderRegister();
            } catch (error) {
              keyStatus.textContent = '';
              UI.toast(error.message, 'error');
            }
          });

          const googleStatus = tabContent.querySelector('#google-status');
          const saveGoogleBtn = tabContent.querySelector('[data-save-google]');
          if (saveGoogleBtn) saveGoogleBtn.addEventListener('click', async () => {
            const value = tabContent.querySelector('#fld-google-id').value.trim();
            if (!value) {
              UI.toast('Ingresa un Google Client ID.', 'error');
              return;
            }
            googleStatus.textContent = 'Guardando...';
            try {
              await API.settings.setGoogleClientId({ googleClientId: value });
              googleStatus.textContent = '';
              UI.toast('Google Client ID guardado.', 'success');
              renderRegister();
            } catch (error) {
              googleStatus.textContent = '';
              UI.toast(error.message, 'error');
            }
          });
        })
        .catch((error) => {
          tabContent.innerHTML = UI.errorAlert(error.message);
        });
    }

    function renderAlerts() {
      const remindersOn = window.App && window.App.remindersEnabled ? window.App.remindersEnabled() : false;
      const permission = 'Notification' in window ? Notification.permission : 'unsupported';
      const soundOn = window.Sounds ? window.Sounds.enabled() : true;
      tabContent.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            <button class="btn btn-primary" type="button" data-generate-alerts>&#128276;&nbsp; Generar avisos ahora</button>
            <button class="btn btn-secondary" type="button" data-mark-all>&#10003;&nbsp; Marcar todos como leídos</button>
            <span id="alerts-status" class="text-muted" style="font-size:12px;"></span>
          </div>
          <p class="text-muted" style="font-size:12px;margin:10px 0 0;">
            Los avisos se generan automáticamente al detectar: citas próximas, tareas vencidas,
            metas por vencer, documentos pendientes, negocios sin actualizar o cancelados, nuevos prospectos
            y propiedades apartadas.
          </p>
        </div>

        <div class="card" style="margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
            <div>
              <h3 style="margin:0;">&#128276;&nbsp; Recordatorios del navegador</h3>
              <p class="text-muted" style="font-size:12px;margin:6px 0 0;">
                Recibe una notificación cuando una tarea o cita está por comenzar (dentro de las próximas 2 horas).
                Se aplica solo a este navegador y este dispositivo.
              </p>
            </div>
            <button class="btn ${remindersOn ? 'btn-primary' : 'btn-secondary'}" type="button" data-toggle-reminders>
              ${remindersOn ? '&#128275;&nbsp; Activados' : '&#128276;&nbsp; Activar recordatorios'}
            </button>
          </div>
          <p class="text-muted" style="font-size:12px;margin:8px 0 0;" id="reminder-permission">
            Permiso del navegador: ${permission === 'granted' ? UI.badge('Concedido', 'success') : permission === 'denied' ? UI.badge('Bloqueado', 'danger') : permission === 'unsupported' ? UI.badge('No compatible', 'muted') : UI.badge('Sin conceder', 'warning')}
          </p>
        </div>

        <div class="card" style="margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
            <div>
              <h3 style="margin:0;">&#128266;&nbsp; Sonidos del sistema</h3>
              <p class="text-muted" style="font-size:12px;margin:6px 0 0;">
                Reproduce un sonido cuando llegan notificaciones, avisos del equipo y un tono de bienvenida
                al iniciar sesión. Se aplica solo a este navegador y este dispositivo.
              </p>
            </div>
            <button class="btn ${soundOn ? 'btn-primary' : 'btn-secondary'}" type="button" data-toggle-sounds>
              ${soundOn ? '&#128266;&nbsp; Activados' : '&#128263;&nbsp; Desactivados'}
            </button>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
            <button class="btn btn-secondary btn-sm" type="button" data-preview-sound="welcome">&#127911;&nbsp; Probar bienvenida</button>
            <button class="btn btn-secondary btn-sm" type="button" data-preview-sound="notification">&#128276;&nbsp; Probar notificación</button>
            <button class="btn btn-secondary btn-sm" type="button" data-preview-sound="announcement">&#128227;&nbsp; Probar aviso</button>
          </div>
        </div>

        <div id="alerts-list"><div class="loading">Cargando avisos...</div></div>
      `;
      const status = tabContent.querySelector('#alerts-status');
      const listEl = tabContent.querySelector('#alerts-list');

      const toggleRemindersBtn = tabContent.querySelector('[data-toggle-reminders]');
      if (toggleRemindersBtn) toggleRemindersBtn.addEventListener('click', async () => {
        if (window.App.remindersEnabled()) {
          window.App.setRemindersEnabled(false);
          UI.toast('Recordatorios desactivados', 'info');
          renderAlerts();
          return;
        }
        if (!('Notification' in window)) {
          UI.toast('Este navegador no soporta notificaciones.', 'error');
          return;
        }
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          window.App.setRemindersEnabled(true);
          UI.toast('Recordatorios activados', 'success');
          renderAlerts();
        } else {
          UI.toast('Permiso denegado por el navegador. Actívalo en la configuración del sitio.', 'error');
        }
      });

      const genAlertsBtn = tabContent.querySelector('[data-generate-alerts]');
      if (genAlertsBtn) genAlertsBtn.addEventListener('click', async () => {
        status.textContent = 'Generando avisos...';
        try {
          const res = await API.notifications.generate();
          const generated = (res && res.generated) || 0;
          status.textContent = '';
          UI.toast(generated ? `${generated} avisos generados` : 'Sin avisos nuevos para generar', 'success');
          loadAlerts();
        } catch (error) {
          status.textContent = '';
          UI.toast(error.message, 'error');
        }
      });

      const markAllBtn = tabContent.querySelector('[data-mark-all]');
      if (markAllBtn) markAllBtn.addEventListener('click', async () => {
        try {
          await API.notifications.markAllRead();
          UI.toast('Todos los avisos marcados como leídos', 'success');
          loadAlerts();
        } catch (error) {
          UI.toast(error.message, 'error');
        }
      });

      const toggleSoundsBtn = tabContent.querySelector('[data-toggle-sounds]');
      if (toggleSoundsBtn) toggleSoundsBtn.addEventListener('click', () => {
        if (window.Sounds) {
          window.Sounds.setEnabled(!window.Sounds.enabled());
          UI.toast(window.Sounds.enabled() ? 'Sonidos activados' : 'Sonidos desactivados', window.Sounds.enabled() ? 'success' : 'info');
          renderAlerts();
        } else {
          UI.toast('Los sonidos aún no están disponibles.', 'error');
        }
      });

      tabContent.querySelectorAll('[data-preview-sound]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (window.Sounds) {
            window.Sounds.init();
            window.Sounds.preview(btn.dataset.previewSound);
          }
        });
      });

      async function loadAlerts() {
        listEl.innerHTML = '<div class="loading">Cargando avisos...</div>';
        try {
          const result = await API.notifications.list({ limit: 20 });
          const items = result.data || [];
          if (!items.length) {
            listEl.innerHTML = '<div class="card"><div class="empty-state"><p>No hay avisos generados.</p></div></div>';
            return;
          }
          listEl.innerHTML = `
            <div class="table-wrapper card">
              <table class="table">
                <thead><tr><th>Aviso</th><th>Tipo</th><th>Estado</th><th>Fecha</th></tr></thead>
                <tbody>
                  ${items.map((n) => `
                    <tr>
                      <td><strong>${UI.escapeHtml(n.title)}</strong><br><small class="text-muted">${UI.escapeHtml(n.message)}</small></td>
                      <td>${UI.badge(UI.escapeHtml(String(n.type || 'info').replace(/_/g, ' ')), 'info')}</td>
                      <td>${n.read ? UI.badge('Leído', 'muted') : UI.badge('Nuevo', 'success')}</td>
                      <td>${Format.dateTime(n.createdAt)}</td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
          `;
        } catch (error) {
          listEl.innerHTML = UI.errorAlert(error.message);
        }
      }

      loadAlerts();
    }

    function renderActivity() {
      tabContent.innerHTML = '<div class="loading">Cargando actividad...</div>';
      const contentEl = tabContent;
      API.activity.list({ limit: 50 })
        .then((result) => {
          const items = result.data || [];
          if (!items.length) {
            contentEl.innerHTML = '<div class="card"><div class="empty-state"><p>Sin actividad registrada.</p></div></div>';
            return;
          }
          contentEl.innerHTML = `
            <div class="table-wrapper card">
              <table class="table">
                <thead><tr><th>Acción</th><th>Usuario</th><th>Detalle</th><th>Fecha</th></tr></thead>
                <tbody>
                  ${items.map((a) => `
                    <tr>
                      <td>${UI.badge(UI.escapeHtml(String(a.action || '').replace(/_/g, ' ')), 'info')}</td>
                      <td>${a.user && a.user.name ? UI.escapeHtml(a.user.name) : '—'}</td>
                      <td><small>${UI.escapeHtml(a.message || '')}</small></td>
                      <td>${Format.dateTime(a.createdAt)}</td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
          `;
        })
        .catch((error) => {
          contentEl.innerHTML = UI.errorAlert(error.message);
        });
    }

    renderUsers();
  },
};
