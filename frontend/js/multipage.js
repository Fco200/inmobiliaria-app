'use strict';

window.AppShell = (() => {
  const NAV = [
    { key: 'home', label: 'Inicio', href: 'home.html', icon: '&#127969;' },
    { key: 'dashboard', label: 'Dashboard', href: 'dashboard.html', icon: '&#9638;' },
    { key: 'prospecting', label: 'Prospección', href: 'prospecting.html', icon: '&#128269;' },
    { key: 'clients', label: 'Clientes', href: 'clients.html', icon: '&#128101;' },
{ key: 'properties', label: 'Capturar Propiedades', href: 'properties.html', icon: '&#127968;' },
    { key: 'inventory', label: 'Mis Propiedades', href: 'inventory.html', icon: '&#128230;' },
    { key: 'inventory-general', label: 'Inventario General', href: 'inventory-general.html', icon: '&#128203;' },
    { key: 'businesses', label: 'Negocios', href: 'businesses.html', icon: '&#128179;' },
    { key: 'appointments', label: 'Citas', href: 'appointments.html', icon: '&#128197;' },
    { key: 'calendar', label: 'Calendario', href: 'calendar.html', icon: '&#128467;' },
    { key: 'tasks', label: 'Tareas', href: 'tasks.html', icon: '&#9745;' },
    { key: 'goals', label: 'Metas', href: 'goals.html', icon: '&#127919;' },
    { key: 'expenses', label: 'Gastos', href: 'expenses.html', icon: '&#128184;' },
    { key: 'reports', label: 'Reportes', href: 'reports.html', icon: '&#128202;' },
    { key: 'documents', label: 'Formatos', href: 'documents.html', icon: '&#128196;' },
    { key: 'notifications', label: 'Avisos', href: 'notifications.html', icon: '&#128276;' },
      { key: 'management', label: 'Gerencia', href: 'management.html', icon: '&#128200;' },
    { key: 'directorio', label: 'Directorio', href: 'directorio.html', icon: '&#128101;' },
    { key: 'profile', label: 'Perfil', href: 'profile.html', icon: '&#128100;' },
    { key: 'ayuda', label: 'Ayuda', href: 'ayuda.html', icon: '&#128172;' },
    { key: 'settings', label: 'Config', href: 'settings.html', icon: '&#9881;' },
  ];

  function currentUserRole() {
    if (!window.ApiClient || !window.ApiClient.getStoredUser) return '';
    const user = window.ApiClient.getStoredUser();
    if (!user || !user.role) return '';
    const role = user.role;
    return (typeof role === 'object' && role !== null ? role.code : role) || (typeof role === 'string' ? role : '');
  }

  function isBoss() {
    const role = currentUserRole();
    return role === 'admin' || role === 'gerencia';
  }

  function visibleNav() {
    if (isBoss()) return NAV;
    return NAV.filter((n) => n.key !== 'settings' && n.key !== 'management');
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

  function renderNav() {
    const nav = document.getElementById('topnav-nav');
    if (!nav) return;
    const active = currentKey();
    const items = visibleNav();
    nav.innerHTML = items.map(
      (item) =>
        `<a class="topnav-link ${item.key === active ? 'active' : ''}" href="${item.href}">` +
        `<span class="nav-icon">${item.icon}</span><span>${item.label}</span></a>`
    ).join('');
  }

  function updateTopnavUser() {
    const el = document.getElementById('topnav-user');
    if (!el) return;
    const user = (window.ApiClient && window.ApiClient.getStoredUser()) || null;
    if (user && (user.name || user.username) && user._id) {
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
  // cada uno con su contador de no leídos. Visible en todas las páginas.
  function injectActivityFab() {
    if (!window.ApiClient || !window.ApiClient.isAuthenticated()) return;
    if (document.getElementById('activity-fab')) return;
    const fab = document.createElement('div');
    fab.id = 'activity-fab';
    fab.className = 'activity-fab';
    fab.innerHTML = `
      <a class="activity-fab-btn" href="notifications.html" title="Avisos y notificaciones" aria-label="Avisos y notificaciones">&#128276;<span class="activity-badge" data-badge="notifications"></span></a>
      <a class="activity-fab-btn activity-fab-chat" href="chat.html" title="Chat del equipo" aria-label="Chat del equipo">&#128172;<span class="activity-badge" data-badge="chat"></span></a>
    `;
    document.body.appendChild(fab);
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

  function refreshChatBadge() {
    injectActivityFab();
    const chatLink = document.querySelector('.topnav-link[href="chat.html"]');
    if (chatLink) {
      const existing = chatLink.querySelector('.badge-dot');
      if (existing) existing.remove();
    }
    if (!window.ApiClient.isAuthenticated()) return Promise.resolve();
    return window.API.chats.unreadCount()
      .then((data) => {
        const raw = data && typeof data === 'object'
          ? (data.unread !== undefined ? data.unread : (data.data && data.data.unread))
          : undefined;
        const count = Number(raw) || 0;
        updateFabBadge('chat', count);
        if (chatLink && count) {
          const dot = document.createElement('span');
          dot.className = 'badge-dot';
          dot.textContent = count > 99 ? '99+' : count;
          chatLink.appendChild(dot);
        }
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

  // Abre la calculadora de negocio (hipoteca / comisión). El script del
  // componente se inyecta la primera vez para no tocar cada HTML del CRM.
  function openCalculator() {
    if (window.Calculator) {
      window.Calculator.open();
      return;
    }
    const script = document.createElement('script');
    script.src = 'js/components/calculator.js';
    script.onload = () => { if (window.Calculator) window.Calculator.open(); };
    document.head.appendChild(script);
  }

  function injectCalculatorButton() {
    const right = document.querySelector('.topnav-right');
    if (!right || right.querySelector('#btn-calc')) return;
    const btn = document.createElement('button');
    btn.id = 'btn-calc';
    btn.className = 'icon-btn calc-toggle';
    btn.title = 'Calculadora de negocio (hipoteca y comisión)';
    btn.setAttribute('aria-label', 'Calculadora de negocio');
    btn.innerHTML = '&#128200;';
    btn.addEventListener('click', openCalculator);
    right.insertBefore(btn, right.querySelector('#btn-notifications'));
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

  // Añade el logotipo de FV DIGITAL junto al de INMOBLES para mostrar la
  // colaboración de marcas de forma permanente en el encabezado.
  function injectBrandCollab() {
    const brand = document.querySelector('.topnav-brand');
    if (!brand || brand.querySelector('.topnav-brand-dev')) return;
    const dev = document.createElement('img');
    dev.className = 'topnav-brand-dev';
    dev.src = 'fv_digital_logo.png.webp';
    dev.alt = 'FV DIGITAL';
    dev.title = 'Desarrollado por FV DIGITAL';
    brand.appendChild(dev);
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
  function loadOnboarding(forceShow) {
    if (!window.ApiClient.isAuthenticated()) return;
    const script = document.createElement('script');
    script.src = 'js/onboarding.js';
    script.onload = () => {
      if (!window.Onboarding) return;
      if (forceShow) window.Onboarding.show();
      else window.Onboarding.maybeShow();
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
          if (isNew) {
            if (window.Onboarding) window.Onboarding.maybeShow();
            else loadOnboarding();
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
    const unseen = list.filter((a) => {
      if (!a || !a._id || alerted.includes(a._id)) return false;
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
      banner.remove();
    });
    const content = document.getElementById('app-content');
    if (content) content.insertBefore(banner, content.firstChild);
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
    if (page && typeof page.render === 'function') {
      content.innerHTML = '<div class="loading">Cargando...</div>';
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
        content.innerHTML = '<div class="loading">Cargando...</div>';
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

  function init() {
    installErrorHandlers();
    applyTheme();

    if (!window.ApiClient.requireAuth()) return;

    registerServiceWorker();
    renderNav();
    updateTopnavUser();
    injectBrandCollab();
    injectThemeButton();
    injectGuideButton();
    injectCalculatorButton();
    startClock();
    injectAssistant();
    loadSounds();
    loadRealtime();
    injectActivityFab();

    // Hamburger toggle para mobile
    const hamburger = document.getElementById('topnav-hamburger');
    const navMenu = document.getElementById('topnav-nav');
    if (hamburger && navMenu) {
      hamburger.addEventListener('click', () => navMenu.classList.toggle('open'));
      navMenu.querySelectorAll('.topnav-link').forEach((link) => link.addEventListener('click', () => navMenu.classList.remove('open')));
    }

    const btnNotif = document.getElementById('btn-notifications');
    if (btnNotif) btnNotif.addEventListener('click', () => { window.location.href = 'notifications.html'; });

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    if (window.AppInstall) window.AppInstall.init();

    refreshAllBadges();
    setInterval(refreshAllBadges, 120000);
    initReminders();
    initIdleTimeout();

    renderPage();

    // Se difieren los módulos no críticos (mantenimiento, onboarding,
    // bienvenida) hasta después del primer render para que la página
    // aparezca lo antes posible.
    setTimeout(() => {
      loadMantenimiento();
      loadWelcome();
      loadOnboarding();
    }, 50);

    // Tras el primer render se da la oportunidad al banner de avisos con un
    // pequeño retardo para no pisar ninguna animación de entrada. (La guía de
    // bienvenida y el mensaje motivacional se disparan desde loadWelcome /
    // loadOnboarding según corresponda).
    setTimeout(() => { maybeShowAnnouncementBanner(); }, 400);
  }

  window.App = { refreshNotificationBadge, refreshChatBadge, remindersEnabled, setRemindersEnabled, startClock, reopenOnboarding };

  return { init, refreshNotificationBadge, refreshChatBadge, currentKey, currentPage, renderPage };
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
    const run = () => window.AppShell.init();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
  }
})();
