'use strict';

window.Pages = window.Pages || {};

window.Pages.dashboard = {
  title: 'Dashboard',

  async render(container) {
    container.innerHTML = '<div class="loading">Cargando indicadores...</div>';

    try {
      console.log('[Dashboard] Solicitando resumen...');
      const result = await window.API.dashboard.summary();
      console.log('[Dashboard] Resumen recibido:', result);
      const c = result.counters;
      const funnel = result.funnel || {};
      const prospection = result.prospection || {};

      const user = window.ApiClient.getStoredUser();
      const isBoss = user && user.role && ['admin', 'gerencia'].includes(user.role.code || user.role);

      let execSection = '';
      if (isBoss) {
        try {
          const exec = await window.API.dashboard.executive();
          execSection = renderExecutive(exec);
        } catch (error) {
          execSection = '';
        }
      }

      const stat = (label, value, sub) => `
        <div class="card stat-card">
          <div class="stat-label">${UI.escapeHtml(label)}</div>
          <div class="stat-value">${value}</div>
          ${sub ? `<div class="stat-sub">${UI.escapeHtml(sub)}</div>` : ''}
        </div>
      `;

      function shortMoney(value) {
        const n = Number(value) || 0;
        if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
        if (n >= 1000) return `$${Math.round(n / 1000)}k`;
        return `$${Math.round(n)}`;
      }

      function renderExecutive(exec) {
        const monthly = exec.monthly || [];
        const maxTotal = Math.max.apply(null, monthly.map((m) => Number(m.total) || 0).concat([1]));
        const bars = monthly.map((m) => `
          <div style="flex:1;text-align:center;">
            <div style="font-size:10.5px;color:var(--text-muted);margin-bottom:4px;">${shortMoney(m.total)}</div>
            <div style="height:150px;display:flex;align-items:flex-end;justify-content:center;">
              <div style="width:70%;max-width:44px;height:${Math.max(2, (Number(m.total) / maxTotal) * 100)}%;background:var(--primary);border-radius:4px 4px 0 0;transition:height .3s ease;" title="${Format.currency(m.total)}"></div>
            </div>
            <div style="font-size:11px;margin-top:6px;font-weight:600;">${m.month}</div>
            <div style="font-size:10px;color:var(--text-muted);">${m.count}</div>
          </div>`).join('');

        const pipeline = exec.pipeline || { value: 0, count: 0 };
        const goals = exec.goals || { objective: 0, current: 0 };
        const goalPct = goals.objective ? Math.min(100, (goals.current / goals.objective) * 100) : 0;

        const advisors = (exec.topAdvisors || []).map((a) => `
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
            <div style="width:150px;font-size:13px;font-weight:600;">${a.user ? UI.escapeHtml(a.user.name) : 'Asesor'}</div>
            <div style="flex:1;"><div class="progress"><div class="progress-bar" style="width:${maxTotal ? Math.max(2, (Number(a.value) / maxTotal) * 100) : 0}%;"></div></div></div>
            <div style="width:110px;text-align:right;font-size:13px;">${Format.currency(a.value)} <small class="text-muted">(${a.count})</small></div>
          </div>`).join('');

        return `
          <div class="grid grid-2 mt-2">
            <div class="card">
              <h3 style="margin-top:0;">&#128200;&nbsp; Ventas por mes (últimos 6)</h3>
              <div style="display:flex;align-items:flex-end;gap:8px;">${bars || '<p class="text-muted">Sin ventas aún.</p>'}</div>
            </div>
            <div class="card">
              <h3 style="margin-top:0;">&#128179;&nbsp; Pipeline activo</h3>
              <div class="grid grid-2">
                <div class="stat-card" style="padding:10px 0;"><div class="stat-label">Valor en negociación</div><div class="stat-value">${Format.currency(pipeline.value)}</div></div>
                <div class="stat-card" style="padding:10px 0;"><div class="stat-label">Negocios activos</div><div class="stat-value">${pipeline.count}</div></div>
              </div>
              <h3 style="margin-top:16px;">&#127919;&nbsp; Avance global de metas</h3>
              <p><strong>${Format.currency(goals.current)}</strong> de <strong>${Format.currency(goals.objective)}</strong></p>
              <div class="progress"><div class="progress-bar" style="width:${goalPct}%;"></div></div>
            </div>
          </div>
          <div class="card mt-2">
            <h3 style="margin-top:0;">&#127942;&nbsp; Mejores asesores del año</h3>
            ${advisors || '<p class="text-muted">Sin cierres registrados este año.</p>'}
          </div>
        `;
      }

      const FUNNEL_STAGES = [
        { key: 'prospecto', label: 'Prospectos' },
        { key: 'cita', label: 'Citas' },
        { key: 'negociacion', label: 'Negociación' },
        { key: 'promesa', label: 'Promesa' },
        { key: 'cierre', label: 'Cierre' },
      ];
      const funnelTotal = FUNNEL_STAGES.reduce((acc, s) => acc + (Number(funnel[s.key]) || 0), 0);

      container.innerHTML = `
        <div class="grid grid-4">
          ${stat('Negocios activos', c.businessesActive)}
          ${stat('Negocios concluidos', c.businessesConcluded)}
          ${stat('Negocios cancelados', c.businessesCancelled)}
          ${stat('Prospectos / clientes', c.clients)}
        </div>
        <div class="grid grid-4 mt-1">
          ${stat('Propiedades', c.properties)}
          ${stat('Citas próximas', c.appointmentsUpcoming)}
          ${stat('Tareas pendientes', c.tasksPending)}
          ${stat('Tickets cobrados', Format.currency(c.ticketsCollected))}
        </div>
        <div class="grid grid-4 mt-1">
          ${stat('En negociación', c.businessesNegotiation || 0)}
          ${stat('En promesa', c.businessesPromesa || 0)}
          ${stat('Metas activas', c.activeGoals || 0)}
          ${stat('Avisos sin leer', c.notificationsUnread || 0)}
        </div>
        ${execSection}
        <div class="grid grid-2 mt-2">
          <div class="card">
            <h3 style="margin-top:0;">Embudo de ventas</h3>
            ${funnelTotal
              ? FUNNEL_STAGES.map((s) => {
                  const count = Number(funnel[s.key]) || 0;
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
          <div class="card">
            <h3 style="margin-top:0;">Prospección</h3>
            <p><strong>Inversión total:</strong> ${Format.currency(prospection.investment)}</p>
            <p><strong>Prospectos captados:</strong> ${prospection.prospects}</p>
            <p><strong>Gastos del mes:</strong> ${Format.currency(c.expensesThisMonth)}</p>
            <a class="btn btn-secondary btn-sm" href="prospecting.html">Ver prospección</a>
          </div>
        </div>
        <div class="grid grid-2 mt-2">
          <div class="card">
            <h3 style="margin-top:0;">Próximas citas</h3>
            <ul style="padding-left:18px;margin:0;">
              ${result.recentAppointments.length
                ? result.recentAppointments.map((a) => `<li style="margin-bottom:8px;"><strong>${UI.escapeHtml(Format.dateTime(a.date))}</strong> — ${UI.escapeHtml(a.client ? a.client.name : 'Sin cliente')} ${UI.statusBadge(a.status)}</li>`).join('')
                : '<li class="text-muted">Sin citas próximas.</li>'}
            </ul>
          </div>
          <div class="card">
            <h3 style="margin-top:0;">Tareas pendientes</h3>
            <ul style="padding-left:18px;margin:0;">
              ${result.recentTasks.length
                ? result.recentTasks.map((t) => `<li style="margin-bottom:8px;"><strong>${UI.escapeHtml(t.title)}</strong> — ${UI.escapeHtml(Format.date(t.date))} ${UI.statusBadge(t.priority)}</li>`).join('')
                : '<li class="text-muted">Sin tareas pendientes.</li>'}
            </ul>
          </div>
        </div>
      `;
    } catch (error) {
      console.error('[Dashboard] Error al cargar el resumen:', error);
      container.innerHTML = UI.errorAlert(error.message);
    }
  },
};
