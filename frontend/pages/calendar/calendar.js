'use strict';

window.Pages = window.Pages || {};

// Calendario interno: muestra en una sola vista mes/semana/día los eventos de
// citas, tareas, negocios, metas y prospección, y permite conectar Google
// Calendar (OAuth 2 vías) para sincronizar los eventos al calendario de Google.
window.Pages.calendar = (() => {
  const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const WEEK_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const WEEK_NAMES_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  const TYPES = {
    appointment: { label: 'Citas', color: '#2563eb' },
    task: { label: 'Tareas', color: '#d97706' },
    business: { label: 'Negocios', color: '#7c3aed' },
    goal: { label: 'Metas', color: '#059669' },
    prospecting: { label: 'Prospección', color: '#db2777' },
  };

  let state = {
    view: 'month', // month | week | day
    anchor: new Date(), // fecha ancla (año/mes o día según vista)
    events: [],
    typesMeta: {},
    loaded: false,
    gc: { configured: false, connected: false, syncEnabled: false, email: '', syncedAt: null },
    filters: { appointment: true, task: true, business: true, goal: true, prospecting: true },
  };

  let rootEl = null;

  function dateKey(d) {
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  }

  function toLocalDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Rango de fechas a consultar según la vista actual (con margen para metas).
  function rangeForView() {
    const anchor = state.anchor;
    let from;
    let to;
    if (state.view === 'month') {
      from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    } else if (state.view === 'week') {
      const dow = (anchor.getDay() + 6) % 7; // 0 = lunes
      from = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - dow);
      to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6);
    } else {
      from = startOfDay(anchor);
      to = startOfDay(anchor);
    }
    return { start: toLocalDate(from), end: toLocalDate(to) };
  }

  function endOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  }

  function keyToDate(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  async function loadEvents() {
    const range = rangeForView();
    // Para metas, que son rangos largos, ampliamos la consulta un poco.
    const metaRange = { start: range.start, end: range.end };
    try {
      const data = await window.API.calendar.events(metaRange);
      state.events = Array.isArray(data && data.events) ? data.events : [];
      if (data && data.types) state.typesMeta = data.types;
      Object.keys(TYPES).forEach((k) => {
        if (!state.typesMeta[k] && TYPES[k]) state.typesMeta[k] = TYPES[k];
      });
      state.loaded = true;
    } catch (error) {
      state.events = [];
      state.loaded = true;
      throw error;
    }
  }

  async function loadGoogleStatus() {
    try {
      const data = await window.API.calendar.status();
      state.gc = {
        configured: Boolean(data && data.configured),
        connected: Boolean(data && data.connected),
        syncEnabled: Boolean(data && data.syncEnabled),
        email: (data && data.email) || '',
        syncedAt: (data && data.syncedAt) || null,
      };
    } catch (e) {
      state.gc = { configured: false, connected: false, syncEnabled: false, email: '', syncedAt: null };
    }
  }

  // ---- Toolbar / controles ----
  function renderToolbar() {
    const range = rangeForView();
    let label = '';
    if (state.view === 'month') {
      label = `${MONTH_NAMES[state.anchor.getMonth()]} ${state.anchor.getFullYear()}`;
    } else if (state.view === 'week') {
      const start = keyToDate(range.start);
      const end = keyToDate(range.end);
      if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
        label = `${start.getDate()} – ${end.getDate()} ${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`;
      } else {
        label = `${start.getDate()} ${MONTH_NAMES[start.getMonth()]} – ${end.getDate()} ${MONTH_NAMES[end.getMonth()]} ${end.getFullYear()}`;
      }
    } else {
      const d = state.anchor;
      label = `${WEEK_NAMES_FULL[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    }

    const filterChips = Object.keys(TYPES).map((k) => {
      const active = state.filters[k] !== false;
      return `<button class="cal-chip ${active ? 'cal-chip-active' : ''}" data-toggle-type="${k}" style="--chip-color:${(state.typesMeta[k] && state.typesMeta[k].color) || TYPES[k].color};" type="button">${TYPES[k].label}</button>`;
    }).join('');

    const gcBtn = state.gc.connected
      ? `<div class="cal-gc-connected">
           <span class="cal-gc-dot"></span> Google Calendar conectado${state.gc.email ? ` · ${UI.escapeHtml(state.gc.email)}` : ''}
           <button class="btn btn-secondary btn-sm" type="button" data-gc-toggle>${state.gc.syncEnabled ? 'Sincronización activa' : 'Activar sincronización'}</button>
           <button class="btn btn-secondary btn-sm" type="button" data-gc-sync>Sincronizar ahora</button>
           <button class="btn btn-danger btn-sm" type="button" data-gc-disconnect>Desconectar</button>
         </div>`
      : ` <button class="btn btn-primary btn-sm" type="button" data-gc-connect>&#128467;&nbsp; Conectar Google Calendar</button> `;

    rootEl.innerHTML = `
      <div class="cal-page">
        <div class="cal-header">
          <h2 style="margin:0;font-size:20px;">&#128467;&nbsp; Calendario</h2>
          <div class="cal-toolbar">
            <button class="btn btn-secondary btn-sm" type="button" data-nav="today">Hoy</button>
            <button class="btn btn-secondary btn-sm" type="button" data-nav="prev">&#9664;</button>
            <button class="btn btn-secondary btn-sm" type="button" data-nav="next">&#9654;</button>
            <strong class="cal-label">${label}</strong>
            <div class="cal-view-toggle">
              <button class="btn btn-sm ${state.view === 'month' ? 'btn-primary' : 'btn-secondary'}" type="button" data-view="month">Mes</button>
              <button class="btn btn-sm ${state.view === 'week' ? 'btn-primary' : 'btn-secondary'}" type="button" data-view="week">Semana</button>
              <button class="btn btn-sm ${state.view === 'day' ? 'btn-primary' : 'btn-secondary'}" type="button" data-view="day">Día</button>
            </div>
          </div>
        </div>
        <div class="cal-google" style="margin-bottom:14px;">${gcBtn}</div>
        <div class="cal-filter-bar">${filterChips}</div>
        <div class="cal-view" data-cal-view>${renderView()}</div>
        ${
          !state.gc.connected && !state.gc.configured
            ? `<div class="cal-setup-note">&#128467;&nbsp; La integración con Google Calendar aún no está configurada por el administrador (se requieren credenciales OAuth en el backend).</div>`
            : ''
        }
      </div>
    `;

    // Bind events del filtro y toolbar
    rootEl.querySelectorAll('[data-toggle-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = btn.getAttribute('data-toggle-type');
        state.filters[k] = state.filters[k] === false;
        renderToolbar();
      });
    });

    rootEl.querySelector('[data-nav="today"]').addEventListener('click', () => {
      state.anchor = new Date();
      refreshView();
    });
    rootEl.querySelector('[data-nav="prev"]').addEventListener('click', () => navigate(-1));
    rootEl.querySelector('[data-nav="next"]').addEventListener('click', () => navigate(1));
    rootEl.querySelectorAll('[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.view = btn.getAttribute('data-view');
        refreshView();
      });
    });

    const gcConnect = rootEl.querySelector('[data-gc-connect]');
    if (gcConnect) gcConnect.addEventListener('click', connectGoogle);
    const gcToggle = rootEl.querySelector('[data-gc-toggle]');
    if (gcToggle) gcToggle.addEventListener('click', () => toggleGoogleSync(!state.gc.syncEnabled));
    const gcSync = rootEl.querySelector('[data-gc-sync]');
    if (gcSync) gcSync.addEventListener('click', syncNow);
    const gcDisconnect = rootEl.querySelector('[data-gc-disconnect]');
    if (gcDisconnect) gcDisconnect.addEventListener('click', disconnectGoogle);
  }

  function navigate(delta) {
    if (state.view === 'month') {
      state.anchor = new Date(state.anchor.getFullYear(), state.anchor.getMonth() + delta, 1);
    } else if (state.view === 'week') {
      state.anchor = new Date(state.anchor.getFullYear(), state.anchor.getMonth(), state.anchor.getDate() + delta * 7);
    } else {
      state.anchor = new Date(state.anchor.getFullYear(), state.anchor.getMonth(), state.anchor.getDate() + delta);
    }
    refreshView();
  }

  function visibleEvents() {
    return state.events.filter((e) => state.filters[e.type] !== false);
  }

  // ---- Vistas ----
  function renderView() {
    if (state.view === 'month') return renderMonth();
    if (state.view === 'week') return renderWeek();
    return renderDay();
  }

  function eventChip(e, small) {
    const meta = (state.typesMeta && state.typesMeta[e.type]) || TYPES[e.type] || { color: '#64748b' };
    const color = meta.color || TYPES[e.type].color || '#64748b';
    return `<button class="cal-event ${small ? 'cal-event-sm' : ''}" type="button" data-event-id="${UI.escapeHtml(e.id)}" style="--ev-color:${color};">${UI.escapeHtml(e.title)}</button>`;
  }

  function eventsOnDay(date) {
    const key = dateKey(date);
    return visibleEvents().filter((e) => {
      let matches = false;
      if (e.type === 'goal') {
        const s = new Date(e.start);
        const end = new Date(e.end);
        const day = startOfDay(date);
        matches = day >= startOfDay(s) && day <= endOfDay(end);
      } else {
        matches = dateKey(e.start) === key || dateKey(e.end) === key;
      }
      return matches;
    });
  }

  function renderMonth() {
    const year = state.anchor.getFullYear();
    const month = state.anchor.getMonth();
    const first = new Date(year, month, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const todayKey = dateKey(today);

    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);

    const grid = cells
      .map((d, i) => {
        if (!d) return `<div class="cal-cell cal-cell-empty"></div>`;
        const key = dateKey(d);
        const events = eventsOnDay(d);
        const isToday = key === todayKey;
        const isOtherMonth = d.getMonth() !== month;
        const chips = events.slice(0, 3).map((e) => eventChip(e, true)).join('');
        const more = events.length > 3 ? `<div class="cal-more">+${events.length - 3} más</div>` : '';
        return `
          <div class="cal-cell ${isOtherMonth ? 'cal-other-month' : ''}" data-date="${key}">
            <div class="cal-cell-head ${isToday ? 'cal-today' : ''}">${d.getDate()}</div>
            <div class="cal-cell-events">${chips}</div>
            ${more}
          </div>
        `;
      })
      .join('');

    const weekHeader = WEEK_NAMES.map((w) => `<div class="cal-weekhead">${w}</div>`).join('');

    return `
      <div class="cal-grid cal-grid-month" data-view-body="month">
        ${weekHeader}
        ${grid}
      </div>
    `;
  }

  function renderWeek() {
    const range = rangeForView();
    const start = keyToDate(range.start);
    const today = new Date();
    const todayKey = dateKey(today);
    const days = [];
    for (let i = 0; i < 7; i++) {
      days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    }
    const colWidth = 100 / 7;

    const weekHeader = days
      .map((d) => {
        const isToday = dateKey(d) === todayKey;
        return `<div class="cal-weekcol-head" style="width:${colWidth}%"><span class="cal-weekday">${WEEK_NAMES[d.getDay()]}</span><span class="cal-daynum ${isToday ? 'cal-today' : ''}" data-date="${dateKey(d)}">${d.getDate()}</span></div>`;
      })
      .join('');

    const colBody = days
      .map((d) => {
        const events = eventsOnDay(d);
        return `<div class="cal-weekcol" style="width:${colWidth}%" data-date="${dateKey(d)}">${events.map((e) => eventChip(e)).join('')}</div>`;
      })
      .join('');

    return `
      <div class="cal-grid cal-grid-week" data-view-body="week">
        <div class="cal-weekrow">${weekHeader}</div>
        <div class="cal-weekdayrow">${colBody}</div>
      </div>
    `;
  }

  function renderDay() {
    const d = state.anchor;
    const key = dateKey(d);
    const events = eventsOnDay(d);
    const list = events.length
      ? events.map((e) => {
          const meta = (state.typesMeta && state.typesMeta[e.type]) || TYPES[e.type] || { color: '#64748b' };
          const color = meta.color || '#64748b';
          return `
            <button class="cal-day-item" type="button" data-event-id="${UI.escapeHtml(e.id)}" style="--ev-color:${color};">
              <span class="cal-day-time">${Format.time(e.start)}</span>
              <span class="cal-day-title">${UI.escapeHtml(e.title)}</span>
              <span class="cal-day-type">${(meta.label || e.type).toUpperCase()}</span>
            </button>`;
        }).join('')
      : `<div class="empty-state"><p>No hay eventos este día.</p></div>`;

    return `
      <div class="cal-grid cal-grid-day" data-view-body="day">
        <div class="cal-day-head">${WEEK_NAMES_FULL[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}</div>
        <div class="cal-day-list">${list}</div>
      </div>
    `;
  }

  function refreshView() {
    if (!rootEl) return;
    renderToolbar();
  }

  // Hace que toda la vista (toolbar + grid + google) se recargue desde cero.
  async function fullRefresh() {
    if (!rootEl) return;
    rootEl.innerHTML = '<div class="loading">Cargando calendario...</div>';
    try {
      await Promise.all([loadEvents(), loadGoogleStatus()]);
      renderToolbar();
      UI.toast('Calendario actualizado.', 'success');
    } catch (error) {
      renderToolbar();
    }
  }

  // ---- Google Calendar ----
  async function connectGoogle() {
    try {
      const data = await window.API.calendar.authUrl();
      if (data && data.url) {
        window.location.href = data.url;
      } else {
        UI.toast('No se pudo generar la URL de autorización.', 'error');
      }
    } catch (error) {
      UI.toast((error && error.message) || 'No se pudo conectar con Google Calendar.', 'error');
    }
  }

  async function disconnectGoogle() {
    const ok = await UI.confirm('¿Desconectar tu Google Calendar? Se detendrá la sincronización automática.');
    if (!ok) return;
    try {
      await window.API.calendar.disconnect();
      state.gc = { configured: state.gc.configured, connected: false, syncEnabled: false, email: '', syncedAt: null };
      renderToolbar();
      UI.toast('Google Calendar desconectado.', 'success');
    } catch (error) {
      UI.toast((error && error.message) || 'Error al desconectar.', 'error');
    }
  }

  async function toggleGoogleSync(enabled) {
    try {
      const data = await window.API.calendar.toggle({ enabled });
      state.gc.syncEnabled = Boolean(data && data.syncEnabled);
      renderToolbar();
      UI.toast(state.gc.syncEnabled ? 'Sincronización automática activada.' : 'Sincronización automática desactivada.', 'success');
    } catch (error) {
      UI.toast((error && error.message) || 'Error al cambiar la sincronización.', 'error');
    }
  }

  async function syncNow() {
    const range = rangeForView();
    UI.toast('Sincronizando con Google Calendar...', 'info');
    try {
      const data = await window.API.calendar.sync({ start: range.start, end: range.end });
      const n = (data && data.synced) || 0;
      if (n) await loadGoogleStatus();
      renderToolbar();
      UI.toast(`Sincronizados ${n} eventos a Google Calendar.`, 'success');
    } catch (error) {
      UI.toast((error && error.message) || 'Error al sincronizar.', 'error');
    }
  }

  // ---- Detalle de evento ----
  function showEventDetails(eventId) {
    const e = state.events.find((x) => x.id === eventId);
    if (!e) return;
    const meta = (state.typesMeta && state.typesMeta[e.type]) || TYPES[e.type] || {};
    const color = meta.color || '#5B2D8E';
    const clientName = e.client && (e.client.name || e.client._id) ? e.client.name : null;
    const propertyLine =
      e.property && (e.property.zone || e.property.city || e.property.type)
        ? [e.property.type, e.property.city, e.property.zone].filter(Boolean).join(' · ')
        : null;

    const rows = [];
    rows.push(`<tr><th>Fecha</th><td>${Format.dateTime(e.start)}${e.end ? ` – ${Format.time(e.end)}` : ''}</td></tr>`);
    if (e.type !== 'goal') rows.push(`<tr><th>Tipo</th><td>${UI.escapeHtml((meta.label || e.type).toUpperCase())}</td></tr>`);
    if (e.status) rows.push(`<tr><th>Estado</th><td>${UI.escapeHtml(String(e.status).replace(/_/g, ' '))}</td></tr>`);
    if (e.stage) rows.push(`<tr><th>Etapa</th><td>${UI.escapeHtml(String(e.stage).replace(/_/g, ' '))}</td></tr>`);
    if (clientName) rows.push(`<tr><th>Cliente</th><td>${UI.escapeHtml(clientName)}</td></tr>`);
    if (propertyLine) rows.push(`<tr><th>Propiedad</th><td>${UI.escapeHtml(propertyLine)}</td></tr>`);
    if (e.location) rows.push(`<tr><th>Lugar</th><td>${UI.escapeHtml(e.location)}</td></tr>`);
    if (e.priority) rows.push(`<tr><th>Prioridad</th><td>${UI.escapeHtml(e.priority)}</td></tr>`);
    if (e.description) rows.push(`<tr><th>Detalles</th><td>${UI.escapeHtml(e.description)}</td></tr>`);

    const footer = `
      <a class="btn btn-secondary" href="${sourceHref(e)}">Abrir módulo</a>
      <button class="btn btn-primary" data-close-detail type="button">Cerrar</button>
    `;

    UI.openModal({
      title: `<span style="color:${color};">●</span> ${UI.escapeHtml(e.title)}`,
      body: `<table class="cal-detail-table">${rows.join('')}</table>`,
      footer,
      size: 520,
    });
    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
      const close = overlay.querySelector('[data-close-detail]');
      if (close) close.addEventListener('click', () => UI.closeModal());
    }
  }

  function sourceHref(e) {
    if (e.type === 'appointment') return 'appointments.html';
    if (e.type === 'task') return 'tasks.html';
    if (e.type === 'business') return 'businesses.html';
    if (e.type === 'goal') return 'goals.html';
    if (e.type === 'prospecting') return 'prospecting.html';
    return 'home.html';
  }

  // Delegación de eventos dentro del contenedor de vista.
  function bindViewDelegation() {
    if (!rootEl) return;
    rootEl.addEventListener('click', (e) => {
      const eventBtn = e.target.closest('[data-event-id]');
      if (eventBtn) {
        e.stopPropagation();
        showEventDetails(eventBtn.getAttribute('data-event-id'));
        return;
      }
      const dateEl = e.target.closest('[data-date]');
      if (dateEl && (state.view === 'month' || state.view === 'week')) {
        const key = dateEl.getAttribute('data-date');
        const [y, m, d] = key.split('-').map(Number);
        state.anchor = new Date(y, m - 1, d);
        state.view = 'day';
        renderToolbar();
      }
    });
  }

  // ---- Query params (callback de Google / navegación profunda) ----
  function handleQueryParams() {
    const params = new URLSearchParams(window.location.search);
    const gc = params.get('gc');
    if (gc === 'connected') {
      UI.toast('Google Calendar conectado correctamente.', 'success');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (gc === 'denied') {
      UI.toast('Se canceló la conexión con Google Calendar.', 'warning');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (gc === 'error') {
      UI.toast('Error al conectar Google Calendar.', 'error');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (gc === 'session') {
      UI.toast('Tu sesión expiró. Inicia sesión de nuevo para conectar Google Calendar.', 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  async function render(container) {
    rootEl = container;
    handleQueryParams();
    rootEl.innerHTML = '<div class="loading">Cargando calendario...</div>';
    await loadGoogleStatus();
    await loadEvents();
    renderToolbar();
    bindViewDelegation();
  }

  return { render };
})();
