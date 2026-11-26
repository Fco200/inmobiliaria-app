'use strict';
window.Pages = window.Pages || {};
window.Pages.home = {
  title: 'Inicio',

  async render(container) {
    const user = window.ApiClient.getStoredUser();
    const name = (user && (user.name || user.username)) || '';
    const role = user && user.role ? (user.role.name || user.role.code || user.role) : '';
    const roleCode = user && user.role ? (typeof user.role === 'object' ? (user.role.code || '') : String(user.role)) : '';
    const isBoss = ['admin', 'direccion', 'gerencia', 'asistencia', 'superadmin'].includes(roleCode);

    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
    const todayLabel = now.toLocaleDateString('es-MX', { timeZone: 'America/Hermosillo', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // Frase motivacional del día: rota con el día del año para que la portada
    // se sienta viva sin cambiar en cada recarga.
    const FRASES = [
      'Cada gran cierre empieza con una buena conversación.',
      'La constancia de hoy es la venta de mañana.',
      'Tu cartera crece con cada seguimiento que haces.',
      'Un cliente bien atendido regresa y te recomienda.',
      'El éxito inmobiliario se construye cita a cita.',
      'Hoy es un buen día para cerrar un negocio.',
      'Las mejores oportunidades se trabajan, no se esperan.',
    ];
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5);
    const frase = FRASES[dayOfYear % FRASES.length];

    const QUICK = [
      { href: 'clients.html', icon: '&#10133;', label: 'Nuevo cliente' },
      { href: 'properties.html', icon: '&#127968;', label: 'Nueva propiedad' },
      { href: 'calendar.html?new=appointment', icon: '&#128197;', label: 'Nueva cita' },
      { href: 'calendar.html', icon: '&#128467;', label: 'Calendario' },
      { href: 'tasks.html', icon: '&#9745;', label: 'Nueva tarea' },
      { href: 'businesses.html', icon: '&#128179;', label: 'Registrar negocio' },
      { href: 'goals.html', icon: '&#127919;', label: 'Nueva meta' },
    ];

    const MODULES = [
      { key: 'dashboard', label: 'Dashboard', desc: 'Indicadores y gráficas', href: 'dashboard.html', icon: '&#9638;' },
      { key: 'clients', label: 'Clientes', desc: 'Gestiona tus prospectos', href: 'clients.html', icon: '&#128101;' },
      { key: 'properties', label: 'Captar Propiedades', desc: 'Captación: aquí decides si compartes al inventario', href: 'properties.html', icon: '&#127968;' },
      { key: 'businesses', label: 'Negocios', desc: 'Operaciones y pipeline', href: 'businesses.html', icon: '&#128179;' },
      { key: 'appointments', label: 'Citas', desc: 'Agenda y visitas', href: 'calendar.html', icon: '&#128197;' },
      { key: 'calendar', label: 'Calendario', desc: 'Vista mes, semana y día', href: 'calendar.html', icon: '&#128467;' },
      { key: 'tasks', label: 'Tareas', desc: 'Pendientes del día', href: 'tasks.html', icon: '&#9745;' },
      { key: 'goals', label: 'Metas', desc: 'Objetivos y avance', href: 'goals.html', icon: '&#127919;' },
      { key: 'expenses', label: 'Gastos', desc: 'Control de egresos', href: 'expenses.html', icon: '&#128184;' },
      { key: 'prospecting', label: 'Prospección', desc: 'Captación de cartera', href: 'prospecting.html', icon: '&#128269;' },
      { key: 'negotiations', label: 'Negociaciones', desc: 'Ofertas y contraofertas', href: 'negotiations.html', icon: '&#129309;' },
      { key: 'inventory', label: 'Propiedades', desc: 'Inventario general del equipo', href: 'inventory.html', icon: '&#128230;' },
      { key: 'documents', label: 'Formatos', desc: 'Documentos y formatos', href: 'documents.html', icon: '&#128196;' },
      { key: 'chat', label: 'Chat', desc: 'Mensajería interna', href: 'chat.html', icon: '&#128172;' },
      { key: 'notifications', label: 'Avisos', desc: 'Notificaciones y recordatorios', href: 'notifications.html', icon: '&#128276;' },
      { key: 'reports', label: 'Mis reportes', desc: 'Exporta y analiza', href: 'reports.html', icon: '&#128202;' },
      { key: 'management', label: 'Reportes gerencia', desc: 'Panorama ejecutivo', href: 'management.html', icon: '&#128200;' },
      { key: 'settings', label: 'Configuración', desc: 'Opciones del sistema', href: 'settings.html', icon: '&#9881;' },
      { key: 'profile', label: 'Mi perfil', desc: 'Datos de tu cuenta', href: 'profile.html', icon: '&#128100;' },
      { key: 'ayuda', label: 'Ayuda y soporte', desc: 'Soporte, guía y contraseña', href: 'ayuda.html', icon: '&#128172;' },
      { key: 'guia', label: isBoss ? 'Guía del sistema' : 'Guía de uso', desc: isBoss ? 'Manual del administrador' : 'Cómo usar cada módulo', href: isBoss ? 'GUIA.HTML' : 'GUIAUSUARIO.HTML', icon: '&#128214;' },
    ];

    const FEATURES = [
      { icon: '&#128101;', title: 'Clientes al día', desc: 'Registra prospectos, perfílalos y conserva su historial completo.' },
      { icon: '&#127968;', title: 'Propiedades que se comparten', desc: 'Captura inmuebles con fotos y genera fichas PDF listas para WhatsApp.' },
      { icon: '&#128197;', title: 'Agenda sin pendientes', desc: 'Citas, tareas y recordatorios conectados a cada cliente y negocio.' },
      { icon: '&#128202;', title: 'Decisiones con datos', desc: 'Reportes y metas para medir tu avance y el de tu equipo.' },
    ];

    const STEPS = [
      { num: '1', href: 'clients.html', title: 'Registra un cliente', desc: 'Nombre, teléfono y qué está buscando.' },
      { num: '2', href: 'properties.html', title: 'Captura una propiedad', desc: 'Fotos, precio y características.' },
      { num: '3', href: 'calendar.html?new=appointment', title: 'Agenda una cita', desc: 'Vincúlala al cliente y al inmueble.' },
      { num: '4', href: 'businesses.html', title: 'Abre el negocio', desc: 'Da seguimiento hasta el cierre.' },
    ];

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

    const features = FEATURES.map(
      (f) => `
        <div class="home-feature">
          <span class="home-feature-icon">${f.icon}</span>
          <strong>${UI.escapeHtml(f.title)}</strong>
          <small>${UI.escapeHtml(f.desc)}</small>
        </div>`
    ).join('');

    const steps = STEPS.map(
      (s) => `
        <a class="home-step" href="${s.href}">
          <span class="home-step-num">${s.num}</span>
          <span class="home-step-body">
            <strong>${UI.escapeHtml(s.title)}</strong>
            <small>${UI.escapeHtml(s.desc)}</small>
          </span>
        </a>`
    ).join('');

    container.innerHTML = `
      <section class="home-hero">
        <div class="home-hero-text">
          <h2>${greeting}${name ? `, ${UI.escapeHtml(name)}` : ''}.</h2>
          <p>${todayLabel} &middot; ${UI.escapeHtml(frase)}</p>
          <div class="home-hero-actions">
            <button class="btn btn-primary" type="button" data-download-app>&#128229;&nbsp; Descargar la app</button>
            <span class="home-version-chip" id="home-version-chip" title="Versión de la aplicación">&#8987; Versión&hellip;</span>
          </div>
        </div>
        ${role ? `<span class="home-role-badge">${UI.escapeHtml(role)}</span>` : ''}
      </section>

      <section class="home-update-banner" aria-label="Novedades de la app">
        <span class="home-update-spark home-update-spark-1" aria-hidden="true">&#10024;</span>
        <span class="home-update-spark home-update-spark-2" aria-hidden="true">&#11088;</span>
        <span class="home-update-spark home-update-spark-3" aria-hidden="true">&#10024;</span>
        <span class="home-update-spark home-update-spark-4" aria-hidden="true">&#127881;</span>
        <div class="home-update-copy">
          <span class="home-update-badge">&#128640; RECIÉN ESTREADA</span>
          <h3>Tu app está más que lista ahora</h3>
          <p>Más lista que nunca para acompañarte en cada visita, cada negocio y cada cierre. Sigue siendo tu misma app de siempre, solo que con ganas nuevas de ayudarte.</p>
        </div>
        <div class="home-update-orb" aria-hidden="true"></div>
      </section>

      <section class="card home-intro">
        <div class="home-intro-copy">
          <span class="home-intro-kicker">&#128075; Bienvenido a INMOBLES</span>
          <h3>Tu trabajo inmobiliario, en un solo lugar</h3>
          <p>
            INMOBLES es el CRM de tu equipo: organiza tu cartera de clientes, captura y comparte
            propiedades, agenda citas y acompaña cada operación hasta el cierre. Todo queda
            conectado: el cliente, el inmueble, la cita y el negocio se hablan entre sí.
          </p>
          <p class="home-intro-tip">
            &#128161; Entra a cualquier módulo desde los accesos de abajo. ¿Es tu primera vez?
            Empieza por la <a href="${isBoss ? 'GUIA.HTML' : 'GUIAUSUARIO.HTML'}">${isBoss ? 'Guía del sistema' : 'Guía de uso'}</a>.
          </p>
        </div>
        <div class="home-intro-features">${features}</div>
      </section>

      <section class="home-section">
        <h3 class="home-section-title">Empieza en 4 pasos</h3>
        <div class="home-steps">${steps}</div>
      </section>

      <section class="home-section">
        <div class="home-about-grid">
          <div class="card home-version-card">
            <div class="home-list-head">
              <h3>&#128230; Versión de la app</h3>
              <a class="home-more" href="actualizaciones.html">Actualizaciones &rarr;</a>
            </div>
            <div class="home-version-row">
              <span class="home-version-num" id="home-version-num">&mdash;</span>
              <span class="home-version-meta" id="home-version-meta">Consultando&hellip;</span>
            </div>
            <ul class="home-version-notes" id="home-version-notes"></ul>
          </div>
          <div class="card home-help-card">
            <h3>&#128172; ¿Necesitas ayuda?</h3>
            <p>Consulta la guía paso a paso o contacta a soporte si algo no funciona como esperas.</p>
            <div class="home-help-actions">
              <a class="btn btn-secondary btn-sm" href="${isBoss ? 'GUIA.HTML' : 'GUIAUSUARIO.HTML'}">&#128214; ${isBoss ? 'Guía del sistema' : 'Guía de uso'}</a>
              <a class="btn btn-secondary btn-sm" href="ayuda.html">&#128736; Ayuda y soporte</a>
            </div>
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

    // La versión se consulta DESPUÉS de pintar: la portada aparece al instante
    // y el dato de versión se rellena en cuanto responde el servidor.
    try {
      const version = await window.API.config.version();
      if (version && version.version) {
        const chip = container.querySelector('#home-version-chip');
        const num = container.querySelector('#home-version-num');
        const meta = container.querySelector('#home-version-meta');
        const notes = container.querySelector('#home-version-notes');
        const channel = version.channel ? String(version.channel) : 'estable';
        if (chip) chip.innerHTML = `&#128230; Versión ${UI.escapeHtml(version.version)}`;
        if (num) num.textContent = `v${version.version}`;
        if (meta) {
          const fecha = version.date ? Format.date(version.date) : '';
          meta.innerHTML = `<span class="home-version-channel">${UI.escapeHtml(channel)}</span>${fecha ? ` &middot; ${UI.escapeHtml(fecha)}` : ''}`;
        }
        if (notes) {
          const items = (version.notes || []).slice(0, 4);
          notes.innerHTML = items.length
            ? items.map((n) => `<li>${UI.escapeHtml(n)}</li>`).join('')
            : '<li>Sin notas de versión publicadas.</li>';
        }
      }
    } catch (error) {
      // Sin conexión: la portada sigue funcionando, solo se oculta el dato.
      const chip = container.querySelector('#home-version-chip');
      const meta = container.querySelector('#home-version-meta');
      if (chip) chip.style.display = 'none';
      if (meta) meta.textContent = 'No disponible sin conexión';
    }
  },
};
