'use strict';

window.Pages = window.Pages || {};

window.Pages.notifications = {
  title: 'Avisos y notificaciones',

  async render(container) {
    const user = ApiClient.getStoredUser();
    const isBoss = Boolean(user && user.role && ['admin', 'gerencia'].includes(user.role.code || user.role));

    container.innerHTML = `
      <div class="page-header">
        <h2>Avisos y notificaciones</h2>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          ${isBoss ? '<button class="btn btn-primary" type="button" data-write-ann>&#128227; Redactar aviso</button>' : ''}
          <button class="btn btn-secondary" type="button" data-generate>Generar avisos</button>
          <button class="btn btn-secondary" type="button" data-read-all>Marcar todas como leídas</button>
        </div>
      </div>
      <div id="notif-filter" style="margin-bottom:16px;">
        <label class="form-check">
          <input type="checkbox" id="notif-unread" style="margin-right:6px;"> Solo no leídas
        </label>
      </div>
      <div id="notif-list"><div class="loading">Cargando avisos...</div></div>

      <h3 style="margin:28px 0 12px;">&#128276; Avisos del equipo</h3>
      <div id="ann-list"><div class="loading">Cargando avisos...</div></div>
    `;

    const listEl = container.querySelector('#notif-list');
    const unreadFilter = container.querySelector('#notif-unread');
    const annListEl = container.querySelector('#ann-list');
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

    // ------- Avisos del equipo (comunicados de admin / gerencia) -------
    async function loadAnnouncements() {
      try {
        const result = await API.announcements.list();
        // ApiClient.unwrap desenrolla {data:[...]} → arreglo directo (avalúo);
        // se aceptan ambos formatos para no depender de paginación/meta.
        const raw = result && typeof result === 'object' && result.data !== undefined && result.meta !== undefined ? result.data : result;
        const anns = Array.isArray(raw) ? raw : [];
        if (!anns.length) {
          annListEl.innerHTML = '<div class="card"><div class="empty-state"><p>No hay avisos publicados.</p></div></div>';
          return;
        }
        annListEl.innerHTML = `
          <div class="card" style="padding:0;">
            ${anns.map((a) => {
              const priority = a.priority || 'normal';
              const color = priority === 'urgente' ? '#dc2626' : priority === 'importante' ? '#d97706' : '#5B2D8E';
              const soft = priority === 'urgente' ? '#fee2e2' : priority === 'importante' ? '#fef3c7' : '#f3e8ff';
              return `
                <div style="padding:14px 20px;border-bottom:1px solid var(--border);border-left:4px solid ${color};">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
                    <strong>${UI.escapeHtml(a.title)}</strong>
                    <span style="background:${soft};color:${color};font-size:10px;font-weight:700;padding:2px 10px;border-radius:10px;text-transform:uppercase;">${UI.escapeHtml(priority)}</span>
                  </div>
                  <div style="font-size:13px;color:var(--text);margin-top:4px;white-space:pre-wrap;">${UI.escapeHtml(a.message)}</div>
                  <div style="font-size:12px;color:var(--text-muted);margin-top:6px;">
                    ${a.author ? UI.escapeHtml(a.author.name) : 'Administración'} · ${Format.dateTime(a.createdAt)}
                  </div>
                </div>`;
            }).join('')}
          </div>`;
      } catch (error) {
        annListEl.innerHTML = UI.errorAlert(error.message);
      }
    }

    function openWriteAnnouncement() {
      UI.openModal({
        title: 'Redactar aviso para el equipo',
        body: `
          <form id="ann-form" style="display:flex;flex-direction:column;gap:12px;">
            <div>
              <label class="form-label">Título</label>
              <input class="form-control" id="ann-title" placeholder="Título del aviso" required maxlength="200">
            </div>
            <div>
              <label class="form-label">Mensaje</label>
              <textarea class="form-control" id="ann-message" rows="5" placeholder="Escribe el aviso..." required maxlength="2000"></textarea>
            </div>
            <div>
              <label class="form-label">Prioridad</label>
              <select class="form-control" id="ann-priority">
                <option value="normal">Normal</option>
                <option value="importante">Importante</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
            <button class="btn btn-primary btn-block" type="submit">Publicar aviso</button>
          </form>
        `,
        size: 480,
      });
      const form = document.getElementById('ann-form');
      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const title = document.getElementById('ann-title').value.trim();
          const message = document.getElementById('ann-message').value.trim();
          const priority = document.getElementById('ann-priority').value;
          if (!title || !message) return;
          try {
            await API.announcements.create({ title, message, priority });
            UI.closeModal();
            loadAnnouncements();
            UI.toast('Aviso publicado', 'success');
          } catch (err) {
            UI.toast(err.message || 'Error al publicar', 'error');
          }
        });
      }
    }

    unreadFilter.addEventListener('change', load);

    const writeAnnBtn = container.querySelector('[data-write-ann]');
    if (writeAnnBtn) writeAnnBtn.addEventListener('click', openWriteAnnouncement);

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
    loadAnnouncements();
  },
};
