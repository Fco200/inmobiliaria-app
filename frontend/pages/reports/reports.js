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

    const isGerencia = me && me.role && ['admin', 'direccion', 'gerencia', 'superadmin'].includes(me.role.code || me.role);

    let userOptions = [];
    if (isGerencia) {
      try {
        const result = await API.users.list({ limit: 100 });
        userOptions = UI.sortByLabel(result.data, (u) => u.name)
        .map((u) => ({ value: u._id, label: u.name }));
      } catch (error) {
        userOptions = [];
      }
    }

    container.innerHTML = `
      <div class="page-header">
        <h2>Mis reportes</h2>
      </div>
      <div style="display:flex;gap:14px;align-items:end;flex-wrap:wrap;margin-bottom:16px;">
        ${isGerencia ? `
          <div>
            <label style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">Asesor</label>
            <select class="form-control" id="report-user" style="min-width:240px;">
              <option value="me">Mis indicadores</option>
              ${userOptions.map((u) => `<option value="${u.value}">${UI.escapeHtml(u.label)}</option>`).join('')}
            </select>
          </div>` : ''}
        <div>
          <label style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">Desde</label>
          <input class="form-control" id="report-from" type="date">
        </div>
        <div>
          <label style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">Hasta</label>
          <input class="form-control" id="report-to" type="date">
        </div>
        <div>
          <button class="btn btn-secondary" type="button" id="report-clear-dates">Limpiar fechas</button>
        </div>
      </div>
      <div id="report-content"><div class="loading">Cargando reporte...</div></div>
    `;

    const content = container.querySelector('#report-content');
    const userSel = container.querySelector('#report-user');
    const fromEl = container.querySelector('#report-from');
    const toEl = container.querySelector('#report-to');

    function reportParams() {
      const params = {};
      if (fromEl && fromEl.value) params.from = Format.fromLocalInput(`${fromEl.value}T00:00`);
      if (toEl && toEl.value) params.to = Format.fromLocalInput(`${toEl.value}T23:59`);
      return params;
    }

    if (userSel) userSel.addEventListener('change', () => loadReport(userSel.value));
    [fromEl, toEl].forEach((el) => {
      if (el) el.addEventListener('change', () => loadReport(userSel ? userSel.value : 'me'));
    });
    const clearDates = container.querySelector('#report-clear-dates');
    if (clearDates) clearDates.addEventListener('click', () => {
      if (fromEl) fromEl.value = '';
      if (toEl) toEl.value = '';
      loadReport(userSel ? userSel.value : 'me');
    });

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
        const d = await API.dashboard.userReport(userId || 'me', reportParams());

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
            ${card('Tickets cobrados', d.ticketsCollectedCount || 0, `Monto: ${Format.currency(d.ticketsCollected)}`)}
            ${card('Tickets por cobrar', d.ticketsPending || 0, `Monto: ${Format.currency(d.ticketsNegotiating || 0)}`)}
          </div>
          <div class="grid grid-4 mt-1">
            ${card('En negociación', d.negotiations, `Tickets en negociación: ${Format.currency(d.ticketsNegotiating || 0)}`)}
            ${card('Valor de cierres', Format.currency(d.closureValue), 'Venta / renta / compra localizada')}
            ${card('Total de tickets', d.ticketsCount || 0, `Monto: ${Format.currency(d.ticketsGenerated)}`)}
            ${card('Gastos / inversión', Format.currency(d.expenses), 'Gastos del periodo')}
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
