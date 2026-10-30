'use strict';

window.Pages = window.Pages || {};

window.Pages.management = {
  title: 'Reportes de gerencia',

  async render(container) {
    let users = [];
    try {
      const result = await API.users.list({ limit: 100 });
      users = result.data;
    } catch (error) {
      users = [];
    }

    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const today = new Date();

    const roleName = (u) => (u.role ? u.role.name || u.role : 'Asesor');
    const roleCode = (u) => (u.role ? u.role.code || u.role : '');

    container.innerHTML = `
      <div class="page-header">
        <h2>Reportes de gerencia</h2>
      </div>
      <div class="card" style="margin-bottom:20px;">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;align-items:end;">
          <div>
            <label class="form-group" style="margin:0;font-size:13px;font-weight:600;">Asesor</label>
            <select class="form-control" id="mgr-user">
              <option value="all">Todos los asesores</option>
              ${users.map((u) => `<option value="${u._id}">${UI.escapeHtml(u.name)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-group" style="margin:0;font-size:13px;font-weight:600;">Desde</label>
            <input class="form-control" id="mgr-from" type="date" value="${Format.toLocalInput(firstDay).slice(0, 10)}">
          </div>
          <div>
            <label class="form-group" style="margin:0;font-size:13px;font-weight:600;">Hasta</label>
            <input class="form-control" id="mgr-to" type="date" value="${Format.toLocalInput(today).slice(0, 10)}">
          </div>
          <div>
            <button class="btn btn-primary" type="button" data-apply>Generar reporte</button>
          </div>
          <div>
            <button class="btn btn-secondary" type="button" data-mgr-csv>&#11015;&nbsp; Exportar CSV</button>
          </div>
        </div>
      </div>
      <div id="mgr-cards" class="advisor-grid">
        ${users.map((u) => `
          <div class="card advisor-card">
            <div class="advisor-card-head">
              ${u.photo
                ? `<img class="advisor-avatar" src="${window.AppConfig.resolveUrl(u.photo)}" alt="">`
                : `<span class="advisor-avatar advisor-avatar-fallback">${UI.escapeHtml(String(u.name || 'U').charAt(0).toUpperCase())}</span>`}
              <div style="flex:1;min-width:0;">
                <strong>${UI.escapeHtml(u.name)}</strong>
                <div class="text-muted" style="font-size:12px;">${UI.badge(roleName(u), roleCode(u) === 'admin' ? 'danger' : roleCode(u) === 'gerencia' ? 'warning' : 'info')}</div>
                <div class="text-muted" style="font-size:12px;">${UI.escapeHtml(u.position || '—')}</div>
              </div>
            </div>
            <button class="btn btn-secondary btn-block" type="button" data-detail="${u._id}">&#128100;&nbsp; Ver detalle</button>
          </div>`).join('') || '<p class="text-muted">Sin asesores registrados.</p>'}
      </div>
      <div class="card" id="mgr-activity" style="margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
          <h3 style="margin:0;">&#128273;&nbsp; Actividad del equipo <small class="text-muted" style="font-weight:400;">(en vivo)</small></h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <select class="form-control" id="mgr-activity-user" style="max-width:220px;">
              <option value="">Todos los asesores</option>
              ${users.map((u) => `<option value="${u._id}">${UI.escapeHtml(u.name)}</option>`).join('')}
            </select>
            <button class="btn btn-secondary btn-sm" type="button" data-activity-refresh>&#8635;&nbsp; Actualizar</button>
            <button class="btn btn-secondary btn-sm" type="button" data-activity-csv>&#11015;&nbsp; CSV</button>
          </div>
        </div>
        <div id="mgr-activity-feed"><div class="loading">Cargando actividad...</div></div>
      </div>
      <div id="mgr-content"><div class="loading">Cargando reporte...</div></div>
    `;

    const contentEl = container.querySelector('#mgr-content');
    const cardsEl = container.querySelector('#mgr-cards');
    const activityFeedEl = container.querySelector('#mgr-activity-feed');
    const activityUserEl = container.querySelector('#mgr-activity-user');

    const ACTION_LABELS = {
      creacion: 'Creó', actualizacion: 'Actualizó', eliminacion: 'Eliminó',
      cambio_estado: 'Cambió estado', publicar: 'Publicó', despublicar: 'Despublicó',
      cita: 'Agendó cita', negocio: 'Creó negocio', etapa: 'Movió de etapa',
      aviso: 'Publicó aviso', documento: 'Subió documento', tarea: 'Creó tarea',
      gasto: 'Registró gasto', meta: 'Registró meta', fotos: 'Subió fotos',
    };
    const ACTION_ICONS = {
      creacion: '&#10003;', actualizacion: '&#9998;', eliminacion: '&#10005;',
      cambio_estado: '&#128279;', publicar: '&#128196;', despublicar: '&#128465;',
      cita: '&#128197;', negocio: '&#128179;', etapa: '&#128200;',
      aviso: '&#128276;', documento: '&#128196;', tarea: '&#9745;',
      gasto: '&#128184;', meta: '&#127919;', fotos: '&#128247;',
    };

    function loadActivityFeed() {
      if (!activityFeedEl || !activityFeedEl.isConnected) return;
      const userId = activityUserEl ? activityUserEl.value : '';
      activityFeedEl.innerHTML = '<div class="loading">Cargando actividad...</div>';
      API.activity.list(userId ? { user: userId, limit: 40 } : { limit: 40 })
        .then((res) => {
          if (!container.isConnected) return;
          const items = res.data || [];
          if (!items.length) {
            activityFeedEl.innerHTML = '<p class="text-muted" style="margin:4px 0;">Sin actividad registrada todavía.</p>';
            return;
          }
          activityFeedEl.innerHTML = `<ul class="timeline team-timeline">
            ${items.map((a) => {
              const actor = a.user || {};
              const actorName = actor.name || 'Usuario';
              const action = String(a.action || '');
              const label = ACTION_LABELS[action] || action.replace(/_/g, ' ');
              const icon = ACTION_ICONS[action] || '&#8226;';
              const entity = a.entityType || '';
              const entityBadge = ['Property', 'Inventory', 'Client', 'Business', 'Appointment', 'Task', 'Goal', 'Expense', 'Notification', 'Document', 'Prospecting'].includes(entity)
                ? `<small class="text-muted" style="margin-left:6px;">(${entity.replace(/([A-Z])/g, ' $1').trim()})</small>` : '';
              return `<li>
                <div class="team-tl-head">
                  ${actor.photo
                    ? `<img class="advisor-avatar" style="width:28px;height:28px;" src="${window.AppConfig.resolveUrl(actor.photo)}" alt="">`
                    : `<span class="advisor-avatar advisor-avatar-fallback" style="width:28px;height:28px;font-size:13px;">${UI.escapeHtml(String(actorName).charAt(0).toUpperCase())}</span>`}
                  <strong style="flex:1;">${UI.escapeHtml(actorName)}</strong>
                  <span class="text-muted" style="font-size:11px;">${Format.dateTime(a.createdAt)}</span>
                </div>
                <div style="font-size:13px;">
                  <span style="color:var(--primary);">${icon} ${UI.escapeHtml(label)}</span>
                  ${entityBadge}
                </div>
                <div class="text-muted" style="font-size:13px;">${UI.escapeHtml(a.message || '')}</div>
              </li>`;
            }).join('')}
          </ul>`;
        })
        .catch((error) => {
          if (!container.isConnected) return;
          activityFeedEl.innerHTML = UI.errorAlert(error.message);
        });
    }

    if (activityUserEl) activityUserEl.addEventListener('change', loadActivityFeed);
    const refreshBtn = container.querySelector('[data-activity-refresh]');
    if (refreshBtn) refreshBtn.addEventListener('click', loadActivityFeed);
    setTimeout(loadActivityFeed, 0);
    const activityTimer = setInterval(() => {
      if (!activityFeedEl || !activityFeedEl.isConnected) {
        clearInterval(activityTimer);
        return;
      }
      loadActivityFeed();
    }, 45000);
    window.addEventListener('pagehide', () => clearInterval(activityTimer), { once: true });

    function openAdvisorDetail(userId) {
      const user = users.find((x) => String(x._id) === String(userId));
      const modal = UI.openModal({
        title: user ? `Detalle del asesor · ${user.name}` : 'Detalle del asesor',
        body: '<div class="loading">Cargando información del asesor...</div>',
        size: 860,
      });
      const body = document.querySelector('#modal-overlay [data-body]');

      const stat = (label, value, sub) => `
        <div class="card stat-card">
          <div class="stat-label">${UI.escapeHtml(label)}</div>
          <div class="stat-value">${value}</div>
          ${sub ? `<div class="stat-sub">${UI.escapeHtml(sub)}</div>` : ''}
        </div>
      `;

      const FUNNEL_STAGES = [
        { key: 'prospecto', label: 'Prospectos' },
        { key: 'contacto', label: 'Contactos' },
        { key: 'cita', label: 'Citas' },
        { key: 'negociacion', label: 'Negociación' },
        { key: 'promesa', label: 'Promesa' },
        { key: 'cierre', label: 'Cierres' },
      ];

      Promise.all([
        API.dashboard.userReport(userId).catch(() => null),
        API.goals.list({ user: userId, limit: 100 }).catch(() => ({ data: [] })),
        API.activity.list({ user: userId, limit: 12 }).catch(() => ({ data: [] })),
      ])
        .then(([report, goalsResult, activityResult]) => {
          const goals = goalsResult.data || [];
          const activity = activityResult.data || [];
          if (!body) return;

          let profileHtml = '';
          if (user) {
            profileHtml = `
              <div style="display:flex;gap:16px;align-items:center;margin-bottom:18px;flex-wrap:wrap;">
                ${user.photo
                  ? `<img class="advisor-avatar" style="width:72px;height:72px;border-radius:50%;object-fit:cover;" src="${window.AppConfig.resolveUrl(user.photo)}" alt="">`
                  : `<span class="advisor-avatar advisor-avatar-fallback" style="width:72px;height:72px;font-size:28px;">${UI.escapeHtml(String(user.name || 'U').charAt(0).toUpperCase())}</span>`}
                <div style="flex:1;min-width:220px;">
                  <h3 style="margin:0 0 4px;">${UI.escapeHtml(user.name)}</h3>
                  <div style="font-size:13px;color:var(--text-muted);">
                    ${UI.badge(roleName(user), 'info')}
                    ${user.position ? `&nbsp; ${UI.escapeHtml(user.position)}` : ''}
                  </div>
                  <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">
                    ${user.email ? `<span>&#9993; ${UI.escapeHtml(user.email)}</span>` : ''}
                    ${user.phone ? `<span style="margin-left:10px;">&#9742; ${UI.escapeHtml(user.phone)}</span>` : ''}
                  </div>
                  <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">
                    Ingresó: ${user.joinedAt ? Format.date(user.joinedAt) : '—'}
                    ${user.lastLoginAt ? ` · Último acceso: ${Format.dateTime(user.lastLoginAt)}` : ''}
                  </div>
                </div>
              </div>
            `;
          }

          let reportHtml = '';
          if (report) {
            const funnelTotal = FUNNEL_STAGES.reduce((acc, s) => acc + (Number(report.funnel[s.key]) || 0), 0);
            reportHtml = `
              <div class="grid grid-4 mt-1">
                ${stat('Clientes', report.clients, `${report.prospects} prospectos`)}
                ${stat('Citas', report.appointments, 'Citas registradas')}
                ${stat('Tareas', report.tasks, 'Tareas creadas')}
                ${stat('Negocios activos', report.activeBusinesses)}
              </div>
              <div class="grid grid-4 mt-1">
                ${stat('Concluidos', report.concludedBusinesses, 'Operaciones cerradas')}
                ${stat('Cancelados', report.cancelledBusinesses)}
                ${stat('Ingresos', Format.currency(report.ticketsCollected), 'Tickets cobrados')}
                ${stat('Comisiones', Format.currency(report.commission))}
              </div>
              <div class="grid grid-4 mt-1">
                ${stat('Valor de cierres', Format.currency(report.closureValue))}
                ${stat('Gastos / inversión', Format.currency(report.expenses))}
                ${stat('En negociación', report.negotiations, 'Negociación y promesa')}
                ${stat('Metas totales', report.goals)}
              </div>
              <div class="card mt-2">
                <h3 style="margin-top:0;">Embudo de ventas</h3>
                ${funnelTotal
                  ? FUNNEL_STAGES.map((s) => {
                      const count = Number(report.funnel[s.key]) || 0;
                      const pct = funnelTotal ? (count / funnelTotal) * 100 : 0;
                      return `
                        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
                          <div style="width:110px;font-size:13px;font-weight:600;">${s.label}</div>
                          <div style="flex:1;"><div class="progress"><div class="progress-bar" style="width:${pct}%;"></div></div></div>
                          <div style="width:50px;text-align:right;font-size:13px;">${count}</div>
                        </div>`;
                    }).join('')
                  : '<p class="text-muted">Sin clientes en el embudo todavía.</p>'}
              </div>
            `;
          }

          const goalsHtml = goals.length
            ? goals.map((g) => `
                <div class="mt-1">
                  <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
                    <strong>${UI.escapeHtml(g.name)}</strong>
                    ${UI.statusBadge(g.status)}
                  </div>
                  ${UI.progressBar((g.currentResult / g.objectiveAmount) * 100)}
                  <div class="text-muted" style="font-size:12px;">
                    Objetivo ${Format.currency(g.objectiveAmount)} · Avance ${Format.currency(g.currentResult)} ·
                    Falta ${Format.currency(g.objectiveAmount - g.currentResult)}
                  </div>
                </div>`).join('')
            : '<p class="text-muted">Sin metas registradas.</p>';

          const activityHtml = activity.length
            ? `<ul class="timeline" style="max-height:220px;overflow:auto;">
                ${activity.map((a) => `
                  <li>
                    <strong>${UI.escapeHtml(String(a.action || '').replace(/_/g, ' '))}</strong>
                    <div class="text-muted" style="font-size:12px;">${Format.dateTime(a.createdAt)}</div>
                    <div style="font-size:13px;">${UI.escapeHtml(a.message || '')}</div>
                  </li>`).join('')}
              </ul>`
            : '<p class="text-muted">Sin actividad reciente.</p>';

          body.innerHTML = `
            ${profileHtml}
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
              ${user ? `<a class="btn btn-secondary btn-sm" href="profile.html">Ver perfil completo</a>` : ''}
              <button class="btn btn-secondary btn-sm" type="button" data-close-detail>&times; Cerrar</button>
            </div>
            ${reportHtml || ''}
            <div class="card mt-2">
              <h3 style="margin-top:0;">Metas del asesor</h3>
              ${goalsHtml}
            </div>
            <div class="card mt-2">
              <h3 style="margin-top:0;">Actividad reciente</h3>
              ${activityHtml}
            </div>
          `;
          const closeBtn = body.querySelector('[data-close-detail]');
          if (closeBtn) closeBtn.addEventListener('click', () => UI.closeModal());
        })
        .catch((error) => {
          if (body) body.innerHTML = UI.errorAlert(error.message);
        });
    }

    function reportParams() {
      const params = {
        userId: container.querySelector('#mgr-user').value,
      };
      const from = container.querySelector('#mgr-from').value;
      const to = container.querySelector('#mgr-to').value;
      if (from) params.from = new Date(from).toISOString();
      if (to) params.to = new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();
      return params;
    }

    async function load() {
      contentEl.innerHTML = '<div class="loading">Generando reporte...</div>';
      const params = reportParams();

      try {
        const r = await API.reports.management(params);
        const t = r.totals;

        const stat = (label, value, sub) => `
          <div class="card stat-card">
            <div class="stat-label">${UI.escapeHtml(label)}</div>
            <div class="stat-value">${value}</div>
            ${sub ? `<div class="stat-sub">${UI.escapeHtml(sub)}</div>` : ''}
          </div>
        `;

        contentEl.innerHTML = `
          <div class="grid grid-4">
            ${stat('Prospectos', t.prospects, 'Clientes en etapa prospecto')}
            ${stat('Citas', t.appointments, 'En el periodo')}
            ${stat('Negociaciones', t.negotiations, 'En etapa de negociación')}
            ${stat('Promesas', t.promises, 'En etapa de promesa')}
          </div>
          <div class="grid grid-4 mt-1">
            ${stat('Cierres', t.closures, `${t.concludedBusinesses} concluidos`)}
            ${stat('Cancelaciones', t.cancellations)}
            ${stat('Inversión', Format.currency(t.investment), 'Gastos del periodo')}
            ${stat('Ingresos', Format.currency(t.ticketsCollected), 'Tickets cobrados')}
          </div>
          <div class="grid grid-4 mt-1">
            ${stat('Tickets generados', Format.currency(t.ticketsGenerated))}
            ${stat('Valor de cierres', Format.currency(t.closureValue))}
            ${stat('Comisiones', Format.currency(t.commission))}
            ${stat('Conversión', `${t.conversion}%`, 'Concluidos / total')}
          </div>

          <div class="table-wrapper card mt-2">
            <h3 style="margin-top:0;">Comparativa por asesor</h3>
            <table class="table">
              <thead><tr>
                <th>Asesor</th><th>Prospectos</th><th>Contactos</th><th>Citas</th><th>Negoc.</th><th>Promesas</th>
                <th>Cierres</th><th>Cancel.</th><th>Inversión</th><th>Ingresos</th><th>Comisión</th><th>Conv.</th><th></th>
              </tr></thead>
              <tbody>
                ${(r.byUser || []).map((u) => `
                  <tr>
                    <td><strong>${UI.escapeHtml(u.userName)}</strong></td>
                    <td>${u.prospects}</td>
                    <td>${u.contacts}</td>
                    <td>${u.appointments}</td>
                    <td>${u.negotiations}</td>
                    <td>${u.promises}</td>
                    <td>${u.closures}</td>
                    <td>${u.cancellations}</td>
                    <td>${Format.currency(u.investment)}</td>
                    <td>${Format.currency(u.ticketsCollected)}</td>
                    <td>${Format.currency(u.commission)}</td>
                    <td>${u.conversion}%</td>
                    <td><button class="btn btn-secondary btn-sm" type="button" data-row-detail="${u.userId}">Ver</button></td>
                  </tr>`).join('') || '<tr><td colspan="13" class="text-muted">Sin datos en el periodo.</td></tr>'}
              </tbody>
            </table>
          </div>
        `;
        contentEl.querySelectorAll('[data-row-detail]').forEach((btn) => {
          btn.addEventListener('click', () => openAdvisorDetail(btn.dataset.rowDetail));
        });
      } catch (error) {
        contentEl.innerHTML = UI.errorAlert(error.message);
      }
    }

    cardsEl.querySelectorAll('[data-detail]').forEach((btn) => {
      btn.addEventListener('click', () => openAdvisorDetail(btn.dataset.detail));
    });
    const applyBtn = container.querySelector('[data-apply]');
    if (applyBtn) applyBtn.addEventListener('click', load);
    const mgrCsvBtn = container.querySelector('[data-mgr-csv]');
    if (mgrCsvBtn) mgrCsvBtn.addEventListener('click', async () => {
      try {
        UI.toast('Generando CSV del reporte...', 'info');
        await API.reports.managementCsv(reportParams());
        UI.toast('CSV del reporte exportado', 'success');
      } catch (error) {
        UI.toast(error.message, 'error');
      }
    });
    const activityCsvBtn = container.querySelector('[data-activity-csv]');
    if (activityCsvBtn) activityCsvBtn.addEventListener('click', async () => {
      try {
        const userId = activityUserEl ? activityUserEl.value : '';
        UI.toast('Generando CSV de actividad...', 'info');
        await API.activity.exportCsv(userId ? { user: userId } : {});
        UI.toast('CSV de actividad exportado', 'success');
      } catch (error) {
        UI.toast(error.message, 'error');
      }
    });
    load();
  },
};
