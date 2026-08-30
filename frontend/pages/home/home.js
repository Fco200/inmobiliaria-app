'use strict';
window.Pages = window.Pages || {};
window.Pages.home = {
  title: 'Inicio',

  async render(container) {
    const user = window.ApiClient.getStoredUser();
    const name = (user && (user.name || user.username)) || '';
    const role = user && user.role ? (user.role.name || user.role.code || user.role) : '';

    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
    const todayLabel = now.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    let data = {};
    try {
      const res = await window.API.dashboard.summary();
      data = res || {};
    } catch (error) { /* sin conexión: se omite la información */ }

    const c = data.counters || {};
    const fmt = (v) => Format.currency(v);

    const KPIS = [
      { icon: '&#128176;', label: 'Ventas del mes', value: c.thisMonthCount ? fmt(c.thisMonthValue) : '$0', sub: c.thisMonthCount ? `${c.thisMonthCount} negocio${c.thisMonthCount === 1 ? '' : 's'} concluido${c.thisMonthCount === 1 ? '' : 's'}` : 'Sin cierres este mes', tone: 'green' },
      { icon: '&#128179;', label: 'Pipeline en curso', value: fmt(c.pipelineValue), sub: `${c.businessesActive || 0} negocio${c.businessesActive === 1 ? '' : 's'} activo${c.businessesActive === 1 ? '' : 's'}`, tone: 'blue' },
      { icon: '&#128101;', label: 'Clientes', value: c.clients || 0, sub: `Cartera registrada`, tone: 'purple' },
      { icon: '&#127968;', label: 'Propiedades', value: c.properties || 0, sub: 'En cartera', tone: 'amber' },
      { icon: '&#128276;', label: 'Avisos sin leer', value: c.notificationsUnread || 0, sub: 'Mantente al día', tone: 'red' },
      { icon: '&#127919;', label: 'Metas activas', value: c.activeGoals || 0, sub: 'Con avance automático', tone: 'teal' },
    ];

    const appointments = (data.recentAppointments || []).map(
      (a) => `
        <li class="home-list-item">
          <span class="home-list-dot" style="--dot: var(--primary)"></span>
          <div class="home-list-body">
            <strong>${UI.escapeHtml(a.title || 'Cita')}</strong>
            <small>${UI.escapeHtml(a.client && a.client.name ? a.client.name : 'Sin cliente')}</small>
          </div>
          <span class="home-list-time">${Format.dateTime(a.date)}</span>
        </li>`
    ).join('');

    const tasks = (data.recentTasks || []).map(
      (t) => `
        <li class="home-list-item">
          <span class="home-list-dot" style="--dot: var(--warning)"></span>
          <div class="home-list-body">
            <strong>${UI.escapeHtml(t.title || 'Tarea')}</strong>
            <small>${t.client && t.client.name ? UI.escapeHtml(t.client.name) : 'Sin cliente vinculado'}</small>
          </div>
          <span class="home-list-time">${Format.dateTime(t.date)}</span>
        </li>`
    ).join('');

    const QUICK = [
      { href: 'clients.html', icon: '&#10133;', label: 'Nuevo cliente' },
      { href: 'properties.html', icon: '&#127968;', label: 'Nueva propiedad' },
      { href: 'appointments.html', icon: '&#128197;', label: 'Nueva cita' },
      { href: 'tasks.html', icon: '&#9745;', label: 'Nueva tarea' },
      { href: 'businesses.html', icon: '&#128179;', label: 'Registrar negocio' },
      { href: 'goals.html', icon: '&#127919;', label: 'Nueva meta' },
    ];

    const MODULES = [
      { key: 'dashboard', label: 'Dashboard', desc: 'Indicadores y gráficas', href: 'dashboard.html', icon: '&#9638;' },
      { key: 'clients', label: 'Clientes', desc: 'Gestiona tus prospectos', href: 'clients.html', icon: '&#128101;' },
      { key: 'properties', label: 'Propiedades', desc: 'Cartera de inmuebles', href: 'properties.html', icon: '&#127968;' },
      { key: 'businesses', label: 'Negocios', desc: 'Operaciones y pipeline', href: 'businesses.html', icon: '&#128179;' },
      { key: 'appointments', label: 'Citas', desc: 'Agenda y visitas', href: 'appointments.html', icon: '&#128197;' },
      { key: 'tasks', label: 'Tareas', desc: 'Pendientes del día', href: 'tasks.html', icon: '&#9745;' },
      { key: 'goals', label: 'Metas', desc: 'Objetivos y avance', href: 'goals.html', icon: '&#127919;' },
      { key: 'expenses', label: 'Gastos', desc: 'Control de egresos', href: 'expenses.html', icon: '&#128184;' },
      { key: 'prospecting', label: 'Prospección', desc: 'Captación de cartera', href: 'prospecting.html', icon: '&#128269;' },
      { key: 'negotiations', label: 'Negociaciones', desc: 'Ofertas y contraofertas', href: 'negotiations.html', icon: '&#129309;' },
      { key: 'inventory', label: 'Mi Inventario', desc: 'Propiedades captadas', href: 'inventory.html', icon: '&#128230;' },
      { key: 'documents', label: 'Formatos', desc: 'Documentos y formatos', href: 'documents.html', icon: '&#128196;' },
      { key: 'chat', label: 'Chat', desc: 'Mensajería interna', href: 'chat.html', icon: '&#128172;' },
      { key: 'notifications', label: 'Avisos', desc: 'Notificaciones y recordatorios', href: 'notifications.html', icon: '&#128276;' },
      { key: 'reports', label: 'Mis reportes', desc: 'Exporta y analiza', href: 'reports.html', icon: '&#128202;' },
      { key: 'management', label: 'Reportes gerencia', desc: 'Panorama ejecutivo', href: 'management.html', icon: '&#128200;' },
      { key: 'settings', label: 'Configuración', desc: 'Opciones del sistema', href: 'settings.html', icon: '&#9881;' },
      { key: 'profile', label: 'Mi perfil', desc: 'Datos de tu cuenta', href: 'profile.html', icon: '&#128100;' },
    ];

    const kpiCards = KPIS.map(
      (k) => `
        <div class="kpi-card tone-${k.tone}">
          <span class="kpi-icon">${k.icon}</span>
          <div class="kpi-body">
            <small>${UI.escapeHtml(k.label)}</small>
            <strong>${k.value}</strong>
            <span class="kpi-sub">${UI.escapeHtml(k.sub)}</span>
          </div>
        </div>`
    ).join('');

    const quickActions = QUICK.map(
      (q) => `<a class="quick-action" href="${q.href}"><span>${q.icon}</span>${UI.escapeHtml(q.label)}</a>`
    ).join('');

    const cards = MODULES.map(
      (m) => `
        <a class="home-card" href="${m.href}" data-nav="${m.key}">
          <span class="home-card-icon">${m.icon}</span>
          <span class="home-card-body">
            <strong>${UI.escapeHtml(m.label)}</strong>
            <small>${UI.escapeHtml(m.desc)}</small>
          </span>
        </a>`
    ).join('');

    container.innerHTML = `
      <section class="home-hero">
        <div class="home-hero-text">
          <h2>${greeting}${name ? `, ${UI.escapeHtml(name)}` : ''}.</h2>
          <p>${todayLabel} · Así va tu cartera en este momento.</p>
        </div>
        ${role ? `<span class="home-role-badge">${UI.escapeHtml(role)}</span>` : ''}
      </section>

      <section class="home-section">
        <h3 class="home-section-title">Resumen ejecutivo</h3>
        <div class="kpi-grid">${kpiCards}</div>
      </section>

      <section class="home-section">
        <div class="home-columns">
          <div class="card home-list-card">
            <div class="home-list-head">
              <h3>&#128197; Próximas citas</h3>
              <a class="home-more" href="appointments.html">Ver todas &rarr;</a>
            </div>
            ${appointments ? `<ul class="home-list">${appointments}</ul>` : '<p class="empty-state">No hay citas próximas.</p>'}
          </div>
          <div class="card home-list-card">
            <div class="home-list-head">
              <h3>&#9745; Tareas por hacer</h3>
              <a class="home-more" href="tasks.html">Ver todas &rarr;</a>
            </div>
            ${tasks ? `<ul class="home-list">${tasks}</ul>` : '<p class="empty-state">No hay tareas pendientes.</p>'}
          </div>
        </div>
      </section>

      <section class="home-section">
        <h3 class="home-section-title">Accesos rápidos</h3>
        <div class="quick-actions">${quickActions}</div>
      </section>

      <section class="home-section">
        <h3 class="home-section-title">Módulos del sistema</h3>
        <div class="home-grid">${cards}</div>
      </section>
    `;
  },
};
