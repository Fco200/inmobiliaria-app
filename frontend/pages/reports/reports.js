'use strict';

window.Pages = window.Pages || {};

window.Pages.reports = {
  title: 'Mis reportes',

  async render(container) {
    let me = null;
    try {
      me = await API.auth.me();
    } catch (error) {
      container.innerHTML = UI.errorAlert(error.message);
      return;
    }

    const isGerencia = me && me.role && ['admin', 'gerencia'].includes(me.role.code || me.role);

    let userOptions = [];
    if (isGerencia) {
      try {
        const result = await API.users.list({ limit: 100 });
        userOptions = result.data.map((u) => ({ value: u._id, label: u.name }));
      } catch (error) {
        userOptions = [];
      }
    }

    container.innerHTML = `
      <div class="page-header">
        <h2>Mis reportes</h2>
      </div>
      ${isGerencia ? `
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:16px;">
          <label style="font-weight:600;">Asesor:</label>
          <select class="form-control" id="report-user" style="max-width:280px;">
            <option value="me">Mis indicadores</option>
            ${userOptions.map((u) => `<option value="${u.value}">${UI.escapeHtml(u.label)}</option>`).join('')}
          </select>
        </div>` : ''}
      <div id="report-content"><div class="loading">Cargando reporte...</div></div>
    `;

    const content = container.querySelector('#report-content');
    const userSel = container.querySelector('#report-user');
    if (userSel) userSel.addEventListener('change', () => loadReport(userSel.value));

    const FUNNEL_STAGES = [
      { key: 'prospecto', label: 'Prospectos' },
      { key: 'contacto', label: 'Contactos' },
      { key: 'cita', label: 'Citas' },
      { key: 'negociacion', label: 'Negociación' },
      { key: 'promesa', label: 'Promesa' },
      { key: 'cierre', label: 'Cierres' },
    ];

    async function loadReport(userId) {
      content.innerHTML = '<div class="loading">Cargando reporte...</div>';
      try {
        const d = await API.dashboard.userReport(userId || 'me');

        const card = (label, value, sub) => `
          <div class="card stat-card">
            <div class="stat-label">${UI.escapeHtml(label)}</div>
            <div class="stat-value">${value}</div>
            ${sub ? `<div class="stat-sub">${UI.escapeHtml(sub)}</div>` : ''}
          </div>
        `;

        const funnelTotal = FUNNEL_STAGES.reduce((acc, s) => acc + (Number(d.funnel[s.key]) || 0), 0);

        content.innerHTML = `
          <div class="grid grid-4">
            ${card('Clientes', d.clients, `${d.prospects} prospectos`)}
            ${card('Citas', d.appointments, 'Citas registradas')}
            ${card('Tareas', d.tasks, 'Tareas creadas')}
            ${card('Negocios activos', d.activeBusinesses)}
          </div>
          <div class="grid grid-4 mt-1">
            ${card('Concluidos', d.concludedBusinesses, 'Operaciones cerradas')}
            ${card('Cancelados', d.cancelledBusinesses)}
            ${card('Tickets generados', Format.currency(d.ticketsGenerated))}
            ${card('Tickets cobrados', Format.currency(d.ticketsCollected), 'Ingreso registrado')}
          </div>
          <div class="grid grid-4 mt-1">
            ${card('En negociación', d.negotiations, 'Negociación y promesa')}
            ${card('Valor de cierres', Format.currency(d.closureValue))}
            ${card('Comisiones', Format.currency(d.commission))}
            ${card('Gastos / inversión', Format.currency(d.expenses))}
          </div>
          <div class="card mt-2">
            <h3 style="margin-top:0;">Embudo de ventas (${d.goals} metas registradas)</h3>
            ${funnelTotal
              ? FUNNEL_STAGES.map((s) => {
                  const count = Number(d.funnel[s.key]) || 0;
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
      } catch (error) {
        content.innerHTML = UI.errorAlert(error.message);
      }
    }

    loadReport('me');
  },
};
