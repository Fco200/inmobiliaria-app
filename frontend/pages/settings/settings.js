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
        <button class="btn btn-secondary" data-tab="guide" type="button">&#128214;&nbsp; Guía del sistema</button>
        <button class="btn btn-secondary" data-tab="activity" type="button">&#128221;&nbsp; Actividad del sistema</button>
      </div>
      <div id="tab-content"></div>
    `;

    const tabContent = container.querySelector('#tab-content');
    let currentTab = null;

    // Refresco en tiempo real: cuando alguien abre o cierra una sesión en
    // cualquier dispositivo, el servidor emite 'sessions-changed' y esta
    // pestaña se recarga sola si está visible.
    window.addEventListener('sessions-changed', () => {
      if (currentTab === 'sessions') renderSessions();
    });

    container.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('[data-tab]').forEach((b) => {
          b.classList.toggle('btn-primary', b === btn);
          b.classList.toggle('btn-secondary', b !== btn);
        });
        currentTab = btn.dataset.tab;
        if (btn.dataset.tab === 'users') renderUsers();
        else if (btn.dataset.tab === 'roles') renderRoles();
        else if (btn.dataset.tab === 'register') renderRegister();
        else if (btn.dataset.tab === 'alerts') renderAlerts();
        else if (btn.dataset.tab === 'sessions') renderSessions();
        else if (btn.dataset.tab === 'catalog') renderCatalog();
        else if (btn.dataset.tab === 'guide') renderGuide();
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

    // Enlace absoluto a la guía ilustrada (GUIA.HTML vive en la raíz del
    // frontend y se puede abrir sin iniciar sesión).
    function guideUrl() {
      return window.location.origin + '/GUIA.HTML';
    }

    // Guía pensada solo para asesores/usuarios (sin la parte de administrador).
    function userGuideUrl() {
      return window.location.origin + '/GUIAUSUARIO.HTML';
    }

    function guideMessage() {
      return `📖 Guía de uso de INMOBLES (administradores y usuarios):\n${guideUrl()}\n\nGuárdala y compártela con el equipo.`;
    }

    function copyGuideLink() {
      const url = guideUrl();
      const done = () => UI.toast('Enlace de la guía copiado', 'success');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(() => UI.toast(url, 'info'));
      } else {
        UI.toast(url, 'info');
      }
    }

    function copyUserGuideLink() {
      const url = userGuideUrl();
      const done = () => UI.toast('Enlace de la guía de usuarios copiado', 'success');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(() => UI.toast(url, 'info'));
      } else {
        UI.toast(url, 'info');
      }
    }

    // Envía el enlace de la guía a un canal del chat del sistema.
    async function shareGuideToChat(channel) {
      const getChat = channel === 'soporte' ? API.chats.soporte() : API.chats.general();
      const res = await getChat;
      const chat = res && typeof res === 'object' && res.data !== undefined && res.meta !== undefined ? res.data : res;
      if (!chat || !chat._id) throw new Error('Canal no disponible');
      await API.chats.sendMessage(chat._id, { message: guideMessage() });
    }

    function shareGuideChatModal() {
      const modal = UI.openModal({
        title: '&#128172;&nbsp; Compartir guía en el chat',
        size: 440,
        body: `
          <p class="text-muted" style="margin-top:0;">Elige el canal donde quieres publicar el enlace de la guía.</p>
          <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px;">
            <button class="btn btn-primary" type="button" data-share-channel="general">&#128172;&nbsp; Canal general (todo el equipo)</button>
            <button class="btn btn-secondary" type="button" data-share-channel="soporte">&#128736;&#65039;&nbsp; Soporte técnico</button>
          </div>
          <div id="share-guide-error" class="alert alert-error" style="display:none;margin-top:12px;"></div>
        `,
        footer: `<button class="btn btn-secondary" data-cancel type="button">Cancelar</button>`,
      });

      const bodyEl = modal.bodyEl;
      const overlay = bodyEl.closest('#modal-overlay');
      if (!overlay) return;
      const errBox = bodyEl.querySelector('#share-guide-error');
      const cancelBtn = overlay.querySelector('[data-cancel]');
      if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());

      bodyEl.querySelectorAll('[data-share-channel]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            await shareGuideToChat(btn.dataset.shareChannel);
            UI.closeModal();
            UI.toast('Guía compartida en el chat', 'success');
          } catch (error) {
            btn.disabled = false;
            errBox.style.display = 'block';
            errBox.textContent = error.message || 'No se pudo compartir la guía.';
          }
        });
      });
    }

    function renderGuide() {
      const url = guideUrl();
      const userUrl = userGuideUrl();
      tabContent.innerHTML = `
        <div class="card">
          <h3 style="margin-top:0;">&#128214;&nbsp; Guía de uso del sistema</h3>
          <p class="text-muted" style="font-size:13px;">
            Guía ilustrada con dos versiones: <strong>para el administrador</strong> (cómo agregar usuarios, roles,
            catálogo, avisos y seguridad) y <strong>para todos los usuarios</strong> (qué pueden hacer en cada módulo,
            paso a paso). Cualquiera puede abrirla <strong>sin iniciar sesión</strong>.
          </p>
          <div class="form-group">
            <label for="guide-link">Enlace de la guía completa (admin&nbsp;+&nbsp;usuarios)</label>
            <input class="form-control" id="guide-link" type="text" readonly value="${UI.escapeHtml(url)}">
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px;">
            <a class="btn btn-primary" href="GUIA.HTML" target="_blank" rel="noopener">&#128214;&nbsp; Abrir guía</a>
            <button class="btn btn-secondary" type="button" data-guide-copy>&#128279;&nbsp; Copiar enlace</button>
            <button class="btn btn-primary" type="button" data-guide-chat>&#128172;&nbsp; Compartir en el chat</button>
            <a class="btn btn-secondary" id="guide-wa" href="#" target="_blank" rel="noopener" style="background:#25d366;color:#fff;border-color:#128C7A;">&#128172;&nbsp; Enviar por WhatsApp</a>
          </div>
          <div class="form-group" style="margin-top:16px;">
            <label for="guide-user-link">Enlace de la guía para usuarios (sin la parte de administrador)</label>
            <input class="form-control" id="guide-user-link" type="text" readonly value="${UI.escapeHtml(userUrl)}">
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px;">
            <a class="btn btn-primary" href="GUIAUSUARIO.HTML" target="_blank" rel="noopener">&#128100;&nbsp; Abrir guía de usuarios</a>
            <button class="btn btn-secondary" type="button" data-guide-copy-user>&#128279;&nbsp; Copiar enlace</button>
          </div>
        </div>

        <div class="card">
          <h3 style="margin-top:0;">&#128238;&nbsp; Cómo compartirla con tu equipo</h3>
          <ol style="margin:8px 0 0;padding-left:20px;font-size:14px;line-height:1.9;">
            <li>Presiona <strong>Compartir en el chat</strong> y elige el <strong>Canal general</strong> (todo el equipo) o <strong>Soporte</strong>: el enlace llega como mensaje.</li>
            <li>Cualquiera lo abre con un toque, desde el celular o la computadora, y desde ahí regresa a la app.</li>
            <li>También puedes <strong>Copiar el enlace</strong> para pegarlo donde quieras, o enviarlo directo por WhatsApp.</li>
            <li>Para los asesores usa la <strong>guía para usuarios</strong> (sin la parte de administrador); tú siempre puedes ver la guía completa.</li>
            <li>Para mandar solo una guía desde el enlace completo, agrega <code>?g=admin</code> o <code>?g=usuario</code> al final.</li>
          </ol>
        </div>
      `;

      const wa = tabContent.querySelector('#guide-wa');
      if (wa) wa.href = `https://wa.me/?text=${encodeURIComponent(guideMessage())}`;

      const linkInput = tabContent.querySelector('#guide-link');
      if (linkInput) {
        const selectAll = () => linkInput.select();
        linkInput.addEventListener('focus', selectAll);
        linkInput.addEventListener('click', selectAll);
      }

      const userLinkInput = tabContent.querySelector('#guide-user-link');
      if (userLinkInput) {
        const selectAll = () => userLinkInput.select();
        userLinkInput.addEventListener('focus', selectAll);
        userLinkInput.addEventListener('click', selectAll);
      }

      const copyBtn = tabContent.querySelector('[data-guide-copy]');
      if (copyBtn) copyBtn.addEventListener('click', copyGuideLink);

      const copyUserBtn = tabContent.querySelector('[data-guide-copy-user]');
      if (copyUserBtn) copyUserBtn.addEventListener('click', copyUserGuideLink);

      const chatBtn = tabContent.querySelector('[data-guide-chat]');
      if (chatBtn) chatBtn.addEventListener('click', shareGuideChatModal);
    }

    // Detalle legible de cada permiso: el admin ve qué HABILITA cada casilla
    // antes de crear al usuario (p. ej. una secretaria), sin adivinar.
    const PERMISSION_DETAILS = {
      dashboard_view: { module: 'Panel principal', icon: '&#128202;', desc: 'Ver el dashboard con el resumen de su actividad.' },
      users_manage: { module: 'Usuarios', icon: '&#128101;', desc: 'Crear, editar y dar de baja usuarios del CRM.' },
      roles_manage: { module: 'Usuarios', icon: '&#128273;', desc: 'Crear y modificar roles y sus permisos.' },
      clients_manage: { module: 'Clientes', icon: '&#129309;', desc: 'Registrar, editar y dar seguimiento a clientes.' },
      properties_manage: { module: 'Propiedades', icon: '&#127968;', desc: 'Captar, editar y publicar propiedades.' },
      inventory_manage: { module: 'Propiedades', icon: '&#128230;', desc: 'Administrar el inventario de propiedades.' },
      businesses_manage: { module: 'Negocios', icon: '&#128188;', desc: 'Gestionar negocios y su etapa en el embudo.' },
      appointments_manage: { module: 'Citas', icon: '&#128197;', desc: 'Agendar y administrar citas.' },
      tasks_manage: { module: 'Tareas', icon: '&#9989;', desc: 'Crear y dar seguimiento a tareas.' },
      goals_manage: { module: 'Metas', icon: '&#127919;', desc: 'Definir y consultar metas de ventas.' },
      documents_manage: { module: 'Documentos', icon: '&#128193;', desc: 'Subir y administrar documentos.' },
      expenses_manage: { module: 'Gastos', icon: '&#128176;', desc: 'Registrar y consultar gastos.' },
      tickets_manage: { module: 'Tickets', icon: '&#127903;', desc: 'Administrar el valor y control de tickets.' },
      reports_view: { module: 'Reportes', icon: '&#128200;', desc: 'Ver reportes de su actividad.' },
      reports_gerencia: { module: 'Reportes', icon: '&#128202;', desc: 'Ver reportes de gerencia (todo el equipo).' },
      audit_view: { module: 'Seguridad', icon: '&#128373;', desc: 'Consultar la auditoría y la actividad del sistema.' },
      settings_manage: { module: 'Configuración', icon: '&#9881;', desc: 'Cambiar la configuración del sistema.' },
      prospecting_manage: { module: 'Prospección', icon: '&#128270;', desc: 'Administrar la prospección de clientes.' },
    };

    function renderUsers() {
      if (!isAdmin) return renderAdminOnly();
      tabContent.innerHTML = `
        <div id="solicitudes-admin-card" style="margin-bottom:18px;"></div>
        <div id="users-crud"></div>
      `;
      renderAdminSolicitudes(tabContent.querySelector('#solicitudes-admin-card'));
      API.permissions.list().then((perms) => {
        const permissions = Array.isArray(perms) ? perms : (perms && perms.data ? perms.data : []);
        const roleOptions = [...roles.map((x) => ({ value: x._id, label: x.name })), { value: '__custom__', label: 'Personalizado (elegir permisos)' }];

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
            { name: 'role', label: 'Rol', type: 'select', options: roleOptions },
            { name: 'phone', label: 'Teléfono', type: 'tel' },
            { name: 'position', label: 'Cargo', type: 'text' },
            { name: 'status', label: 'Estado', type: 'select', options: ['activo', 'inactivo'] },
          ],
          formData(values, record, form) {
            const body = { ...values };
            if (record && !body.password) delete body.password;

            // Al crear con rol personalizado, el <select> de rol envía el valor
            // "__custom__": se conserva para que el backend cree el rol a
            // partir de los permisos elegidos (el validador lo acepta).
            const customRole = form ? form.querySelector('#fld-role') : null;
            const isCustom = (customRole && customRole.value === '__custom__') || body.role === '__custom__';
            if (isCustom) {
              body.role = '__custom__';
              const checks = form ? Array.from(form.querySelectorAll('input[data-custom-perm]:checked')) : [];
              body.customPermissions = checks.map((c) => c.value);
              if (!body.customPermissions.length) {
                throw new Error('Selecciona al menos un permiso para el usuario personalizado.');
              }
            }
            return body;
          },
          onFormMount(form, record) {
            const roleSel = form.querySelector('#fld-role');
            if (!roleSel) return;

            // Al EDITAR un usuario cuyo rol no está en la lista cargada (p. ej.
            // un rol personalizado creado después de abrir la pantalla), se
            // agrega la opción para no cambiar su rol sin querer.
            if (record && record.role && record.role._id) {
              const rid = String(record.role._id);
              if (!Array.from(roleSel.options).some((o) => o.value === rid)) {
                const opt = document.createElement('option');
                opt.value = rid;
                opt.textContent = record.role.name || 'Rol actual';
                roleSel.insertBefore(opt, roleSel.firstChild);
              }
              roleSel.value = rid;
            }

            const wrap = document.createElement('div');
            wrap.className = 'form-field form-field-full';
            wrap.id = 'custom-perms-wrap';
            wrap.style.display = 'none';
            wrap.style.gridColumn = '1 / -1';

            const groups = {};
            permissions.forEach((p) => {
              const meta = PERMISSION_DETAILS[p.code] || {};
              const mod = meta.module || p.module || 'General';
              if (!groups[mod]) groups[mod] = [];
              groups[mod].push({ ...p, _meta: meta });
            });

            const total = permissions.length;
            let html = `
              <div class="custom-perms-head">
                <div>
                  <label class="form-label" style="margin:0;">Permisos del usuario personalizado</label>
                  <small class="text-muted">Marca lo que este usuario podr&aacute; hacer. ${total} permisos disponibles.</small>
                </div>
                <div class="custom-perms-quick">
                  <button type="button" class="btn btn-secondary btn-sm" data-perms-all>Marcar todos</button>
                  <button type="button" class="btn btn-secondary btn-sm" data-perms-none>Limpiar</button>
                  <span class="custom-perms-count" data-perms-count>0 / ${total}</span>
                </div>
              </div>
              <div class="custom-perms-grid">`;

            Object.keys(groups).sort().forEach((mod) => {
              html += `<div class="custom-perms-group">
                <div class="custom-perms-group-title">${UI.escapeHtml(mod)}</div>`;
              groups[mod].forEach((p) => {
                const meta = p._meta || {};
                html += `
                  <label class="custom-perm">
                    <input type="checkbox" data-custom-perm value="${p._id}">
                    <span class="custom-perm-info">
                      <span class="custom-perm-name">${meta.icon ? meta.icon + ' ' : ''}${UI.escapeHtml(p.name)}</span>
                      <span class="custom-perm-desc">${UI.escapeHtml(meta.desc || p.description || 'Acceso al m\u00f3dulo de ' + p.module + '.')}</span>
                    </span>
                  </label>`;
              });
              html += `</div>`;
            });

            html += `</div>`;
            wrap.innerHTML = html;

            const grid = form.querySelector('.crud-form-grid');
            if (grid) grid.appendChild(wrap); else form.appendChild(wrap);

            const boxes = () => Array.from(wrap.querySelectorAll('input[data-custom-perm]'));
            const countEl = wrap.querySelector('[data-perms-count]');
            const updateCount = () => {
              const n = boxes().filter((c) => c.checked).length;
              if (countEl) countEl.textContent = `${n} / ${total}`;
            };
            boxes().forEach((c) => c.addEventListener('change', updateCount));

            const allBtn = wrap.querySelector('[data-perms-all]');
            if (allBtn) allBtn.addEventListener('click', () => { boxes().forEach((c) => { c.checked = true; }); updateCount(); });
            const noneBtn = wrap.querySelector('[data-perms-none]');
            if (noneBtn) noneBtn.addEventListener('click', () => { boxes().forEach((c) => { c.checked = false; }); updateCount(); });

            const toggle = () => {
              const on = roleSel.value === '__custom__';
              wrap.style.display = on ? '' : 'none';
              if (on) wrap.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            };
            roleSel.addEventListener('change', toggle);
            toggle();
            updateCount();
          },
          // Editar SÍ está disponible para las cuentas administrativas (admin,
          // gerencia) y para soporte. Al editar un usuario con rol
          // personalizado se puede ajustar sus datos.
          onEdit: true,
          onRemove: true,
          // No permitir borrar cuentas de Administrador / Gerencia / Soporte.
          // Tampoco los usuarios con rol personalizado pueden borrarlas (aquí
          // se oculta el botón directamente).
          canRemove(record) {
            const code = record && record.role && record.role.code ? record.role.code : '';
            return !['admin', 'gerencia', 'superadmin'].includes(code);
          },
        });
      }).catch((error) => {
        tabContent.innerHTML = UI.errorAlert(error.message);
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
              <td>${r.isSystem ? '' : '<button class="btn btn-danger btn-sm" data-role-del="' + r._id + '">Eliminar</button>'}</td>
            </tr>`)
          .join('');

        tabContent.innerHTML = `
          <div class="table-wrapper card">
            <table class="table">
              <thead><tr><th>Rol</th><th>Código</th><th>Permisos</th><th>Estado</th><th></th></tr></thead>
              <tbody>${rows || '<tr><td colspan="5" class="text-muted">Sin roles</td></tr>'}</tbody>
            </table>
          </div>
        `;
        tabContent.querySelectorAll('[data-role-del]').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!confirm('¿Eliminar este rol?')) return;
            try { await API.roles.remove(btn.dataset.roleDel); UI.toast('Rol eliminado', 'success'); renderRoles(); }
            catch (e) { UI.toast(e.message, 'error'); }
          });
        });
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

        <div class="card" style="margin-bottom:16px;" id="push-card">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
            <div>
              <h3 style="margin:0;">&#128241;&nbsp; Notificaciones push (app)</h3>
              <p class="text-muted" style="font-size:12px;margin:6px 0 0;">
                Recibe los avisos del CRM aunque la aplicación esté cerrada: en Android, escritorio y
                en iPhone/iPad (agregando la app a la pantalla de inicio). Se aplica solo a este dispositivo.
              </p>
            </div>
            <div id="push-actions"><span class="text-muted" style="font-size:12px;">Comprobando...</span></div>
          </div>
          <p class="text-muted" style="font-size:12px;margin:8px 0 0;" id="push-status"></p>
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
            <button class="btn btn-secondary btn-sm" type="button" data-preview-sound="confirmation">&#10004;&nbsp; Probar confirmación</button>
            <button class="btn btn-secondary btn-sm" type="button" data-preview-sound="sendMessage">&#128172;&nbsp; Probar envío chat</button>
            <button class="btn btn-secondary btn-sm" type="button" data-preview-sound="receiveMessage">&#128172;&nbsp; Probar recepción chat</button>
            <button class="btn btn-secondary btn-sm" type="button" data-preview-sound="step">&#9679;&nbsp; Probar paso (guía)</button>
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
            window.Sounds.preview(btn.dataset.previewSound).catch(() => {});
          }
        });
      });

      // Tarjeta de notificaciones push: si el módulo push.js aún no cargó
      // (multipage lo difiere), se trae aquí mismo y se pinta el estado real
      // de la suscripción del dispositivo.
      async function initPushCard() {
        const actions = tabContent.querySelector('#push-actions');
        const statusEl = tabContent.querySelector('#push-status');
        if (!actions || !statusEl) return;

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
        if (!Push) {
          actions.innerHTML = '<span class="text-muted" style="font-size:12px;">No disponible</span>';
          statusEl.textContent = '';
          return;
        }
        if (!Push.supported()) {
          // En iPhone (Safari, sin instalar) las notificaciones no están
          // disponibles hasta agregar la app a la pantalla de inicio. En vez de
          // un "No compatible" sin salida, se ofrece la guía paso a paso.
          if (typeof Push.needsIosInstall === 'function' && Push.needsIosInstall()) {
            actions.innerHTML = '<button class="btn btn-primary" type="button" data-push-ios>&#128241;&nbsp; Cómo activar en iPhone</button>';
            statusEl.textContent = 'En iPhone, agrega la app a la pantalla de inicio para poder recibir notificaciones.';
            const iosBtn = actions.querySelector('[data-push-ios]');
            if (iosBtn) iosBtn.addEventListener('click', () => Push.showIosNotificationGuide());
            return;
          }
          actions.innerHTML = '<button class="btn btn-secondary" type="button" disabled>No compatible</button>';
          statusEl.textContent = 'Este navegador o dispositivo no soporta notificaciones push.';
          return;
        }

        let st;
        try { st = await Push.status(); } catch (error) { st = { supported: true, permission: Push.permission(), enabled: false }; }

        const permBadge = st.permission === 'granted'
          ? UI.badge('Permiso concedido', 'success')
          : st.permission === 'denied'
            ? UI.badge('Permiso bloqueado', 'danger')
            : UI.badge('Permiso sin conceder', 'warning');
        statusEl.innerHTML = `Estado: ${st.enabled ? UI.badge('Activadas', 'success') : UI.badge('Desactivadas', 'muted')} · ${permBadge}`;

        actions.innerHTML = st.enabled
          ? `<button class="btn btn-secondary" type="button" data-push-off>&#128263;&nbsp; Desactivar</button>
             <button class="btn btn-secondary btn-sm" type="button" data-push-test style="margin-left:8px;">&#128276;&nbsp; Probar</button>`
          : `<button class="btn btn-primary" type="button" data-push-on>&#128276;&nbsp; Activar push</button>`;

        const onBtn = actions.querySelector('[data-push-on]');
        if (onBtn) onBtn.addEventListener('click', async () => {
          onBtn.disabled = true;
          onBtn.textContent = 'Activando...';
          try {
            await Push.enable();
            UI.toast('Notificaciones push activadas en este dispositivo', 'success');
          } catch (error) {
            UI.toast(error.message, 'error');
          }
          renderAlerts();
        });

        const offBtn = actions.querySelector('[data-push-off]');
        if (offBtn) offBtn.addEventListener('click', async () => {
          offBtn.disabled = true;
          try {
            await Push.disable();
            UI.toast('Notificaciones push desactivadas', 'info');
          } catch (error) {
            UI.toast(error.message, 'error');
          }
          renderAlerts();
        });

        const testBtn = actions.querySelector('[data-push-test]');
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
      }

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
      initPushCard();
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
