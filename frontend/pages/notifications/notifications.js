'use strict';

window.Pages = window.Pages || {};

window.Pages.notifications = {
  title: 'Avisos y notificaciones',

  async render(container) {
    container.innerHTML = `
      <div class="page-header">
        <h2>Avisos y notificaciones</h2>
        <div style="display:flex;gap:10px;">
          <button class="btn btn-secondary" type="button" data-generate>Generar avisos</button>
          <button class="btn btn-primary" type="button" data-read-all>Marcar todas como leídas</button>
        </div>
      </div>
      <div id="notif-filter" style="margin-bottom:16px;">
        <label class="form-check">
          <input type="checkbox" id="notif-unread" style="margin-right:6px;"> Solo no leídas
        </label>
      </div>
      <div id="notif-list"><div class="loading">Cargando avisos...</div></div>
    `;

    const listEl = container.querySelector('#notif-list');
    const unreadFilter = container.querySelector('#notif-unread');
    let records = [];

    const TYPE_ICONS = {
      cita_proxima: '&#128197;',
      cita_recordatorio_24h: '&#128197;',
      cita_recordatorio_1h: '&#9200;',
      tarea_vencida: '&#9203;',
      documento_pendiente: '&#128196;',
      avaluo_pendiente: '&#128214;',
      firma_pendiente: '&#9998;',
      pago_pendiente: '&#128184;',
      meta_proxima_vencer: '&#127919;',
      negocio_sin_actualizacion: '&#128179;',
      negocio_cancelado: '&#128308;',
      nuevo_prospecto: '&#128101;',
      propiedad_apartada: '&#127968;',
      nuevo_negocio: '&#128179;',
      nuevo_mensaje_chat: '&#128172;',
      sistema: '&#9888;',
    };

    function renderList() {
      const items = records;
      if (!items.length) {
        listEl.innerHTML = '<div class="card"><div class="empty-state"><p>No hay avisos.</p></div></div>';
        return;
      }
      listEl.innerHTML = `
        <div class="card" style="padding:0;">
          <ul style="list-style:none;margin:0;padding:0;">
            ${items.map((n) => `
              <li data-notif="${n._id}" style="display:flex;gap:12px;align-items:flex-start;padding:14px 20px;border-bottom:1px solid var(--border);cursor:pointer;${n.read ? 'opacity:0.65;' : ''}">
                <div style="font-size:20px;">${TYPE_ICONS[n.type] || '&#9888;'}</div>
                <div style="flex:1;">
                  <div style="font-weight:600;">${UI.escapeHtml(n.title)}</div>
                  <div style="font-size:13px;color:var(--text-muted);">${UI.escapeHtml(n.message || '')}</div>
                  <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${Format.dateTime(n.createdAt)}</div>
                </div>
                ${n.read ? '' : '<span class="badge badge-info">Nueva</span>'}
              </li>`).join('')}
          </ul>
        </div>
      `;
      listEl.querySelectorAll('[data-notif]').forEach((item) => {
        item.addEventListener('click', async () => {
          const notif = records.find((n) => n._id === item.dataset.notif);
          if (notif && !notif.read) {
            try {
              await API.notifications.markRead(notif._id);
              notif.read = true;
              renderList();
              window.App && window.App.refreshNotificationBadge && window.App.refreshNotificationBadge();
            } catch (error) {
              // sin acción
            }
          }
        });
      });
    }

    async function load() {
      listEl.innerHTML = '<div class="loading">Cargando avisos...</div>';
      try {
        const params = unreadFilter.checked ? { unread: true } : {};
        const result = await API.notifications.list(params);
        records = result.data || [];
        renderList();
      } catch (error) {
        listEl.innerHTML = UI.errorAlert(error.message);
      }
    }

    unreadFilter.addEventListener('change', load);

    const genBtn = container.querySelector('[data-generate]');
    if (genBtn) genBtn.addEventListener('click', async () => {
      try {
        const res = await API.notifications.generate();
        UI.toast(res.message, 'success');
        load();
        window.App && window.App.refreshNotificationBadge && window.App.refreshNotificationBadge();
      } catch (error) {
        UI.toast(error.message, 'error');
      }
    });

    const readAllBtn = container.querySelector('[data-read-all]');
    if (readAllBtn) readAllBtn.addEventListener('click', async () => {
      try {
        await API.notifications.markAllRead();
        UI.toast('Todas marcadas como leídas', 'success');
        load();
        window.App && window.App.refreshNotificationBadge && window.App.refreshNotificationBadge();
      } catch (error) {
        UI.toast(error.message, 'error');
      }
    });

    load();
  },
};
