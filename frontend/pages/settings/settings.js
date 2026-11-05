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
    const permissions = me.role && Array.isArray(me.role.permissions) ? me.role.permissions : [];
    // Los seis roles oficiales del CRM. El nombre visible se normaliza aquí
    // (la cuenta histórica "admin" se muestra como "Administración").
    const OFFICIAL_ROLE_LABELS = {
      direccion: 'Dirección',
      admin: 'Administración',
      gerencia: 'Gerencia',
      asistencia: 'Asistencia',
      escrituracion: 'Escrituración',
      asesor: 'Asesor',
    };
    const OFFICIAL_ROLE_CODES = ['direccion', 'admin', 'gerencia', 'asistencia', 'escrituracion', 'asesor'];
    const officialRoleLabel = (code, fallback) => OFFICIAL_ROLE_LABELS[code] || fallback || code || '—';
    // Los roles cargados desde el backend, ordenados como los pide la
    // inmobiliaria. Se usa tanto en el alta/edición de usuarios como en la
    // aprobación de solicitudes para que ambos formularios ofrezcan SIEMPRE
    // los seis roles oficiales (nunca `superadmin`, que es soporte técnico).
    const rolesByCode = {};
    roles.forEach((r) => {
      const code = String((r && r.code) || '');
      if (code) rolesByCode[code] = r;
    });
    const officialRoleOptions = () => OFFICIAL_ROLE_CODES
      .map((code) => {
        const role = rolesByCode[code];
        return role ? { value: role._id, label: officialRoleLabel(code, role.name) } : null;
      })
      .filter(Boolean);
    const isAdmin = ['admin', 'direccion', 'superadmin'].includes(roleCode);
    const canManageUsers = isAdmin || roleCode === 'asistencia';
    const canViewActivity = isAdmin || permissions.includes('audit_view');
    const isBoss = isAdmin
      || roleCode === 'gerencia'
      || roleCode === 'asistencia'
      || permissions.includes('settings_manage');
    const canManageNewsletter = ['admin', 'direccion', 'gerencia', 'asistencia', 'superadmin', 'system_admin'].includes(roleCode);
    const canManageFlow = ['admin', 'direccion', 'superadmin', 'system_admin'].includes(roleCode);
    if (!isBoss) {
      container.innerHTML = `
        <div class="card">
          <div class="empty-state">
            <p>No tienes permiso para ver la configuración del sistema.</p>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="page-header">
        <h2>Configuración</h2>
        ${isAdmin ? '<button class="btn btn-secondary" type="button" data-normalize-folios>Normalizar folios</button>' : ''}
      </div>
      <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
        <button class="btn btn-primary" data-tab="users" type="button">Usuarios</button>
        ${isAdmin ? '<button class="btn btn-secondary" data-tab="roles" type="button">Roles y permisos</button>' : ''}
        <button class="btn btn-secondary" data-tab="register" type="button">&#128274;&nbsp; Registro</button>
        <button class="btn btn-secondary" data-tab="alerts" type="button">&#128276;&nbsp; Avisos</button>
        ${canManageNewsletter ? '<button class="btn btn-secondary" data-tab="newsletter" type="button">&#128231;&nbsp; Boletín y campañas</button>' : ''}
        ${canManageFlow ? '<button class="btn btn-secondary" data-tab="flow" type="button">&#128200;&nbsp; Flujo de negocio</button>' : ''}
        <button class="btn btn-secondary" data-tab="sessions" type="button">&#128275;&nbsp; Sesiones</button>
        <button class="btn btn-secondary" data-tab="catalog" type="button">&#127760;&nbsp; Catálogo público</button>
        <button class="btn btn-secondary" data-tab="guide" type="button">&#128214;&nbsp; Guía del sistema</button>
        ${canViewActivity ? '<button class="btn btn-secondary" data-tab="activity" type="button">&#128221;&nbsp; Actividad del sistema</button>' : ''}
      </div>
      <div id="tab-content"></div>
    `;

    const tabContent = container.querySelector('#tab-content');
    let currentTab = null;

    const normalizeFoliosBtn = container.querySelector('[data-normalize-folios]');
    if (normalizeFoliosBtn) {
      normalizeFoliosBtn.addEventListener('click', async () => {
        const ok = await UI.confirm('Se convertirán los folios heredados al formato AÑO-###. ¿Continuar?');
        if (!ok) return;
        normalizeFoliosBtn.disabled = true;
        try {
          const result = await API.properties.normalizeFolios();
          UI.toast(`Folios normalizados: ${result.updated || 0} de ${result.total || 0}.`, 'success');
        } catch (error) {
          UI.toast(error.message, 'error');
        } finally {
          normalizeFoliosBtn.disabled = false;
        }
      });
    }

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
        else if (btn.dataset.tab === 'newsletter') renderNewsletter();
        else if (btn.dataset.tab === 'flow') renderBusinessFlow();
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
      if (!canManageUsers) return renderAdminOnly();
      tabContent.innerHTML = `
        <div id="solicitudes-admin-card" style="margin-bottom:18px;"></div>
        <div id="users-crud"></div>
      `;
      renderAdminSolicitudes(tabContent.querySelector('#solicitudes-admin-card'));
      if (new URLSearchParams(window.location.search).get('solicitudes') === '1') {
        setTimeout(() => {
          const card = document.getElementById('solicitudes-admin-card');
          if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 400);
      }
      API.permissions.list().then((perms) => {
        const permissions = Array.isArray(perms) ? perms : (perms && perms.data ? perms.data : []);
        // Los seis roles oficiales, en el orden solicitado. Administración y
        // Dirección también pueden asignar roles personalizados; Asistencia
        // solo los seis oficiales (el backend valida lo mismo).
        const roleOptions = [
          ...(isAdmin
            ? UI.sortByLabel(roles, (x) => officialRoleLabel(x.code, x.name)).map((x) => ({
              value: x._id,
              label: officialRoleLabel(x.code, x.name),
            }))
            : officialRoleOptions()),
          ...(isAdmin ? [{ value: '__custom__', label: 'Personalizado (elegir permisos)' }] : []),
        ];

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
            { key: 'role', label: 'Rol', render: (r) => UI.badge(r.role ? officialRoleLabel(r.role.code, r.role.name) : '—', 'info') },
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
          canEdit(record) {
            if (isAdmin) return true;
            const code = record && record.role && record.role.code ? record.role.code : '';
            return ['asesor', 'asistencia', 'escrituracion'].includes(code);
          },
          // No permitir borrar cuentas de Administrador / Dirección / Gerencia / Soporte.
          // Tampoco los usuarios con rol personalizado pueden borrarlas (aquí
          // se oculta el botón directamente).
          canRemove(record) {
            const code = record && record.role && record.role.code ? record.role.code : '';
            return !['admin', 'direccion', 'gerencia', 'superadmin'].includes(code);
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
        const rolLabel = OFFICIAL_ROLE_LABELS;
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
                      <div class="text-muted" style="font-size:12px;margin-top:2px;">${UI.escapeHtml(s.email)} &middot; Rol: ${UI.escapeHtml(rolLabel[s.role] || s.role || '—')} &middot; ${Format.date(s.createdAt)}</div>
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

    function mostrarResultadoAprobacion(result) {
      const account = (result && result.account) || {};
      if (account.temporaryPassword) {
        const modal = UI.openModal({
          title: 'Cuenta creada: entrega la contraseña',
          size: 480,
          body: `
            <p class="text-muted" style="margin-top:0;">${UI.escapeHtml(result.message || '')}</p>
            <div class="card" style="padding:12px;">
              <div><strong>Usuario:</strong> ${UI.escapeHtml(account.username || '')}</div>
              <div><strong>Contraseña temporal:</strong> <code>${UI.escapeHtml(account.temporaryPassword)}</code></div>
              <div class="text-muted" style="font-size:12px;margin-top:6px;">Se muestra una sola vez. La persona debe cambiarla al entrar por primera vez.</div>
            </div>
          `,
          footer: '<button class="btn btn-primary" data-cancel type="button">Entendido</button>',
        });
        const overlay = modal.bodyEl ? modal.bodyEl.closest('#modal-overlay') : null;
        const doneBtn = overlay ? overlay.querySelector('[data-cancel]') : null;
        if (doneBtn) doneBtn.addEventListener('click', () => UI.closeModal());
        return;
      }
      UI.toast((result && result.message) || 'Solicitud aprobada.', account.created && !account.emailSent ? 'warning' : 'success');
    }

    async function aprobarSolicitudAdmin(request) {
      const requestCode = String(request.role || 'asesor');
      const options = OFFICIAL_ROLE_CODES.map((code) => {
        const role = rolesByCode[code];
        if (!role) return '';
        return `<option value="${code}" ${code === requestCode ? 'selected' : ''}>${UI.escapeHtml(officialRoleLabel(code, role.name))}</option>`;
      }).join('');
      const modal = UI.openModal({
        title: 'Aprobar solicitud',
        size: 520,
        body: `
          <p class="text-muted" style="margin-top:0;">
            Se creará la cuenta de <strong>${UI.escapeHtml(request.name)}</strong> (${UI.escapeHtml(request.email)}).
            El sistema genera el usuario y una contraseña temporal, y los envía por correo junto con el enlace de acceso.
          </p>
          <div class="form-group"><label>Rol *</label><select id="adm-srq-role">${options}</select></div>
          <p class="text-muted" style="font-size:12px;">Si el correo ya tiene una cuenta, no se cambia su rol ni su estado: solo recibe un aviso.</p>
          <div id="adm-srq-error" class="alert alert-error" style="display:none;"></div>
        `,
        footer: `
          <button class="btn btn-secondary" data-cancel type="button">Cancelar</button>
          <button class="btn btn-primary" data-ok type="button">Aprobar y enviar credenciales</button>
        `,
      });

      const bodyEl = modal.bodyEl;
      const overlay = bodyEl.closest('#modal-overlay');
      if (!overlay) return;
      const errBox = bodyEl.querySelector('#adm-srq-error');
      const okBtn = overlay.querySelector('[data-ok]');
      const cancelBtn = overlay.querySelector('[data-cancel]');
      if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());

      if (okBtn) {
        okBtn.addEventListener('click', async () => {
          const role = bodyEl.querySelector('#adm-srq-role').value;
          errBox.style.display = 'none';
          const originalText = okBtn.textContent;
          okBtn.disabled = true;
          okBtn.textContent = 'Aprobando y enviando...';
          try {
            const result = await API.userRequests.handle(request._id, { action: 'aprobada', role });
            UI.closeModal();
            renderUsers();
            mostrarResultadoAprobacion(result);
          } catch (error) {
            okBtn.disabled = false;
            okBtn.textContent = originalText;
            errBox.style.display = 'block';
            errBox.textContent = error.message || 'No se pudo aprobar la solicitud.';
          }
        });
      }
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
                <h3 style="margin-top:0;">&#128273;&nbsp; Clave de registro para administración / gerencia</h3>
                <p class="text-muted" style="font-size:13px;">
                  Cualquier persona que se registre con Google y elija <strong>Administración</strong> o
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

    let nlPage = 1;
    const nlFilters = { q: '', status: '' };

    function renderNewsletter() {
      const campaignRoleOptions = OFFICIAL_ROLE_CODES
        .map((code) => rolesByCode[code])
        .filter(Boolean)
        .map((r) => `<option value="${UI.escapeHtml(r.code)}">${UI.escapeHtml(officialRoleLabel(r.code, r.name))}</option>`)
        .join('');

      tabContent.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
          <h3 style="margin:0 0 6px;">&#128231;&nbsp; Boletín y campañas de correo</h3>
          <p class="text-muted" style="font-size:12px;margin:0;">
            Consulta a los suscriptores del sitio, administra altas/bajas y envía correos a suscriptores,
            usuarios del CRM y clientes. Cada correo se envía por separado para proteger la privacidad de la lista.
          </p>
        </div>
        <div class="card" style="margin-bottom:16px;" id="nl-mail-card">
          <div style="display:flex;gap:12px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;">
            <div>
              <h3 style="margin:0 0 6px;">&#9993;&nbsp; Estado del correo</h3>
              <div id="nl-mail-status" class="text-muted" style="font-size:12.5px;">Consultando...</div>
            </div>
            <button class="btn btn-secondary" type="button" id="nl-mail-test">&#128231;&nbsp; Enviar correo de prueba</button>
          </div>
        </div>
        <div id="nl-stats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px;"></div>
        <div class="card" style="margin-bottom:16px;">
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
            <div class="form-group" style="flex:1 1 220px;margin:0;">
              <label for="nl-search">Buscar</label>
              <input class="form-control" id="nl-search" type="text" placeholder="Correo, nombre u origen…" value="${UI.escapeHtml(nlFilters.q)}">
            </div>
            <div class="form-group" style="min-width:150px;margin:0;">
              <label for="nl-status">Estado</label>
              <select class="form-control" id="nl-status">
                <option value="">Todos</option>
                <option value="suscrito" ${nlFilters.status === 'suscrito' ? 'selected' : ''}>Suscritos</option>
                <option value="dado_baja" ${nlFilters.status === 'dado_baja' ? 'selected' : ''}>Dados de baja</option>
              </select>
            </div>
            <button class="btn btn-secondary" type="button" id="nl-refresh">&#8635;&nbsp; Actualizar</button>
            <button class="btn btn-secondary" type="button" id="nl-export">&#128229;&nbsp; Exportar CSV</button>
          </div>
          <div id="nl-alert" class="alert" style="margin:12px 0 0;display:none;"></div>
        </div>
        <div id="nl-list"><div class="loading">Cargando suscriptores...</div></div>

        <div class="card" style="margin:16px 0;">
          <h3 style="margin:0 0 6px;">&#128231;&nbsp; Enviar campaña</h3>
          <p class="text-muted" style="font-size:12px;margin:0 0 14px;">
            Elige la audiencia y redacta el mensaje. En modo desarrollo (sin SMTP) el envío se simula y queda registrado en el historial.
          </p>
          <form id="nl-form">
            <div class="form-grid">
              <div class="form-group">
                <label for="nl-subject">Asunto *</label>
                <input class="form-control" id="nl-subject" name="subject" type="text" maxlength="160" required placeholder="Nuevas propiedades disponibles">
              </div>
              <div class="form-group">
                <label for="nl-audience">Destinatarios *</label>
                <select class="form-control" id="nl-audience" name="audience" required>
                  <option value="suscriptores">Suscriptores del boletín</option>
                  <option value="usuarios">Usuarios activos del CRM</option>
                  <option value="clientes">Clientes con correo registrado</option>
                  <option value="todos">Todos (sin duplicados)</option>
                </select>
              </div>
              <div class="form-group">
                <label for="nl-role">Filtrar usuarios por rol (opcional)</label>
                <select class="form-control" id="nl-role" name="role">
                  <option value="">Todos los roles</option>
                  ${campaignRoleOptions}
                </select>
              </div>
              <div class="form-group">
                <label for="nl-intro">Saludo / introducción (opcional)</label>
                <input class="form-control" id="nl-intro" name="intro" type="text" maxlength="300" placeholder="Compartimos contigo estas novedades:">
              </div>
            </div>
            <div class="form-group" style="margin-top:12px;">
              <label for="nl-message">Contenido del correo *</label>
              <textarea class="form-control" id="nl-message" name="message" rows="7" maxlength="12000" required placeholder="Escribe aquí las novedades, propiedades o promociones que quieres compartir…"></textarea>
            </div>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px;">
              <button class="btn btn-primary" id="nl-send" type="submit">&#128231;&nbsp; Enviar campaña</button>
              <span class="text-muted" style="font-size:12px;">Revisa el contenido antes de enviarlo: la acción no se puede deshacer.</span>
            </div>
            <div id="nl-form-alert" class="alert" style="margin:12px 0 0;display:none;"></div>
          </form>
        </div>

        <div class="card">
          <h3 style="margin:0 0 12px;">Historial de campañas</h3>
          <div id="nl-history"><div class="loading">Cargando historial...</div></div>
        </div>
      `;

      const statsEl = tabContent.querySelector('#nl-stats');
      const listEl = tabContent.querySelector('#nl-list');
      const alertEl = tabContent.querySelector('#nl-alert');
      const formAlert = tabContent.querySelector('#nl-form-alert');
      const mailStatusEl = tabContent.querySelector('#nl-mail-status');
      const mailTestBtn = tabContent.querySelector('#nl-mail-test');

      const renderMailStatus = (status) => {
        if (!mailStatusEl || !status) return;
        const names = { smtp: 'SMTP', resend: 'Resend', brevo: 'Brevo', sendgrid: 'SendGrid' };
        const badge = status.configured
          ? UI.badge(`Activo: ${names[status.provider] || status.provider}`, 'success')
          : UI.badge('Sin configurar (modo simulado)', 'warning');
        const lines = [`Estado: ${badge}`];
        if (status.from) lines.push(`Remitente: <code>${UI.escapeHtml(status.from)}</code>`);
        if (status.source === 'panel') lines.push('Configurado desde: <strong>Panel de soporte</strong>');
        if (status.lastSuccessAt) lines.push(`Ultimo envio correcto: ${new Date(status.lastSuccessAt).toLocaleString()}`);
        if (status.lastError) lines.push(`<span style="color:#b91c1c;">Ultimo error: ${UI.escapeHtml(status.lastError)}</span>`);
        if (!status.configured) lines.push('<span style="color:#b45309;">Pide a soporte configurar el proveedor en <strong>Panel de soporte &gt; Correo</strong>.</span>');
        if (status.hint) lines.push(`<span style="color:#b45309;">${UI.escapeHtml(status.hint)}</span>`);
        mailStatusEl.innerHTML = lines.join('<br>');
      };

      const refreshMailStatus = async () => {
        try {
          const status = await API.newsletter.mailStatus();
          renderMailStatus(status);
        } catch (error) {
          if (mailStatusEl) mailStatusEl.textContent = 'No se pudo consultar el estado del correo: ' + error.message;
        }
      };

      if (mailTestBtn) {
        mailTestBtn.addEventListener('click', async () => {
          const suggested = (me && me.email) || '';
          const target = window.prompt('Correo de destino para la prueba:', suggested);
          if (target === null) return;
          const original = mailTestBtn.textContent;
          mailTestBtn.disabled = true;
          mailTestBtn.textContent = 'Enviando...';
          try {
            const result = await API.newsletter.sendTestMail({ email: String(target || '').trim() });
            UI.toast((result && result.message) || 'Correo de prueba enviado.', result && result.simulated ? 'warning' : 'success');
          } catch (error) {
            UI.toast(error.message || 'No se pudo enviar el correo de prueba.', 'error');
          } finally {
            mailTestBtn.disabled = false;
            mailTestBtn.textContent = original;
            refreshMailStatus();
          }
        });
      }
      refreshMailStatus();

      const showBox = (el, message, type) => {
        if (!el) return;
        el.className = `alert alert-${type || 'info'}`;
        el.textContent = message;
        el.style.display = message ? '' : 'none';
      };

      const audienceLabel = (value) => ({
        suscriptores: 'Suscriptores',
        usuarios: 'Usuarios del CRM',
        clientes: 'Clientes',
        todos: 'Todos (sin duplicados)',
      }[value] || value || '—');

      function renderStats(stats) {
        const s = stats || {};
        statsEl.innerHTML = `
          <div class="card" style="text-align:center;padding:14px;">
            <b style="display:block;font-size:22px;">${s.total || 0}</b>
            <span class="text-muted" style="font-size:12px;">Registros</span>
          </div>
          <div class="card" style="text-align:center;padding:14px;">
            <b style="display:block;font-size:22px;">${s.suscritos || 0}</b>
            <span class="text-muted" style="font-size:12px;">Suscritos</span>
          </div>
          <div class="card" style="text-align:center;padding:14px;">
            <b style="display:block;font-size:22px;">${s.bajas || 0}</b>
            <span class="text-muted" style="font-size:12px;">Dados de baja</span>
          </div>
          <div class="card" style="text-align:center;padding:14px;">
            <b style="display:block;font-size:22px;">${s.usuarios || 0}</b>
            <span class="text-muted" style="font-size:12px;">Usuarios activos</span>
          </div>
          <div class="card" style="text-align:center;padding:14px;">
            <b style="display:block;font-size:22px;">${s.clientes || 0}</b>
            <span class="text-muted" style="font-size:12px;">Clientes con correo</span>
          </div>
        `;
      }

      async function loadSubscribers() {
        listEl.innerHTML = '<div class="loading">Cargando suscriptores...</div>';
        try {
          const d = await API.newsletter.subscribers({
            q: nlFilters.q,
            status: nlFilters.status,
            page: nlPage,
            limit: 50,
          });
          renderStats(d && d.stats);
          const subs = (d && d.subscribers) || [];
          const total = (d && d.total) || 0;
          const pages = (d && d.pages) || 1;
          nlPage = (d && d.page) || nlPage;

          if (!subs.length) {
            listEl.innerHTML = '<div class="card"><div class="empty-state"><p>No hay suscriptores que coincidan con el filtro.</p></div></div>';
            return;
          }

          listEl.innerHTML = `
            <div class="table-wrapper card">
              <table class="table">
                <thead><tr><th>Correo</th><th>Nombre</th><th>Origen</th><th>Estado</th><th>Alta</th><th>Acciones</th></tr></thead>
                <tbody>
                  ${subs.map((s) => {
                    const activo = s.status === 'suscrito';
                    return `
                    <tr>
                      <td>${UI.escapeHtml(s.email || '')}</td>
                      <td>${UI.escapeHtml(s.name || '—')}</td>
                      <td>${UI.escapeHtml(s.source || '—')}</td>
                      <td>${UI.badge(activo ? 'Suscrito' : 'Dado de baja', activo ? 'success' : 'muted')}</td>
                      <td>${Format.dateTime(s.createdAt)}</td>
                      <td style="white-space:nowrap;">
                        <button class="btn btn-secondary btn-sm" type="button" data-nl-toggle="${UI.escapeHtml(s._id)}" data-next="${activo ? 'dado_baja' : 'suscrito'}">${activo ? 'Dar de baja' : 'Reactivar'}</button>
                        <button class="btn btn-danger btn-sm" type="button" data-nl-del="${UI.escapeHtml(s._id)}">Eliminar</button>
                      </td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
              <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 4px 0;">
                <span class="text-muted" style="font-size:12px;">${total} registro${total === 1 ? '' : 's'} · Página ${nlPage} de ${pages}</span>
                <span style="display:flex;gap:8px;">
                  <button class="btn btn-secondary btn-sm" type="button" data-nl-prev ${nlPage <= 1 ? 'disabled' : ''}>← Anterior</button>
                  <button class="btn btn-secondary btn-sm" type="button" data-nl-next ${nlPage >= pages ? 'disabled' : ''}>Siguiente →</button>
                </span>
              </div>
            </div>
          `;

          listEl.querySelectorAll('[data-nl-toggle]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              btn.disabled = true;
              try {
                await API.newsletter.updateSubscriber(btn.dataset.nlToggle, { status: btn.dataset.next });
                showBox(alertEl, btn.dataset.next === 'suscrito' ? 'Suscriptor reactivado.' : 'Suscriptor dado de baja.', 'success');
                loadSubscribers();
              } catch (error) {
                btn.disabled = false;
                showBox(alertEl, error.message, 'error');
              }
            });
          });

          listEl.querySelectorAll('[data-nl-del]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const ok = await UI.confirm('¿Eliminar este suscriptor del boletín? Esta acción no se puede deshacer.');
              if (!ok) return;
              btn.disabled = true;
              try {
                await API.newsletter.removeSubscriber(btn.dataset.nlDel);
                showBox(alertEl, 'Suscriptor eliminado.', 'success');
                loadSubscribers();
              } catch (error) {
                btn.disabled = false;
                showBox(alertEl, error.message, 'error');
              }
            });
          });

          const prev = listEl.querySelector('[data-nl-prev]');
          if (prev) prev.addEventListener('click', () => { nlPage -= 1; loadSubscribers(); });
          const next = listEl.querySelector('[data-nl-next]');
          if (next) next.addEventListener('click', () => { nlPage += 1; loadSubscribers(); });
        } catch (error) {
          listEl.innerHTML = UI.errorAlert(error.message);
        }
      }

      const CAMPAIGN_STATUS_LABELS = { en_cola: 'En cola', en_proceso: 'Enviando…', interrumpida: 'Interrumpida', fallida: 'Fallida' };

      async function loadHistory() {
        const box = tabContent.querySelector('#nl-history');
        if (!box) return;
        box.innerHTML = '<div class="loading">Cargando historial...</div>';
        try {
          const logs = await API.newsletter.campaigns({ limit: 15 });
          const rows = Array.isArray(logs) ? logs : [];
          const pending = rows.some((l) => ['en_cola', 'en_proceso'].includes((l.data || {}).status));
          if (pending) setTimeout(loadHistory, 4000);
          if (!rows.length) {
            box.innerHTML = '<div class="empty-state"><p>Todavía no se han enviado campañas.</p></div>';
            return;
          }
          box.innerHTML = `
            <div class="table-wrapper">
              <table class="table">
                <thead><tr><th>Asunto</th><th>Destinatarios</th><th>Entregados</th><th>Fallidos</th><th>Enviada por</th><th>Fecha</th></tr></thead>
                <tbody>
                  ${rows.map((l) => {
                    const d = l.data || {};
                    const autor = l.user ? (l.user.name || l.user.username || l.user.email) : '—';
                    return `
                    <tr>
                      <td>${UI.escapeHtml(d.subject || l.message || '—')}${CAMPAIGN_STATUS_LABELS[d.status] ? ` ${UI.badge(CAMPAIGN_STATUS_LABELS[d.status], 'info')}` : ''}</td>
                      <td>${UI.escapeHtml(audienceLabel(d.audience))} · ${d.total || 0}</td>
                      <td>${UI.badge(String(d.enviados || 0), 'success')}</td>
                      <td>${d.fallidos ? UI.badge(String(d.fallidos), 'danger') : '0'}</td>
                      <td>${UI.escapeHtml(autor || '—')}</td>
                      <td>${Format.dateTime(l.createdAt)}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `;
        } catch (error) {
          box.innerHTML = UI.errorAlert(error.message);
        }
      }

      const search = tabContent.querySelector('#nl-search');
      let searchTimer = null;
      search.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          nlFilters.q = search.value.trim();
          nlPage = 1;
          loadSubscribers();
        }, 350);
      });

      const statusSel = tabContent.querySelector('#nl-status');
      statusSel.addEventListener('change', () => {
        nlFilters.status = statusSel.value;
        nlPage = 1;
        loadSubscribers();
      });

      tabContent.querySelector('#nl-refresh').addEventListener('click', () => loadSubscribers());

      const exportBtn = tabContent.querySelector('#nl-export');
      exportBtn.addEventListener('click', async () => {
        exportBtn.disabled = true;
        try {
          await API.newsletter.exportCsv({ status: nlFilters.status });
          showBox(alertEl, 'Listado exportado en CSV.', 'success');
        } catch (error) {
          showBox(alertEl, error.message, 'error');
        } finally {
          exportBtn.disabled = false;
        }
      });

      const form = tabContent.querySelector('#nl-form');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submit = tabContent.querySelector('#nl-send');
        const data = new FormData(form);
        const subject = String(data.get('subject') || '').trim();
        const message = String(data.get('message') || '').trim();
        const audience = String(data.get('audience') || 'suscriptores');
        const role = String(data.get('role') || '');
        const intro = String(data.get('intro') || '').trim();

        if (!subject || !message) {
          showBox(formAlert, 'Escribe el asunto y el contenido del correo.', 'error');
          return;
        }

        const ok = await UI.confirm(`¿Enviar la campaña "${subject}" a ${audienceLabel(audience).toLowerCase()}?\n\nRevisa el contenido: esta acción no se puede deshacer.`);
        if (!ok) return;

        submit.disabled = true;
        showBox(formAlert, '', 'info');
        try {
          const r = await API.newsletter.sendCampaign({ subject, audience, role, intro, message });
          showBox(formAlert, (r && r.message) || 'Campaña en cola.', 'success');
          form.reset();
          loadHistory();
        } catch (error) {
          showBox(formAlert, error.message, 'error');
        } finally {
          submit.disabled = false;
        }
      });

      loadSubscribers();
      loadHistory();
    }

    // ── Flujo de negocio (configurable por el administrador) ─────────────────
    let flowRows = [];

    async function renderBusinessFlow() {
      tabContent.innerHTML = '<div class="loading">Cargando flujo de negocio...</div>';
      try {
        const res = await API.businesses.flow();
        flowRows = (res.stages || []).map((s) => ({ ...s, next: [...(s.next || [])] }));
        drawBusinessFlow();
      } catch (error) {
        tabContent.innerHTML = UI.errorAlert(error.message);
      }
    }

    // Copia lo que el administrador escribió en la tabla hacia flowRows.
    function collectBusinessFlow() {
      tabContent.querySelectorAll('tr[data-row]').forEach((tr) => {
        const row = flowRows[Number(tr.dataset.row)];
        if (!row) return;
        row.label = tr.querySelector('[data-label]').value.trim();
        row.color = tr.querySelector('[data-color]').value;
        const active = tr.querySelector('[data-active]');
        row.active = active ? active.checked : true;
        row.next = Array.from(tr.querySelectorAll('[data-next]'))
          .filter((c) => c.checked)
          .map((c) => flowRows[Number(c.dataset.next)])
          .filter((target) => target && target.code)
          .map((target) => target.code);
      });
    }

    function moveBusinessFlow(index, delta) {
      collectBusinessFlow();
      const target = index + delta;
      if (target < 0 || target >= flowRows.length) return;
      [flowRows[index], flowRows[target]] = [flowRows[target], flowRows[index]];
      drawBusinessFlow();
    }

    function drawBusinessFlow() {
      const rows = flowRows.map((s, i) => `
        <tr data-row="${i}">
          <td style="white-space:nowrap;">
            <button class="btn btn-secondary btn-sm" type="button" data-up="${i}" ${i === 0 ? 'disabled' : ''}>&#9650;</button>
            <button class="btn btn-secondary btn-sm" type="button" data-down="${i}" ${i === flowRows.length - 1 ? 'disabled' : ''}>&#9660;</button>
          </td>
          <td><input class="form-control" data-label value="${UI.escapeHtml(s.label)}" maxlength="60"></td>
          <td><input type="color" data-color value="${UI.escapeHtml(s.color || '#64748b')}"></td>
          <td style="text-align:center;"><input type="checkbox" data-active ${s.active ? 'checked' : ''} ${s.system ? 'disabled' : ''}></td>
          <td>
            <details>
              <summary>${s.next && s.next.length ? `${s.next.length} etapa(s)` : 'Cualquiera'}</summary>
              <div style="display:flex;flex-direction:column;gap:4px;padding:6px 0;">
                ${flowRows.map((o, j) => (j === i ? '' : `
                  <label style="font-size:12px;"><input type="checkbox" data-next="${j}" ${s.next && s.next.includes(o.code) ? 'checked' : ''}> ${UI.escapeHtml(o.label)}</label>`)).join('')}
              </div>
            </details>
          </td>
          <td>${s.system ? UI.badge('Sistema', 'info') : UI.badge(s.active ? 'Activa' : 'Inactiva', s.active ? 'success' : 'muted')}</td>
        </tr>`).join('');

      tabContent.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
          <h3 style="margin:0 0 6px;">&#128200;&nbsp; Flujo de negocio</h3>
          <p class="text-muted" style="font-size:13px;margin:0 0 8px;">
            Define las etapas por las que pasa un negocio, en el orden en que deben seguirse.
          </p>
          <ul class="text-muted" style="font-size:12px;margin:0 0 0 18px;">
            <li><strong>Orden:</strong> usa las flechas. Así se muestran en el tablero y en los selectores.</li>
            <li><strong>Puede pasar a:</strong> si no eliges ninguna, el negocio puede cambiar a cualquier etapa. Si eliges algunas, solo podrá pasar a esas. Dirección, administración y soporte pueden saltarse la regla.</li>
            <li><strong>Activa:</strong> las inactivas dejan de ofrecerse para negocios nuevos, pero los que ya están en ella se conservan.</li>
            <li><strong>Sistema:</strong> Concluido, Cancelado y Pausa no se pueden quitar, porque el resto del sistema las usa.</li>
          </ul>
        </div>

        <div class="card" style="margin-bottom:16px;">
          <div class="table-wrapper">
            <table class="table">
              <thead><tr><th>Orden</th><th>Nombre de la etapa</th><th>Color</th><th>Activa</th><th>Puede pasar a</th><th>Tipo</th></tr></thead>
              <tbody>${rows || '<tr><td colspan="6">Sin etapas.</td></tr>'}</tbody>
            </table>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:14px;">
            <div class="form-group" style="flex:1;min-width:220px;margin:0;">
              <label for="flow-new-label">Nueva etapa</label>
              <input class="form-control" id="flow-new-label" type="text" maxlength="60" placeholder="Ej. Contrato firmado">
            </div>
            <button class="btn btn-secondary" type="button" data-flow-add>+ Agregar etapa</button>
          </div>
        </div>

        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <button class="btn btn-primary" type="button" data-flow-save>Guardar flujo</button>
          <span class="text-muted" style="font-size:12px;">Los cambios se aplican a los negocios de inmediato.</span>
        </div>
      `;

      tabContent.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => moveBusinessFlow(Number(b.dataset.up), -1)));
      tabContent.querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', () => moveBusinessFlow(Number(b.dataset.down), 1)));

      tabContent.querySelector('[data-flow-add]').addEventListener('click', () => {
        collectBusinessFlow();
        const input = tabContent.querySelector('#flow-new-label');
        const label = (input.value || '').trim();
        if (!label) {
          UI.toast('Escribe el nombre de la nueva etapa.', 'warning');
          return;
        }
        flowRows.push({ label, color: '#64748b', active: true, system: false, next: [] });
        drawBusinessFlow();
      });

      tabContent.querySelector('[data-flow-save]').addEventListener('click', async (event) => {
        collectBusinessFlow();
        const btn = event.currentTarget;
        btn.disabled = true;
        try {
          const payload = flowRows.map((r) => ({
            code: r.code,
            label: r.label,
            color: r.color,
            active: r.active,
            next: r.next || [],
          }));
          const res = await API.businesses.saveFlow(payload);
          flowRows = (res.stages || []).map((s) => ({ ...s, next: [...(s.next || [])] }));
          UI.toast('Flujo de negocio guardado.', 'success');
          drawBusinessFlow();
        } catch (error) {
          UI.toast(error.message, 'error');
          btn.disabled = false;
        }
      });
    }

    function renderActivity() {
      if (!canViewActivity) return renderAdminOnly();
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
