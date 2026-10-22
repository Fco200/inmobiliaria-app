'use strict';

window.AppShell = (() => {
  const NAV = [
    { key: 'home', label: 'Inicio', href: 'home.html', icon: '&#127969;', section: 'Principal' },
    { key: 'dashboard', label: 'Dashboard', href: 'dashboard.html', icon: '&#9638;', section: 'Principal' },
    { key: 'prospecting', label: 'Prospección', href: 'prospecting.html', icon: '&#128269;', section: 'Comercial' },
    { key: 'clients', label: 'Clientes', href: 'clients.html', icon: '&#128101;', section: 'Comercial' },
    { key: 'businesses', label: 'Negocios', href: 'businesses.html', icon: '&#128179;', section: 'Comercial' },
    { key: 'appointments', label: 'Citas', href: 'appointments.html', icon: '&#128197;', section: 'Comercial' },
    { key: 'calendar', label: 'Calendario', href: 'calendar.html', icon: '&#128467;', section: 'Comercial' },
    { key: 'tasks', label: 'Tareas', href: 'tasks.html', icon: '&#9745;', section: 'Comercial' },
    { key: 'goals', label: 'Metas', href: 'goals.html', icon: '&#127919;', section: 'Comercial' },
    { key: 'properties', label: 'Captar Propiedades', href: 'properties.html', icon: '&#127968;', section: 'Propiedades' },
    { key: 'inventory', label: 'Propiedades', href: 'inventory.html', icon: '&#128230;', section: 'Propiedades' },
    { key: 'expenses', label: 'Gastos', href: 'expenses.html', icon: '&#128184;', section: 'Finanzas' },
    { key: 'reports', label: 'Reportes', href: 'reports.html', icon: '&#128202;', section: 'Finanzas' },
    { key: 'management', label: 'Gerencia', href: 'management.html', icon: '&#128200;', section: 'Finanzas', boss: true },
    { key: 'documents', label: 'Formatos', href: 'documents.html', icon: '&#128196;', section: 'Recursos' },
    { key: 'notifications', label: 'Avisos', href: 'notifications.html', icon: '&#128276;', section: 'Recursos' },
    { key: 'directorio', label: 'Directorio', href: 'directorio.html', icon: '&#128101;', section: 'Recursos' },
    { key: 'actualizaciones', label: 'Actualizaciones', href: 'actualizaciones.html', icon: '&#128260;', section: 'Recursos' },
    { key: 'profile', label: 'Perfil', href: 'profile.html', icon: '&#128100;', section: 'Sistema' },
    { key: 'ayuda', label: 'Ayuda', href: 'ayuda.html', icon: '&#128172;', section: 'Sistema' },
    { key: 'guia', label: 'Guía del sistema', href: 'GUIA.HTML', icon: '&#128214;', section: 'Sistema', boss: true },
    { key: 'guiausuario', label: 'Guía de uso', href: 'GUIAUSUARIO.HTML', icon: '&#128214;', section: 'Sistema', user: true },
    { key: 'settings', label: 'Configuración', href: 'settings.html', icon: '&#9881;', section: 'Sistema', boss: true },
  ];

  // Módulos del menú ligados a un permiso: si el rol del usuario no tiene el
  // permiso, el módulo se OCULTA del menú (p. ej. una "secretaria" con rol
  // personalizado solo ve lo que se le autorizó). Los módulos sin entrada aquí
  // son de acceso general (Inicio, Perfil, Avisos, Directorio, Actualizaciones…).
  const NAV_PERMISSION = {
    dashboard: 'dashboard_view',
    prospecting: 'prospecting_manage',
    clients: 'clients_manage',
    businesses: 'businesses_manage',
    appointments: 'appointments_manage',
    tasks: 'tasks_manage',
    goals: 'goals_manage',
    properties: 'properties_manage',
    inventory: 'inventory_manage',
    expenses: 'expenses_manage',
    reports: 'reports_view',
    management: 'reports_gerencia',
    documents: 'documents_manage',
    settings: 'settings_manage',
  };

  function currentUserRoleCode() {
    if (!window.ApiClient || !window.ApiClient.getStoredUser) return '';
    const user = window.ApiClient.getStoredUser();
    if (!user || !user.role) return '';
    const role = user.role;
    return (typeof role === 'object' && role !== null ? role.code : role) || '';
  }

  // Códigos de permiso del usuario actual. Devuelve null (= sin restricción)
  // para los roles de SISTEMA (admin, gerencia, asesor, superadmin…), que ya
  // tienen su propio control de acceso y no deben perder módulos. Solo los
  // roles PERSONALIZADOS (creados a medida) traen una lista explícita que
  // oculta los módulos no autorizados.
  function currentUserPermissions() {
    if (!window.ApiClient || !window.ApiClient.getStoredUser) return null;
    const user = window.ApiClient.getStoredUser();
    const role = user && user.role;
    if (!role || typeof role !== 'object') return null;
    const code = String(role.code || '');
    if (!code.startsWith('custom_')) return null;
    if (!Array.isArray(role.permissions)) return null;
    return role.permissions;
  }

  function currentUserRole() {
    const role = currentUserRoleCode();
    return role;
  }

  function isBoss() {
    const role = currentUserRoleCode();
    return role === 'admin' || role === 'gerencia';
  }

  function visibleNav() {
    const boss = isBoss();
    const perms = currentUserPermissions();
    return NAV.filter((n) => {
      if (n.boss && !boss) return false;   // p. ej. Configuración, Gerencia, guía del admin
      if (n.user && boss) return false;    // guía de usuarios solo para no-admin
      // Filtro por permiso: solo cuando el rol trae una lista explícita.
      const needed = NAV_PERMISSION[n.key];
      if (needed && Array.isArray(perms) && !perms.includes(needed)) return false;
      return true;
    });
  }

  function currentKey() {
    const name = (window.location.pathname.split('/').pop() || '').replace('.html', '');
    if (NAV.some((n) => n.key === name)) return name;
    // Módulos que NO están en el menú lateral (p. ej. el chat, que se abre
    // desde el botón flotante) deben resolverse igual para que su HTML renderice
    // su propio script y no el del Dashboard.
    if (name && window.Pages && typeof window.Pages[name] === 'object' && typeof window.Pages[name].render === 'function') {
      return name;
    }
    return 'dashboard';
  }

  function currentPage() {
    return window.Pages && window.Pages[currentKey()];
  }

  // Construye el menú lateral (sidebar) a partir de NAV, agrupado por
  // secciones. El sidebar vive fuera del topnav para que el perfil, el tema,
  // el botón de actualización y salir sigan SIEMPRE visibles arriba.
  function buildSidebar() {
    const app = document.querySelector('.app');
    if (!app || document.getElementById('app-sidebar')) return;
    app.classList.add('has-sidebar');

    const aside = document.createElement('aside');
    aside.id = 'app-sidebar';
    aside.className = 'app-sidebar';
    aside.innerHTML = `
      <div class="app-sidebar-top">
        <button class="app-sidebar-collapse" id="app-sidebar-collapse" type="button" title="Colapsar menú" aria-label="Colapsar menú">&#9776;</button>
      </div>
      <nav class="app-sidebar-nav" id="app-sidebar-nav" aria-label="Módulos"></nav>
      <div class="app-sidebar-foot">
        <span class="app-sidebar-credit">INMOBLES &times; FV DIGITAL</span>
      </div>`;

    const backdrop = document.createElement('div');
    backdrop.className = 'app-sidebar-backdrop';
    backdrop.id = 'app-sidebar-backdrop';

    // El sidebar se inserta justo antes del <main> para que el grid lo coloque
    // en la primera columna, debajo de la cabecera.
    const main = app.querySelector('.main');
    if (main) app.insertBefore(aside, main); else app.appendChild(aside);
    app.appendChild(backdrop);

    wireSidebar();
    renderNav();
  }

  function closeMobileSidebar() {
    document.body.classList.remove('sidebar-open');
  }

  function isMobileSidebar() {
    return window.matchMedia('(max-width: 900px)').matches;
  }

  function wireSidebar() {
    const collapse = document.getElementById('app-sidebar-collapse');
    if (collapse) {
      collapse.addEventListener('click', () => {
        if (isMobileSidebar()) closeMobileSidebar();
        else document.body.classList.toggle('sidebar-collapsed');
      });
    }
    const backdrop = document.getElementById('app-sidebar-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeMobileSidebar);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMobileSidebar();
    });
  }

  function toggleSidebar() {
    if (isMobileSidebar()) document.body.classList.toggle('sidebar-open');
    else document.body.classList.toggle('sidebar-collapsed');
  }

  function renderNav() {
    const nav = document.getElementById('app-sidebar-nav') || document.getElementById('topnav-nav');
    if (!nav) return;
    const active = currentKey();
    const items = visibleNav();
    let html = '';
    let lastSection = null;
    items.forEach((item) => {
      const section = item.section || '';
      if (section && section !== lastSection) {
        html += `<div class="app-sidebar-section">${UI.escapeHtml(section)}</div>`;
        lastSection = section;
      }
      html +=
        `<a class="app-sidebar-link ${item.key === active ? 'active' : ''}" href="${item.href}" title="${UI.escapeHtml(item.label)}">` +
        `<span class="app-sidebar-ico">${item.icon}</span>` +
        `<span class="app-sidebar-label">${UI.escapeHtml(item.label)}</span></a>`;
    });
    nav.innerHTML = html;
    // En móvil, al tocar un módulo se cierra el menú para no tapar la página.
    nav.querySelectorAll('.app-sidebar-link').forEach((link) => {
      link.addEventListener('click', closeMobileSidebar);
    });
  }

  function updateTopnavUser() {
    const el = document.getElementById('topnav-user');
    if (!el) return;
    const user = (window.ApiClient && window.ApiClient.getStoredUser()) || null;
    if (user && (user.name || user.username) && (user._id || user.id)) {
      const role = user.role && (user.role.name || user.role.code || user.role);
      const photo = user.photo
        ? `<img class="topnav-avatar" src="${window.AppConfig.resolveUrl(user.photo)}" alt="">`
        : `<span class="topnav-avatar topnav-avatar-fallback">${UI.escapeHtml(String(user.name || user.username || 'U').charAt(0).toUpperCase())}</span>`;
      el.innerHTML = `${photo}<span class="topnav-user-text">${UI.escapeHtml(user.name || user.username)}${role ? `<small>${UI.escapeHtml(role)}</small>` : ''}</span>`;
      el.title = role ? `Rol: ${role} · Ir a mi perfil` : 'Ir a mi perfil';
      el.classList.remove('hide');
      el.addEventListener('click', () => { window.location.href = 'profile.html'; });
      el.style.cursor = 'pointer';
    } else {
      el.classList.add('hide');
    }
  }

  // Mini vista del perfil en la esquina superior izquierda, justo después del
  // logo. Sustituye al título "INMOBLES" para dar una apariencia de CRM real:
  // muestra el avatar, el nombre y el rol del usuario y lleva a Mi perfil.
  // Se aplica en TODOS los módulos porque vive en el shell compartido.
  function injectBrandProfile() {
    const brand = document.querySelector('.topnav-brand');
    if (!brand) return;

    // Oculta el texto "INMOBLES" del logo (además del display:none del CSS).
    const brandName = brand.querySelector('.topnav-brand-name');
    if (brandName) brandName.style.display = 'none';

    if (document.querySelector('.topnav-profile')) return;

    const user = (window.ApiClient && window.ApiClient.getStoredUser()) || null;
    if (!user || !(user.name || user.username)) return;

    const role = user.role && (user.role.name || user.role.code || user.role);
    const displayName = user.name || user.username;
    const avatar = user.photo
      ? `<img class="topnav-profile-avatar" src="${window.AppConfig.resolveUrl(user.photo)}" alt="">`
      : `<span class="topnav-profile-avatar topnav-profile-fallback">${UI.escapeHtml(String(displayName).charAt(0).toUpperCase())}</span>`;

    const link = document.createElement('a');
    link.className = 'topnav-profile';
    link.href = 'profile.html';
    link.title = role ? `${displayName} · ${role} — Ir a mi perfil` : `${displayName} — Ir a mi perfil`;
    link.innerHTML =
      `${avatar}<span class="topnav-profile-text">` +
      `<strong>${UI.escapeHtml(displayName)}</strong>` +
      `<small>${UI.escapeHtml(role || 'Mi perfil')}</small>` +
      `</span>`;

    // Se coloca JUSTO al lado del logo.
    brand.insertAdjacentElement('afterend', link);
  }

  // ── Animación de carga a pantalla completa ────────────────────────────────
  // Se muestra al arrancar cada página protegida (y al navegar entre módulos,
  // porque cada módulo recarga el documento) y se oculta cuando el primer
  // render terminó. Es responsiva (móvil, tablet, PC) y respeta el tema.
  let appLoaderShownAt = 0;
  let appLoaderSafety = null;
  // Duración de las cargas. Antes el overlay se mantenía 3 s SIEMPRE, aunque la
  // página ya estuviera lista: con 50+ usuariosEso se traducía en 3 s de
  // "app colgada" en cada clic del menú. Ahora solo la PRIMERA carga de la
  // sesión dura lo suficiente para que la animación se aprecie; el resto de
  // navegaciones usan un mínimo de 400 ms (suficiente para evitar el "flash").
  // La carga especial de actualización mantiene su duración larga.
  const APP_LOADER_MIN_MS = 3000;
  const APP_LOADER_MIN_MS_NAV = 400;
  const UPDATE_LOADER_MIN_MS = 6000;
  const LOADER_SESSION_KEY = 'crm_loader_seen';

  // Devuelve la duración mínima del loader según sea la primera carga de la
  // sesión o una navegación posterior (sessionStorage = solo esta pestaña).
  function loaderMinMs() {
    try {
      if (sessionStorage.getItem(LOADER_SESSION_KEY)) return APP_LOADER_MIN_MS_NAV;
      sessionStorage.setItem(LOADER_SESSION_KEY, '1');
    } catch (e) {
      return APP_LOADER_MIN_MS_NAV;
    }
    return APP_LOADER_MIN_MS;
  }

  function showGlobalLoader(options) {
    const opts = options || {};
    const minMs = Number(opts.minMs) > 0 ? Number(opts.minMs) : loaderMinMs();
    const label = opts.text || 'INMOBLES';
    const subtext = opts.subtext || 'Preparando tu espacio de trabajo…';
    const existing = document.getElementById('app-loader');
    if (existing) {
      // Ya hay un loader visible: solo se actualiza el mensaje y el tiempo.
      const brandEl = existing.querySelector('.app-loader-brand');
      const textEl = existing.querySelector('.app-loader-text');
      if (brandEl && opts.text) brandEl.textContent = label;
      if (textEl && opts.subtext) textEl.textContent = subtext;
      existing.dataset.minMs = String(minMs);
      if (opts.text) appLoaderShownAt = Date.now();
      return;
    }
    // Se vacía el contenido para que NUNCA se vean dos animaciones a la vez:
    // mientras el overlay está activo, solo se ve la de pantalla completa.
    const content = document.getElementById('app-content');
    if (content) content.innerHTML = '';
    const el = document.createElement('div');
    el.id = 'app-loader';
    el.className = 'app-loader';
    el.dataset.minMs = String(minMs);
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', 'Cargando');
    el.innerHTML =
      '<div class="app-loader-box">' +
      '<div class="app-loader-ring"></div>' +
      `<div class="app-loader-brand">${label}</div>` +
      `<div class="app-loader-text">${subtext}</div>` +
      '</div>';
    document.body.appendChild(el);
    appLoaderShownAt = Date.now();
    // Red de seguridad: si algo falla, el overlay jamás se queda pegado.
    clearTimeout(appLoaderSafety);
    appLoaderSafety = setTimeout(hideGlobalLoader, Math.max(20000, minMs + 5000));
  }

  // Pantalla de carga especial al aplicar una actualización: mensaje propio y
  // duración larga (6 s) sin salir de la app.
  function showUpdateLoader() {
    showGlobalLoader({
      text: 'ACTUALIZANDO TU APP',
      subtext: 'Aplicando las últimas mejoras. No cierres ni salgas de esta pantalla…',
      minMs: UPDATE_LOADER_MIN_MS,
    });
  }

  function hideGlobalLoader() {
    clearTimeout(appLoaderSafety);
    const el = document.getElementById('app-loader');
    if (!el) return;
    const minMs = Number(el.dataset.minMs) || APP_LOADER_MIN_MS;
    // Tiempo mínimo en pantalla solicitado para que la animación se aprecie.
    const wait = Math.max(0, minMs - (Date.now() - appLoaderShownAt));
    setTimeout(() => {
      el.classList.add('is-hidden');
      setTimeout(() => el.remove(), 450);
    }, wait);
  }

  function updateFabBadge(key, count) {
    const el = document.querySelector(`.activity-fab [data-badge="${key}"]`);
    if (!el) return;
    const value = Number(count) || 0;
    if (value <= 0) {
      el.textContent = '';
      el.classList.remove('show');
      return;
    }
    el.textContent = value > 99 ? '99+' : value;
    el.classList.add('show');
  }

  // Botones flotantes de acceso rápido: chat del equipo y avisos (notificaciones),
  // cada uno con su contador de no leídos. Al pulsarlos NO se navega: se abre un
  // panel flotante en la misma página (los avisos se listan en vivo y el chat
  // corre embebido en un iframe), para no perder el contexto del módulo.
  function injectActivityFab() {
    if (!window.ApiClient || !window.ApiClient.isAuthenticated()) return;
    if (document.getElementById('activity-fab')) return;
    const fab = document.createElement('div');
    fab.id = 'activity-fab';
    fab.className = 'activity-fab';
    fab.innerHTML = `
      <button class="activity-fab-btn" type="button" data-panel="notifications" title="Avisos y notificaciones" aria-label="Avisos y notificaciones">&#128276;<span class="activity-badge" data-badge="notifications"></span></button>
      <button class="activity-fab-btn activity-fab-chat" type="button" data-panel="chat" title="Chat del equipo" aria-label="Chat del equipo">&#128172;<span class="activity-badge" data-badge="chat"></span></button>
    `;
    document.body.appendChild(fab);
    fab.querySelector('[data-panel="notifications"]').addEventListener('click', () => toggleFabPanel('notifications'));
    fab.querySelector('[data-panel="chat"]').addEventListener('click', () => toggleFabPanel('chat'));
  }

  // ── Paneles flotantes de Avisos y Chat ────────────────────────────────────
  let fabPanelOpen = null;

  function buildFabPanels() {
    if (document.getElementById('fab-panels')) return;
    const root = document.createElement('div');
    root.id = 'fab-panels';
    root.className = 'fab-panels';
    root.innerHTML = `
      <div class="fab-panel-backdrop" id="fab-panel-backdrop"></div>
      <section class="fab-panel" id="fab-panel-notifications" hidden aria-label="Avisos">
        <header class="fab-panel-head">
          <span>&#128276; Avisos</span>
          <span class="fab-panel-head-actions">
            <button class="fab-panel-link" type="button" data-notif-readall>Marcar leídas</button>
            <a class="fab-panel-link" href="notifications.html">Ver todas</a>
            <button class="fab-panel-x" type="button" data-fab-close aria-label="Cerrar">&#10005;</button>
          </span>
        </header>
        <div class="fab-panel-body" id="fab-notif-body">
          <div class="loading">Cargando avisos...</div>
        </div>
      </section>
      <section class="fab-panel fab-panel-chat" id="fab-panel-chat" hidden aria-label="Chat del equipo">
        <header class="fab-panel-head">
          <span>&#128172; Chat del equipo</span>
          <span class="fab-panel-head-actions">
            <a class="fab-panel-link" href="chat.html">Abrir completo</a>
            <button class="fab-panel-x" type="button" data-fab-close aria-label="Cerrar">&#10005;</button>
          </span>
        </header>
        <div class="fab-panel-body fab-panel-body-chat">
          <iframe id="fab-chat-frame" title="Chat del equipo" src="about:blank" loading="lazy"></iframe>
        </div>
      </section>`;
    document.body.appendChild(root);

    root.querySelectorAll('[data-fab-close]').forEach((btn) => btn.addEventListener('click', () => closeFabPanels()));
    const backdrop = root.querySelector('#fab-panel-backdrop');
    if (backdrop) backdrop.addEventListener('click', () => closeFabPanels());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && fabPanelOpen) closeFabPanels();
    });
    const readAll = root.querySelector('[data-notif-readall]');
    if (readAll) readAll.addEventListener('click', async () => {
      try {
        await window.API.notifications.markAllRead();
        UI.toast('Avisos marcados como leídos', 'success');
        loadNotificationsPanel();
        refreshNotificationBadge();
      } catch (error) {
        UI.toast(error.message, 'error');
      }
    });
  }

  function openFabPanel(name) {
    buildFabPanels();
    fabPanelOpen = name;
    const notif = document.getElementById('fab-panel-notifications');
    const chat = document.getElementById('fab-panel-chat');
    if (notif) notif.hidden = name !== 'notifications';
    if (chat) chat.hidden = name !== 'chat';
    document.body.classList.add('fab-panel-open');
    if (name === 'notifications') loadNotificationsPanel();
    if (name === 'chat') {
      const frame = document.getElementById('fab-chat-frame');
      if (frame && (!frame.dataset.loaded || frame.getAttribute('src') === 'about:blank')) {
        frame.dataset.loaded = '1';
        frame.src = 'chat.html?embed=1';
      } else if (frame) {
        try { frame.contentWindow.focus(); } catch (e) {}
      }
    }
  }

  function closeFabPanels() {
    fabPanelOpen = null;
    document.body.classList.remove('fab-panel-open');
    const notif = document.getElementById('fab-panel-notifications');
    const chat = document.getElementById('fab-panel-chat');
    if (notif) notif.hidden = true;
    if (chat) chat.hidden = true;
  }

  function toggleFabPanel(name) {
    if (fabPanelOpen === name) closeFabPanels();
    else openFabPanel(name);
  }

  function notifIcon(type) {
    const map = {
      task: '&#9745;', appointment: '&#128197;', business: '&#128179;', goal: '&#127919;',
      property: '&#127968;', client: '&#128101;', prospect: '&#128269;', chat: '&#128172;',
    };
    return map[type] || '&#128276;';
  }

  async function loadNotificationsPanel() {
    const body = document.getElementById('fab-notif-body');
    if (!body) return;
    body.innerHTML = '<div class="loading">Cargando avisos...</div>';
    try {
      const res = await window.API.notifications.list({ limit: 20 });
      const raw = res && typeof res === 'object' && Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);
      if (!raw.length) {
        body.innerHTML = '<div class="fab-panel-empty">No tienes avisos por ahora. &#10024;</div>';
        return;
      }
      body.innerHTML = raw.map((n) => {
        const unread = !n.read && !n.isRead;
        const when = n.createdAt && window.Format ? Format.dateTime(n.createdAt) : '';
        return `<button class="fab-notif${unread ? ' is-unread' : ''}" type="button" data-id="${UI.escapeHtml(String(n._id))}">
          <span class="fab-notif-ico">${notifIcon(n.type)}</span>
          <span class="fab-notif-txt">
            <strong>${UI.escapeHtml(n.title || 'Aviso')}</strong>
            <span class="fab-notif-msg">${UI.escapeHtml(n.message || '')}</span>
            ${when ? `<span class="fab-notif-time">${UI.escapeHtml(when)}</span>` : ''}
          </span>
        </button>`;
      }).join('');
      body.querySelectorAll('[data-id]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const item = raw.find((n) => String(n._id) === btn.dataset.id);
          if (!item) return;
          btn.classList.remove('is-unread');
          try {
            if (window.API.notifications.markRead) await window.API.notifications.markRead(item._id);
          } catch (e) { /* ignore */ }
          refreshNotificationBadge();
          openNotificationDetail(item);
        });
      });
    } catch (error) {
      body.innerHTML = '<div class="fab-panel-empty">No se pudieron cargar los avisos.</div>';
    }
  }

  function openNotificationDetail(item) {
    if (typeof UI === 'undefined') return;
    const when = item.createdAt && window.Format ? Format.dateTime(item.createdAt) : '';
    UI.openModal({
      title: 'Aviso',
      size: 500,
      body: `
        <h3 style="margin:0 0 12px;font-size:18px;line-height:1.35;">${UI.escapeHtml(item.title || 'Aviso')}</h3>
        <p style="margin:0 0 14px;font-size:14px;line-height:1.7;white-space:pre-wrap;">${UI.escapeHtml(item.message || '')}</p>
        ${when ? `<div class="text-muted" style="font-size:12px;">${UI.escapeHtml(when)}</div>` : ''}`,
      footer: '<button class="btn btn-primary" type="button" data-ok-modal>Cerrar</button>',
    });
    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
      const ok = overlay.querySelector('[data-ok-modal]');
      if (ok) ok.addEventListener('click', () => UI.closeModal());
    }
  }

  async function refreshNotificationBadge() {
    injectActivityFab();
    const bell = document.getElementById('btn-notifications');
    if (bell) {
      const existing = bell.querySelector('.badge-dot');
      if (existing) existing.remove();
    }
    if (!window.ApiClient.isAuthenticated()) return Promise.resolve();
    return window.API.notifications.unreadCount()
      .then((data) => {
        const raw = data && typeof data === 'object'
          ? (data.unread !== undefined ? data.unread : (data.data && data.data.unread))
          : undefined;
        const count = Number(raw) || 0;
        updateFabBadge('notifications', count);
        if (bell && count) {
          const dot = document.createElement('span');
          dot.className = 'badge-dot';
          dot.textContent = count > 99 ? '99+' : count;
          bell.appendChild(dot);
        }
      })
      .catch(() => {});
  }

  // El chat ya no vive en el menú: se abre desde el botón flotante, así que el
  // contador de no leídos se refleja únicamente en el badge del FAB.
  function refreshChatBadge() {
    injectActivityFab();
    if (!window.ApiClient.isAuthenticated()) return Promise.resolve();
    return window.API.chats.unreadCount()
      .then((data) => {
        const raw = data && typeof data === 'object'
          ? (data.unread !== undefined ? data.unread : (data.data && data.data.unread))
          : undefined;
        const count = Number(raw) || 0;
        updateFabBadge('chat', count);
      })
      .catch(() => {});
  }

  // Actualiza ambos badges en paralelo. Si la pestaña no está visible se
  // omite para no gastar ancho de banda innecesariamente.
  function refreshAllBadges() {
    if (document.hidden) return;
    refreshNotificationBadge();
    refreshChatBadge();
  }

  function applyTheme() {
    let theme = '';
    try { theme = localStorage.getItem('crm_theme') || ''; } catch (e) {}
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('crm_theme', next); } catch (e) {}
    const icon = document.getElementById('theme-icon');
    if (icon) icon.innerHTML = next === 'dark' ? '&#127769;' : '&#9788;';
  }

  function injectThemeButton() {
    const right = document.querySelector('.topnav-right');
    if (!right || right.querySelector('#btn-theme')) return;
    const current = document.documentElement.getAttribute('data-theme');
    const btn = document.createElement('button');
    btn.id = 'btn-theme';
    btn.className = 'icon-btn theme-toggle';
    btn.title = 'Cambiar tema';
    btn.innerHTML = `<span class="theme-icon" id="theme-icon">${current === 'dark' ? '&#127769;' : '&#9788;'}</span>`;
    btn.addEventListener('click', toggleTheme);
    right.insertBefore(btn, right.querySelector('#btn-notifications'));
  }

  // Botón "Descargar app" en la barra superior. En Android/PC instala la PWA de
  // un toque (o guía); en iOS abre las instrucciones de "Añadir a pantalla de
  // inicio". Se oculta solo si la app ya está instalada (install.js).
  function injectDownloadButton() {
    if (!window.AppInstall) return;
    const right = document.querySelector('.topnav-right');
    if (!right || right.querySelector('[data-download-app]')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-btn';
    btn.setAttribute('data-download-app', '');
    btn.title = 'Descargar la app';
    btn.setAttribute('aria-label', 'Descargar la app');
    btn.innerHTML = '&#128229;';
    right.insertBefore(btn, right.firstChild);
  }

  // Botón de actualización de la aplicación en la barra superior (sustituye a
  // la antigua calculadora). Lleva al módulo de Actualizaciones y muestra un
  // punto cuando hay una versión nueva disponible.
  function injectUpdateButton() {
    const right = document.querySelector('.topnav-right');
    if (!right || right.querySelector('#btn-update')) return;
    const btn = document.createElement('button');
    btn.id = 'btn-update';
    btn.className = 'icon-btn update-toggle';
    btn.title = 'Actualizaciones de la aplicación';
    btn.setAttribute('aria-label', 'Actualizaciones de la aplicación');
    btn.innerHTML = '&#128260;';
    btn.addEventListener('click', () => { window.location.href = 'actualizaciones.html'; });
    right.insertBefore(btn, right.querySelector('#btn-notifications'));
  }

  // Carga el módulo de versiones/actualizaciones. Consulta el servidor y, si
  // hay una versión nueva, muestra la notificación (banner + punto en el botón)
  // que lleva al módulo de Actualizaciones. Disponible para todos los roles.
  function loadAppVersion() {
    if (document.getElementById('appversion-loaded')) return;
    const marker = document.createElement('span');
    marker.id = 'appversion-loaded';
    marker.style.display = 'none';
    document.body.appendChild(marker);
    const script = document.createElement('script');
    script.src = 'js/appVersion.js';
    script.onload = () => { if (window.AppVersion) window.AppVersion.init(); };
    document.head.appendChild(script);
  }

  // Botón (?) de guía rápida en el encabezado, visible para todos. Reabre la
  // guía de bienvenida on-demand sin importar si el usuario ya la completó.
  function injectGuideButton() {
    const right = document.querySelector('.topnav-right');
    if (!right || right.querySelector('#btn-guide')) return;
    const btn = document.createElement('button');
    btn.id = 'btn-guide';
    btn.className = 'icon-btn guide-toggle';
    btn.title = 'Guía rápida';
    btn.setAttribute('aria-label', 'Guía rápida');
    btn.innerHTML = '&#63;';
    btn.addEventListener('click', () => {
      if (window.Onboarding) {
        window.Onboarding.show();
      } else {
        loadOnboarding(true);
      }
    });
    right.insertBefore(btn, right.querySelector('#btn-theme'));
  }

  // Se retira cualquier logotipo de colaboración (FV DIGITAL) del encabezado:
  // arriba a la izquierda solo deben verse el logo de INMOBLES y el perfil.
  function injectBrandCollab() {
    const brand = document.querySelector('.topnav-brand');
    if (brand) {
      const dev = brand.querySelector('.topnav-brand-dev');
      if (dev) dev.remove();
      const extra = brand.querySelector('img:not(.topnav-logo)');
      if (extra) extra.remove();
    }
    // Limpia el pie del encabezado para dejar solo la marca INMOBLES.
    const credit = document.querySelector('.topnav-credit');
    if (credit) credit.innerHTML = '&copy; INMOBLES';
  }

  function startClock() {
    const right = document.querySelector('.topnav-right');
    if (!right || right.querySelector('#topbar-clock')) return;
    const clock = document.createElement('div');
    clock.id = 'topbar-clock';
    clock.className = 'topbar-clock';
    clock.title = 'Fecha y hora';
    right.insertBefore(clock, right.querySelector('#btn-theme'));
    const update = () => {
      const now = new Date();
      const time = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      const date = now.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
      clock.innerHTML = `<span class="clock-time">${time}</span><span class="clock-date">${date}</span>`;
    };
    update();
    setInterval(update, 1000);
  }

  /* ---- Asistente IA ---- */
  function assistantAddMessage(kind, text) {
    const box = document.getElementById('assistant-messages');
    if (!box) return null;
    const wrap = document.createElement('div');
    wrap.className = `assistant-msg ${kind}`;
    wrap.textContent = text;
    box.appendChild(wrap);
    box.scrollTop = box.scrollHeight;
    return wrap;
  }

  async function assistantAsk(question) {
    assistantAddMessage('user', question);
    const thinking = assistantAddMessage('bot', 'Pensando...');
    try {
      const data = await window.API.assistant.ask({ question });
      if (thinking) thinking.textContent = (data && data.answer) || 'No obtuve una respuesta.';
    } catch (e) {
      if (thinking) thinking.textContent = 'No pude conectarme. Revisa tu conexión.';
    }
  }

    function injectAssistant() {
    if (document.getElementById('assistant-root')) return;
    const root = document.createElement('div');
    root.id = 'assistant-root';
    root.innerHTML = `
      <div class="assistant-panel" id="assistant-panel" hidden>
        <div class="assistant-head">
          <span>Asistente IA</span>
          <button class="icon-btn" id="assistant-close" type="button" aria-label="Cerrar">&#10005;</button>
        </div>
        <div class="assistant-messages" id="assistant-messages">
          <div class="assistant-msg bot">Hola, soy tu asistente. Pregúntame por propiedades, clientes, citas, metas, ingresos o gastos...</div>
        </div>
        <form class="assistant-input" id="assistant-form" autocomplete="off">
          <input id="assistant-question" type="text" placeholder="Escribe tu pregunta..." maxlength="300">
          <button class="btn btn-primary" type="submit">Enviar</button>
        </form>
      </div>
      <button class="assistant-fab" id="assistant-fab" type="button" title="Asistente IA">&#129302;</button>
    `;
    document.body.appendChild(root);
    const panel = document.getElementById('assistant-panel');
    const fab = document.getElementById('assistant-fab');
    const form = document.getElementById('assistant-form');
    const input = document.getElementById('assistant-question');
    function setOpen(open) {
      if (panel) panel.hidden = !open;
      if (fab) fab.setAttribute('aria-expanded', String(open));
      if (open && input) input.focus();
    }
    if (fab) fab.addEventListener('click', () => setOpen(panel && panel.hidden));
    const closeBtn = document.getElementById('assistant-close');
    if (closeBtn) closeBtn.addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel && !panel.hidden) { setOpen(false); if (fab) fab.focus(); } });
    if (form) form.addEventListener('submit', (e) => { e.preventDefault(); if (!input) return; const q = input.value.trim(); if (!q) return; input.value = ''; assistantAsk(q); });
  }

  /* ---- Recordatorios ---- */
  function remindersEnabled() { try { return localStorage.getItem('crm_reminders') === '1'; } catch (e) { return false; } }
  function setRemindersEnabled(enabled) { try { localStorage.setItem('crm_reminders', enabled ? '1' : '0'); } catch (e) {} }
  function notifiedStore() { try { return JSON.parse(localStorage.getItem('crm_reminded') || '[]'); } catch (e) { return []; } }
  function saveNotifiedStore(list) { try { localStorage.setItem('crm_reminded', JSON.stringify(list.slice(-100))); } catch (e) {} }

  async function checkReminders() {
    if (!remindersEnabled() || !('Notification' in window) || Notification.permission !== 'granted') return;
    if (!window.ApiClient.isAuthenticated()) return;
    let upcoming = null;
    try { upcoming = await window.API.reminders.upcoming(); } catch (e) { return; }
    const items = [].concat(upcoming.tasks || [], upcoming.appointments || []).sort((a, b) => new Date(a.date) - new Date(b.date));
    if (!items.length) return;
    const already = notifiedStore();
    const fresh = items.filter((it) => !already.includes(`${it.kind}:${it.id}`));
    fresh.forEach((it) => {
      const time = Format.dateTime(it.date);
      const title = it.kind === 'task' ? `Tarea: ${it.title}` : `Cita: ${it.title}`;
      const body = it.clientName ? `${it.clientName} · ${time}` : time;
      try { new Notification(title, { body }); } catch (e) {}
      if (typeof UI !== 'undefined') UI.toast(`${title} — ${body}`, 'info');
      already.push(`${it.kind}:${it.id}`);
    });
    saveNotifiedStore(already);
  }

  function initReminders() { setInterval(checkReminders, 60 * 1000); }
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').catch(() => {});
    if (!navigator.serviceWorker) return;
    // Cuando el service worker se activa con una versión nueva ya borró la
    // caché anterior, pero la pestaña sigue ejecutando el JS viejo. Se avisa
    // en vez de recargar solos: el asesor puede estar escribiendo la
    // descripción de una propiedad y perder el texto sería peor.
    let recargando = false;
    navigator.serviceWorker.addEventListener('message', (event) => {
      const data = event.data || {};
      if (data.type !== 'SW_UPDATED' || recargando) return;
      // Con el sistema de versiones activo, el aviso lleva al módulo de
      // Actualizaciones (desde ahí el usuario aplica la actualización). Si el
      // módulo no está cargado, se ofrece recargar directamente.
      if (window.AppVersion && typeof window.AppVersion.check === 'function') {
        window.AppVersion.check({ notify: true });
        if (window.UI) UI.toast('Hay una nueva versión. Revísala en Actualizaciones.', 'info');
        return;
      }
      const avisar = () => {
        recargando = true;
        window.location.reload();
      };
      if (window.UI && typeof window.UI.confirm === 'function') {
        window.UI.confirm('Hay una versión nueva de la aplicación. ¿Recargar ahora para aplicarla?', { danger: false })
          .then((ok) => { if (ok) avisar(); })
          .catch(() => {});
        return;
      }
      avisar();
    });
    // Si el worker cambia de control y no-nosotros no lo detectamos por
    // mensaje (por ejemplo, tras un rato en segundo plano), recargamos una vez.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (recargando) return;
      recargando = true;
      window.location.reload();
    });
  }

  // Carga el módulo global de sonidos y desbloquea el contexto de audio en el
  // primer gesto del usuario. Debe estar listo antes de conectar el tiempo real.
  function loadSounds() {
    if (document.getElementById('sounds-loaded')) return;
    const marker = document.createElement('span');
    marker.id = 'sounds-loaded';
    marker.style.display = 'none';
    document.body.appendChild(marker);
    const script = document.createElement('script');
    script.src = 'js/utils/sounds.js';
    script.onload = () => { if (window.Sounds) window.Sounds.init(); };
    document.head.appendChild(script);
  }

  // Reproduce un sonido sutil al cambiar de módulo (si el usuario tiene los
  // sonidos activados). Se llama tras renderizar cada página.
  function playModuleChangeSound() {
    if (window.Sounds && window.Sounds.navigate) {
      // playOnUnlock garantiza que suene en PC y móvil aunque el audio esté
      // bloqueado por el navegador en una recarga.
      if (window.Sounds.playOnUnlock) window.Sounds.playOnUnlock(window.Sounds.navigate);
      else window.Sounds.navigate().catch(() => {});
    }
  }

  // Carga el módulo global de tiempo real (avisos en alerta modal + badges).
  // Se inyecta dinámicamente para no tocar cada HTML de la aplicación.
  function loadRealtime() {
    if (!window.ApiClient.isAuthenticated()) return;
    const script = document.createElement('script');
    script.src = 'js/realtime.js';
    script.onload = () => {
      if (!window.Realtime) return;
      window.Realtime.connect().catch(() => {});
      window.Realtime.startPolling();
    };
    document.head.appendChild(script);
  }

  // Carga el módulo de notificaciones push nativas (Web Push). Si el usuario
  // ya concedió el permiso, se re-sincroniza la suscripción con el servidor
  // (puede haber caducado o cambiado de dispositivo); si no, no se pide nada:
  // el diálogo de permiso solo se muestra desde Configuración → Alertas.
  function loadPush() {
    if (!window.ApiClient.isAuthenticated()) return;
    if (document.getElementById('push-loaded')) return;
    const marker = document.createElement('span');
    marker.id = 'push-loaded';
    marker.style.display = 'none';
    document.body.appendChild(marker);
    const script = document.createElement('script');
    script.src = 'js/push.js';
    script.onload = () => {
      if (!window.PushNotify) return;
      window.PushNotify.syncAfterLogin().catch(() => {});
      // En la PRIMERA sesión de un usuario nuevo el aviso de notificaciones se
      // muestra al terminar la guía de bienvenida (bienvenida -> guía ->
      // notificaciones). Para el resto de usuarios se pregunta aquí mismo.
      const user = window.ApiClient.getStoredUser() || {};
      if (!user.hasCompletedOnboarding) return;
      if (typeof window.PushNotify.askOnNewSession === 'function') {
        window.PushNotify.askOnNewSession();
      }
    };
    document.head.appendChild(script);
  }

  // Invita a activar las notificaciones. Se usa al terminar la guía de la
  // primera sesión; si push.js aún no está cargado, lo carga y pregunta luego.
  function askPushNotifications() {
    const run = () => {
      if (window.PushNotify && typeof window.PushNotify.askOnNewSession === 'function') {
        window.PushNotify.askOnNewSession();
      }
    };
    if (window.PushNotify || document.getElementById('push-loaded')) { run(); return; }
    const script = document.createElement('script');
    script.src = 'js/push.js';
    script.onload = run;
    document.head.appendChild(script);
  }

  // Carga el módulo de mantenimiento programado (cuenta regresiva + capa de
  // bloqueo MANTENIMIENTO ACTIVO para roles Asesor/Admin/Gerencia). Se
  // inyecta dinámicamente como el resto. Superadmin/Soporte nunca se bloquean.
  function loadMantenimiento() {
    if (!window.ApiClient.isAuthenticated()) return;
    const script = document.createElement('script');
    script.src = 'js/mantenimiento.js';
    script.onload = () => {
      if (window.Mantenimiento) window.Mantenimiento.init();
    };
    document.head.appendChild(script);
  }

  // Carga el módulo de onboarding (guía rápida de bienvenida). Se inyecta al
  // vuelo; cuando el script está listo, se llama inmediatamente a maybeShow()
  // para no perder la oportunidad si init() terminó antes de la carga.
  function loadOnboarding(forceShow, onFinish) {
    if (!window.ApiClient.isAuthenticated()) return;
    const script = document.createElement('script');
    script.src = 'js/onboarding.js';
    script.onload = () => {
      if (!window.Onboarding) return;
      if (forceShow) window.Onboarding.show({ onFinish });
      else window.Onboarding.maybeShow({ onFinish });
    };
    document.head.appendChild(script);
  }

  // Carga el módulo de bienvenida (mensaje motivacional con animaciones).
  // El mensaje y su sonido se muestran SIEMPRE al iniciar una sesión nueva (una
  // vez por pestaña); la bandera se limpia en el login/logout para que cada
  // ingreso vuelva a mostrarlo y a reproducir el sonido de bienvenida.
  function loadWelcome() {
    if (!window.ApiClient.isAuthenticated()) return;
    if (document.getElementById('welcome-loaded')) return;
    const marker = document.createElement('span');
    marker.id = 'welcome-loaded';
    marker.style.display = 'none';
    document.body.appendChild(marker);
    const script = document.createElement('script');
    script.src = 'js/welcome.js';
    script.onload = () => {
      if (!window.Welcome) return;
      // El mensaje de bienvenida y su sonido se muestran SIEMPRE al iniciar una
      // sesión nueva (una vez por pestaña). La bandera se limpia en login/logout,
      // así que cada ingreso vuelve a mostrarlo y a reproducir su sonido.
      const shownKey = 'crm_welcome_shown_session';
      let alreadyShown = false;
      try { alreadyShown = sessionStorage.getItem(shownKey) === '1'; } catch (e) {}
      if (alreadyShown) return;
      try { sessionStorage.setItem(shownKey, '1'); } catch (e) {}
      // Welcome.open() ya reproduce el sonido de bienvenida junto al mensaje.
      window.Welcome.open({
        onClose: () => {
          const user = window.ApiClient.getStoredUser() || {};
          const isNew = !user.hasCompletedOnboarding;
          if (!isNew) return;
          // Flujo de la PRIMERA sesión: mensaje de bienvenida -> guía de inicio
          // -> avisos del equipo (si hay) -> invitación a activar notificaciones.
          const afterAvisos = () => { askPushNotifications(); };
          const afterGuide = () => { showAvisosModal(afterAvisos); };
          if (window.Onboarding) {
            window.Onboarding.maybeShow({ firstLogin: true, onFinish: afterGuide });
          } else {
            loadOnboarding(false, afterGuide);
          }
        },
      });
    };
    document.head.appendChild(script);
  }

  function alertBannerStore() {
    try { return JSON.parse(localStorage.getItem('crm_alerted') || '[]'); } catch (error) { return []; }
  }

  function saveAlertBannerStore(list) {
    try { localStorage.setItem('crm_alerted', JSON.stringify(list.slice(-80))); } catch (error) {}
  }

  // Banner sticky de avisos del equipo. Complementa la alerta modal de
  // realtime.js (que no se toca): cuelga un aviso al tope del contenido si el
  // usuario aún no lo ha visto y no es su propia publicación.
  async function maybeShowAnnouncementBanner() {
    if (!window.ApiClient.isAuthenticated()) return;
    if (document.getElementById('announcement-banner')) return;
    // En la PRIMERA sesión (usuario nuevo) los avisos se muestran al final del
    // flujo bienvenida -> guía -> avisos (ver showAvisosModal), no como banner.
    const stored = window.ApiClient.getStoredUser() || {};
    if (stored && !stored.hasCompletedOnboarding) return;
    // No competir con la bienvenida ni con un modal abierto: se reintenta más
    // tarde (deja de intentar tras ~30s para no quedar en bucle).
    if (document.getElementById('welcome-overlay') || document.getElementById('modal-overlay')) {
      clearTimeout(maybeShowAnnouncementBanner._t);
      const tries = (maybeShowAnnouncementBanner._tries || 0) + 1;
      maybeShowAnnouncementBanner._tries = tries;
      if (tries <= 40) maybeShowAnnouncementBanner._t = setTimeout(maybeShowAnnouncementBanner, 800);
      return;
    }
    maybeShowAnnouncementBanner._tries = 0;
    const me = window.ApiClient.getStoredUser() || {};
    const myId = me && (me._id || me.id);
    let list = [];
    try {
      const res = await window.API.announcements.list();
      const raw = res && typeof res === 'object' && res.data !== undefined && res.meta !== undefined ? res.data : res;
      list = Array.isArray(raw) ? raw : [];
    } catch (error) {
      return;
    }
    if (!list.length) return;
    const alerted = alertBannerStore();
    const readByMe = (a) => Array.isArray(a.readBy) && a.readBy.some((r) => String(r && (r._id || r)) === String(myId));
    const unseen = list.filter((a) => {
      if (!a || !a._id || alerted.includes(a._id)) return false;
      // Ya marcado como leído por mí (en este o cualquier dispositivo) → no reaparece.
      if (readByMe(a)) return false;
      const author = a.author || {};
      const authorId = author && typeof author === 'object' ? (author._id || author.id) : author;
      return !(myId && authorId && String(authorId) === String(myId));
    });
    if (!unseen.length) return;
    // Prioridad: el primero 'importante'/'urgente'; si no hay, el primer 'normal'.
    const chosen = unseen.find((a) => a.priority === 'importante' || a.priority === 'urgente') || unseen[0];
    const palette = {
      urgente: { color: '#dc2626', soft: '#fee2e2' },
      importante: { color: '#d97706', soft: '#fef3c7' },
      normal: { color: '#7e22ce', soft: '#f3e8ff' },
    };
    const p = palette[chosen.priority] || palette.normal;
    const banner = document.createElement('div');
    banner.id = 'announcement-banner';
    // El banner es sticky bajo la cabecera: si el topnav gana altura por la
    // safe area de iOS (notch/Dynamic Island), el tope debe seguirlo. La
    // función env() solo dispara en navegadores con safe area (iPhone/iPad);
    // en el resto equivale a 0 y queda exactamente en 56px como antes.
    banner.style.cssText =
      'display:flex;align-items:center;gap:10px;padding:10px 16px;margin:0 0 16px;border-radius:var(--radius);' +
      `border-left:4px solid ${p.color};background:${p.soft};font-size:13px;position:sticky;top:calc(56px + env(safe-area-inset-top));z-index:20;`;
    banner.innerHTML = `
      <span style="font-size:16px;">&#128276;</span>
      <strong style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${UI.escapeHtml(chosen.title || 'Aviso del equipo')}</strong>
      <a class="btn btn-secondary btn-sm" href="notifications.html">Ver</a>
      <button class="icon-btn" type="button" data-close-banner title="Cerrar aviso" aria-label="Cerrar aviso">&times;</button>
    `;
    banner.querySelector('[data-close-banner]').addEventListener('click', () => {
      const next = alertBannerStore();
      if (!next.includes(chosen._id)) {
        next.push(chosen._id);
        saveAlertBannerStore(next);
      }
      // Marca leído en el servidor para que no vuelva a aparecer en otro
      // dispositivo ni en el próximo inicio de sesión.
      try { if (window.API && API.announcements) API.announcements.markRead(chosen._id).catch(() => {}); } catch (e) {}
      banner.remove();
    });
    const content = document.getElementById('app-content');
    if (content) content.insertBefore(banner, content.firstChild);

    // El banner se marca como leído en el SERVIDOR en cuanto se muestra. Antes
    // solo se guardaba en localStorage, así que volvía a aparecer en CADA
    // navegación (cada módulo es una recarga completa de la página) y el
    // contador de no leídos no se limpiaba nunca.
    const next = alertBannerStore();
    if (!next.includes(chosen._id)) {
      next.push(chosen._id);
      saveAlertBannerStore(next);
    }
    try { if (window.API && window.API.announcements) window.API.announcements.markRead(chosen._id).catch(() => {}); } catch (e) {}
    refreshNotificationBadge();
  }

  // Modal con los avisos del equipo pendientes. Se usa al FINAL del flujo de
  // primera sesión (bienvenida -> guía -> avisos) y también para mostrarlos si
  // el usuario los abre a mano. Al cerrar, marca todos como leídos.
  async function showAvisosModal(done) {
    const finish = () => { if (typeof done === 'function') done(); };
    if (!window.ApiClient.isAuthenticated() || typeof UI === 'undefined') return finish();
    const me = window.ApiClient.getStoredUser() || {};
    const myId = me && (me._id || me.id);
    let list = [];
    try {
      const res = await window.API.announcements.list();
      const raw = res && typeof res === 'object' && res.data !== undefined && res.meta !== undefined ? res.data : res;
      list = Array.isArray(raw) ? raw : [];
    } catch (error) {
      return finish();
    }
    const palette = {
      urgente: { color: '#dc2626', soft: '#fee2e2' },
      importante: { color: '#d97706', soft: '#fef3c7' },
      normal: { color: '#5B2D8E', soft: '#f3e8ff' },
    };
    const readByMe = (a) => Array.isArray(a.readBy) && a.readBy.some((r) => String(r && (r._id || r)) === String(myId));
    const pending = list.filter((a) => {
      if (!a || !a._id || readByMe(a)) return false;
      const author = a.author || {};
      const authorId = author && typeof author === 'object' ? (author._id || author.id) : author;
      return !(myId && authorId && String(authorId) === String(myId));
    });
    if (!pending.length) return finish();

    const itemsHtml = pending.map((a) => {
      const p = palette[a.priority] || palette.normal;
      return `
        <div style="padding:12px 14px;border-radius:10px;background:${p.soft};border-left:4px solid ${p.color};margin-bottom:10px;">
          <strong style="display:block;font-size:14px;">${UI.escapeHtml(a.title || 'Aviso del equipo')}</strong>
          <div style="font-size:13px;margin-top:4px;white-space:pre-wrap;">${UI.escapeHtml(a.message || '')}</div>
        </div>`;
    }).join('');

    const modal = UI.openModal({
      title: '&#128276;&nbsp; Avisos del equipo',
      body: `
        <p class="text-muted" style="margin-top:0;">Estos son los avisos pendientes. Al cerrar esta ventana quedarán como leídos y no volverán a aparecer.</p>
        ${itemsHtml}
      `,
      footer: '<button class="btn btn-primary" type="button" data-ok>Entendido</button>',
      size: 520,
    });

    // Al cerrar de CUALQUIER forma (Entendido, X o clic fuera) se marcan los
    // avisos como leídos y se continúa la cadena. Un guard evita hacerlo dos veces.
    let finalized = false;
    const finalize = async () => {
      if (finalized) return;
      finalized = true;
      try {
        await Promise.all(pending.map((a) => API.announcements.markRead(a._id).catch(() => {})));
      } catch (error) { /* sin conexión: se reintenta la próxima vez */ }
      finish();
    };
    const overlay = modal.bodyEl ? modal.bodyEl.closest('#modal-overlay') : null;
    if (!overlay) { finalize(); return; }
    const okBtn = overlay.querySelector('[data-ok]');
    if (okBtn) okBtn.addEventListener('click', () => { UI.closeModal(); finalize(); });
    const observer = new MutationObserver(() => {
      if (!document.getElementById('modal-overlay')) { observer.disconnect(); finalize(); }
    });
    observer.observe(document.body, { childList: true });
  }

  // Reabre la guía rápida de bienvenida cuando el usuario la pide desde
  // ajustes o el botón (?). Onboarding se carga de forma asíncrona
  // (loadOnboarding), por lo que si el script aún no llegó se fuerza su carga
  // antes de mostrarlo.
  function reopenOnboarding() {
    if (window.Onboarding) {
      window.Onboarding.show();
      return;
    }
    loadOnboarding(true);
  }

  async function logout() {
    const ok = UI ? await UI.confirm('¿Deseas cerrar sesión?') : true;
    if (!ok) return;
    try { if (window.API && window.API.auth.logout && window.ApiClient.isAuthenticated()) await window.API.auth.logout(); } catch (e) {}
    window.ApiClient.clearToken();
    // Limpia la bandera de bienvenida para que el mensaje y su sonido vuelvan
    // a mostrarse en el próximo inicio de sesión.
    try { sessionStorage.removeItem('crm_welcome_shown_session'); } catch (e) {}
    window.location.replace('index.html');
  }

  function labelTableColumns(root) {
    root.querySelectorAll('table').forEach((table) => {
      const headers = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent.trim());
      if (!headers.length) return;
      table.querySelectorAll('tbody tr').forEach((tr) => {
        Array.from(tr.children).forEach((td, index) => {
          if (!td.hasAttribute('data-label') && headers[index]) td.setAttribute('data-label', headers[index]);
        });
      });
    });
  }

  async function renderPage() {
    const content = document.getElementById('app-content');
    if (!content) return;
    const key = currentKey();
    const page = currentPage();
    if ((key === 'settings' || key === 'management') && !isBoss()) {
      content.innerHTML = '<div class="card"><div class="empty-state"><p>No tienes permiso para ver este módulo.</p></div></div>';
      return;
    }
    // Bloqueo por permiso si el rol trae una lista explícita (roles
    // personalizados): evita abrir por URL un módulo no autorizado.
    const needed = NAV_PERMISSION[key];
    const perms = currentUserPermissions();
    if (needed && Array.isArray(perms) && !perms.includes(needed)) {
      content.innerHTML = '<div class="card"><div class="empty-state"><p>No tienes permiso para ver este módulo.</p></div></div>';
      return;
    }
    if (page && typeof page.render === 'function') {
      try {
        await page.render(content);
        labelTableColumns(content);
        maybeShowAnnouncementBanner();
        playModuleChangeSound();
      } catch (error) {
        content.innerHTML = UI.errorAlert((error && error.message) || 'Error al cargar el módulo.');
      }
      return;
    }
    // El módulo aún no se registró (el script de la página tardó en cargar o el
    // service worker sirvió una versión anterior del HTML). Se reintenta un par
    // de veces antes de mostrar "módulo no disponible".
    for (const wait of [60, 200, 800]) {
      await new Promise((resolve) => setTimeout(resolve, wait));
      const retryPage = currentPage();
      if (retryPage && typeof retryPage.render === 'function') {
        try {
          await retryPage.render(content);
          labelTableColumns(content);
          maybeShowAnnouncementBanner();
          playModuleChangeSound();
          return;
        } catch (error) {
          content.innerHTML = UI.errorAlert((error && error.message) || 'Error al cargar el módulo.');
          return;
        }
      }
    }
    if (!window.navigator.onLine) {
      content.innerHTML = '<div class="empty-state"><p>Sin conexión. Conéctate e intenta de nuevo.</p></div>';
      return;
    }
    content.innerHTML = '<div class="empty-state"><p>Módulo no disponible. Haz un actualización forzada (Ctrl+Shift+R) para limpiar la caché.</p></div>';
  }

  // --- Cierre de sesión automático por inactividad (30 min) ---
  // Se aplica a asesores, gerencia y administración. NO se aplica a soporte
  // técnico (superadmin), que gestiona el panel de soporte y no debe cerrarse.
  // Tras 30 minutos sin actividad se muestra "¿Sigues ahí?" con opciones
  // "Continuar (me quedo)" / "Salir"; si no se responde en 60s, se cierra la
  // sesión automáticamente.
  const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
  const IDLE_GRACE_MS = 60 * 1000;
  let idleLastActive = Date.now();
  let idleBaseTimer = null;
  let idleGraceTimer = null;
  let idlePromptTimer = null;
  let idlePromptOpen = false;
  let idleCountdown = 0;

  function idleApplies() {
    return currentUserRole() !== 'superadmin';
  }

  function idleActivity() {
    if (idlePromptOpen) return;
    idleLastActive = Date.now();
    clearTimeout(idleBaseTimer);
    clearTimeout(idleGraceTimer);
    clearInterval(idlePromptTimer);
    idleBaseTimer = setTimeout(openIdlePrompt, IDLE_TIMEOUT_MS);
  }

  function openIdlePrompt() {
    if (!idleApplies() || idlePromptOpen) return;
    idlePromptOpen = true;
    idleCountdown = IDLE_GRACE_MS / 1000;
    if (window.Sounds && window.Sounds.notification) window.Sounds.notification().catch(() => {});

    const overlay = document.createElement('div');
    overlay.className = 'idle-overlay';
    overlay.id = 'idle-overlay';
    overlay.innerHTML =
      '<div class="idle-modal" role="dialog" aria-modal="true">' +
        '<div class="idle-icon">&#128276;</div>' +
        '<h2>¿Sigues ahí?</h2>' +
        '<p>Has estado inactivo por 30 minutos. Por seguridad, tu sesión se cerrará automáticamente.</p>' +
        '<p class="idle-timer">Cierre en <strong id="idle-count">60</strong> segundos</p>' +
        '<div class="idle-actions">' +
          '<button type="button" id="idle-continue" class="btn btn-primary">Continuar (me quedo)</button>' +
          '<button type="button" id="idle-exit" class="btn btn-outline">Salir</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    const countEl = overlay.querySelector('#idle-count');
    idlePromptTimer = setInterval(() => {
      idleCountdown -= 1;
      if (countEl) countEl.textContent = Math.max(0, idleCountdown);
      if (idleCountdown <= 0) idleLogout();
    }, 1000);

    overlay.querySelector('#idle-continue').addEventListener('click', () => {
      closeIdlePrompt();
      idleActivity();
    });
    overlay.querySelector('#idle-exit').addEventListener('click', idleLogout);
  }

  function closeIdlePrompt() {
    const overlay = document.getElementById('idle-overlay');
    if (overlay) overlay.remove();
    idlePromptOpen = false;
    clearInterval(idlePromptTimer);
  }

  function idleLogout() {
    closeIdlePrompt();
    try { if (window.API && window.API.auth.logout && window.ApiClient.isAuthenticated()) window.API.auth.logout(); } catch (e) {}
    window.ApiClient.clearToken();
    // Limpia la bandera de bienvenida para que el mensaje y su sonido vuelvan
    // a mostrarse en la próxima sesión.
    try { sessionStorage.removeItem('crm_welcome_shown_session'); } catch (e) {}
    window.location.replace('index.html');
  }

  function initIdleTimeout() {
    if (!idleApplies()) return;
    // La bandera de inactividad no debe persistir entre pestañas: se usa
    // sessionStorage con marca de tiempo para que cada pestaña sea autónoma.
    try { idleLastActive = Date.now(); } catch (e) {}
    clearTimeout(idleBaseTimer);
    idleBaseTimer = setTimeout(openIdlePrompt, IDLE_TIMEOUT_MS);
    const events = ['pointerdown', 'pointermove', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click', 'wheel'];
    events.forEach((name) => document.addEventListener(name, idleActivity, { passive: true }));
  }

  function installErrorHandlers() {
    window.addEventListener('error', (e) => { console.error('[AppShell] Error:', e.message || e.error); if (UI && (e.message || e.error)) UI.toast(e.message || 'Error inesperado', 'error'); });
    window.addEventListener('unhandledrejection', (e) => { const err = e.reason; console.error('[AppShell] Promesa rechazada:', err); if (UI && err && err.message) UI.toast(err.message, 'error'); });
  }

  // Detecta el modo embebido (chat dentro del panel flotante). En ese modo el
  // shell no pinta cabecera, sidebar, FAB, asistente ni animaciones: solo
  // renderiza el módulo a pantalla completa dentro del iframe.
  function isEmbed() {
    try {
      return /[?&]embed=1\b/.test(window.location.search);
    } catch (e) {
      return false;
    }
  }

  // Refresca el usuario almacenado (localStorage) con los datos actuales del
  // servidor, sobre todo el rol con sus PERMISOS: así el menú lateral oculta
  // los módulos no autorizados aunque el usuario lleve sesiones iniciadas
  // desde antes de crear el rol personalizado. Se silencioso: si falla, se
  // conserva el usuario guardado.
  async function refreshStoredUser() {
    try {
      const me = await window.API.auth.me();
      if (me && (me._id || me.id)) {
        window.ApiClient.setStoredUser(me);
      }
    } catch (e) { /* sin conexión: se usa el usuario guardado */ }
  }

  function init() {
    installErrorHandlers();
    applyTheme();

    if (!window.ApiClient.requireAuth()) { hideGlobalLoader(); return; }

    const embed = isEmbed();
    if (embed) document.body.classList.add('is-embed');

    if (!embed) {
      registerServiceWorker();
      // Se refresca el usuario (permisos) ANTES de pintar el menú para que los
      // módulos restringidos no aparezcan ni por un instante.
      refreshStoredUser().finally(() => {
        buildSidebar();
        updateTopnavUser();
        injectBrandProfile();
      });
      injectBrandCollab();
      injectThemeButton();
      injectGuideButton();
      injectUpdateButton();
      injectDownloadButton();
      loadAppVersion();
      startClock();
      injectAssistant();
      loadSounds();
      loadRealtime();
      injectActivityFab();
    }

    // La hamburguesa abre/cierra el menú lateral (plegable en escritorio,
    // drawer deslizante en móvil).
    const hamburger = document.getElementById('topnav-hamburger');
    if (hamburger) hamburger.addEventListener('click', toggleSidebar);

    const btnNotif = document.getElementById('btn-notifications');
    if (btnNotif) btnNotif.addEventListener('click', () => { window.location.href = 'notifications.html'; });

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    if (!embed && window.AppInstall) window.AppInstall.init();

    if (!embed) {
      refreshAllBadges();
      setInterval(refreshAllBadges, 120000);
      initReminders();
      initIdleTimeout();
    }

    renderPage().finally(() => hideGlobalLoader());

    if (embed) return;

    // Se difieren los módulos no críticos (mantenimiento, onboarding,
    // bienvenida) hasta después del primer render para que la página
    // aparezca lo antes posible.
    setTimeout(() => {
      loadMantenimiento();
      loadWelcome();
      // La guía se encadena con los avisos y la invitación a activar
      // notificaciones cuando el usuario es nuevo (primera sesión:
      // bienvenida -> guía -> avisos -> notificaciones).
      loadOnboarding(false, () => showAvisosModal(askPushNotifications));
      loadPush();
    }, 50);

    // Tras el primer render se da la oportunidad al banner de avisos con un
    // pequeño retardo para no pisar ninguna animación de entrada. (La guía de
    // bienvenida y el mensaje motivacional se disparan desde loadWelcome /
    // loadOnboarding según corresponda).
    setTimeout(() => { maybeShowAnnouncementBanner(); }, 400);
  }

  window.App = { refreshNotificationBadge, refreshChatBadge, remindersEnabled, setRemindersEnabled, startClock, reopenOnboarding };

  return { init, showGlobalLoader, showUpdateLoader, hideGlobalLoader, refreshNotificationBadge, refreshChatBadge, currentKey, currentPage, renderPage, openPanel: openFabPanel, closePanels: closeFabPanels };
})();

// ---- Auto-inicialización del shell ----
// Cada página protegida incluye multipage.js. Aquí se bootstrapea el shell
// (nav, realtime, badges, FAB, redirect de auth y renderPage) sin tener que
// tocar cada HTML. Se protege con una bandera en `window` para que jamás corra
// dos veces y se condiciona a que haya sesión activa: las páginas públicas
// (inicio/landing/contacto) no incluyen este archivo y nunca pasan el guard de
// autenticación, así que aquí nunca se ejecuta la redirección ni el render.
(function autoInitShell() {
  if (window.__appShellAutoInit) return;
  window.__appShellAutoInit = true;
  if (window.AppShell && window.ApiClient && window.ApiClient.isAuthenticated()) {
    // Muestra la animación de carga a pantalla completa en cuanto el shell está
    // disponible, antes de renderizar el módulo, para tapar el "flash" blanco.
    // En el modo embebido (chat en panel flotante) no se usa el loader global.
    const isEmbed = /[?&]embed=1\b/.test(window.location.search);
    if (!isEmbed) {
      const boot = () => window.AppShell.showGlobalLoader();
      if (document.body) boot();
      else document.addEventListener('DOMContentLoaded', boot);
    }
    const run = () => window.AppShell.init();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
  }
})();
