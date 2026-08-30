'use strict';

window.AppShell = (() => {
  const NAV = [
    { key: 'home', label: 'Inicio', href: 'home.html', icon: '&#127969;' },
    { key: 'dashboard', label: 'Dashboard', href: 'dashboard.html', icon: '&#9638;' },
    { key: 'prospecting', label: 'Prospección', href: 'prospecting.html', icon: '&#128269;' },
    { key: 'clients', label: 'Clientes', href: 'clients.html', icon: '&#128101;' },
    { key: 'properties', label: 'Mis Propiedades', href: 'properties.html', icon: '&#127968;' },
    { key: 'inventory', label: 'Mi Inventario', href: 'inventory.html', icon: '&#128230;' },
    { key: 'inventory-general', label: 'Inventario General', href: 'inventory-general.html', icon: '&#128203;' },
    { key: 'businesses', label: 'Negocios', href: 'businesses.html', icon: '&#128179;' },
    { key: 'appointments', label: 'Citas', href: 'appointments.html', icon: '&#128197;' },
    { key: 'tasks', label: 'Tareas', href: 'tasks.html', icon: '&#9745;' },
    { key: 'goals', label: 'Metas', href: 'goals.html', icon: '&#127919;' },
    { key: 'expenses', label: 'Gastos', href: 'expenses.html', icon: '&#128184;' },
    { key: 'documents', label: 'Formatos', href: 'documents.html', icon: '&#128196;' },
    { key: 'notifications', label: 'Avisos', href: 'notifications.html', icon: '&#128276;' },
    { key: 'reports', label: 'Reportes', href: 'reports.html', icon: '&#128202;' },
    { key: 'management', label: 'Gerencia', href: 'management.html', icon: '&#128200;' },
    { key: 'profile', label: 'Perfil', href: 'profile.html', icon: '&#128100;' },
    { key: 'settings', label: 'Config', href: 'settings.html', icon: '&#9881;' },
  ];

  function currentUserRole() {
    const user = window.ApiClient.getStoredUser();
    return user && user.role ? user.role.code || user.role : '';
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
    return NAV.some((n) => n.key === name) ? name : 'dashboard';
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
    const user = window.ApiClient.getStoredUser();
    if (user && (user.name || user.username)) {
      const role = user.role && (user.role.name || user.role);
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
    if (window.ApiClient && !window.ApiClient.isAuthenticated()) return;
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
    if (!window.ApiClient.isAuthenticated()) return;
    try {
      const data = await window.API.notifications.unreadCount();
      const count = Number(data.unread) || 0;
      updateFabBadge('notifications', count);
      if (bell && count) {
        const dot = document.createElement('span');
        dot.className = 'badge-dot';
        dot.textContent = count > 99 ? '99+' : count;
        bell.appendChild(dot);
      }
    } catch (error) { /* sin conexión */ }
  }

  async function refreshChatBadge() {
    injectActivityFab();
    const chatLink = document.querySelector('.topnav-link[href="chat.html"]');
    if (chatLink) {
      const existing = chatLink.querySelector('.badge-dot');
      if (existing) existing.remove();
    }
    if (!window.ApiClient.isAuthenticated()) return;
    try {
      const data = await window.API.chats.unreadCount();
      const count = Number(data.unread) || 0;
      updateFabBadge('chat', count);
      if (chatLink && count) {
        const dot = document.createElement('span');
        dot.className = 'badge-dot';
        dot.textContent = count > 99 ? '99+' : count;
        chatLink.appendChild(dot);
      }
    } catch (error) { /* sin conexión */ }
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
      if (window.UI) UI.toast(`${title} — ${body}`, 'info');
      already.push(`${it.kind}:${it.id}`);
    });
    saveNotifiedStore(already);
  }

  function initReminders() { setInterval(checkReminders, 60 * 1000); }
  function registerServiceWorker() { if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {}); }

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

  async function logout() {
    const ok = UI ? await UI.confirm('¿Deseas cerrar sesión?') : true;
    if (!ok) return;
    try { if (window.API && window.API.auth.logout && window.ApiClient.isAuthenticated()) await window.API.auth.logout(); } catch (e) {}
    window.ApiClient.clearToken();
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
      try { await page.render(content); labelTableColumns(content); }
      catch (error) { content.innerHTML = UI.errorAlert((error && error.message) || 'Error al cargar el módulo.'); }
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
        try { await retryPage.render(content); labelTableColumns(content); return; }
        catch (error) { content.innerHTML = UI.errorAlert((error && error.message) || 'Error al cargar el módulo.'); return; }
      }
    }
    if (!window.navigator.onLine) {
      content.innerHTML = '<div class="empty-state"><p>Sin conexión. Conéctate e intenta de nuevo.</p></div>';
      return;
    }
    content.innerHTML = '<div class="empty-state"><p>Módulo no disponible. Haz un actualización forzada (Ctrl+Shift+R) para limpiar la caché.</p></div>';
  }

  function installErrorHandlers() {
    window.addEventListener('error', (e) => { console.error('[AppShell] Error:', e.message || e.error); if (UI && (e.message || e.error)) UI.toast(e.message || 'Error inesperado', 'error'); });
    window.addEventListener('unhandledrejection', (e) => { const err = e.reason; console.error('[AppShell] Promesa rechazada:', err); if (UI && err && err.message) UI.toast(err.message, 'error'); });
  }

  function init() {
    installErrorHandlers();
    applyTheme();

    if (!window.ApiClient.isAuthenticated()) { window.location.replace('index.html'); return; }

    registerServiceWorker();
    renderNav();
    updateTopnavUser();
    injectThemeButton();
    startClock();
    injectAssistant();
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

    refreshNotificationBadge();
    refreshChatBadge();
    setInterval(refreshNotificationBadge, 120000);
    setInterval(refreshChatBadge, 120000);
    initReminders();

    renderPage();
  }

  window.App = { refreshNotificationBadge, refreshChatBadge, remindersEnabled, setRemindersEnabled, startClock };

  return { init, refreshNotificationBadge, refreshChatBadge, currentKey, currentPage, renderPage };
})();

document.addEventListener('DOMContentLoaded', () => window.AppShell.init());
