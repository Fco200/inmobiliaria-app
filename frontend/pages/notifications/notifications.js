'use strict';

window.Pages = window.Pages || {};

window.Pages.notifications = {
  title: 'Avisos y notificaciones',

  async render(container) {
    const user = ApiClient.getStoredUser();
    const isBoss = Boolean(user && user.role && ['admin', 'gerencia'].includes(user.role.code || user.role));
    const myId = user && (user._id || user.id);

    container.innerHTML = `
      <div class="page-header">
        <h2>Avisos y notificaciones</h2>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          ${isBoss ? '<button class="btn btn-primary" type="button" data-write-ann>&#128227; Redactar aviso</button>' : ''}
          <button class="btn btn-secondary" type="button" data-generate>Generar avisos</button>
          <button class="btn btn-secondary" type="button" data-read-all>Marcar todas como leídas</button>
          <button class="btn btn-danger" type="button" data-clear-notifs>&#128465; Borrar historial</button>
          ${isBoss ? '<button class="btn btn-danger" type="button" data-clear-anns>&#128465; Borrar avisos del equipo</button>' : ''}
        </div>
      </div>
      <div id="notif-filter" style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
        <label class="form-check">
          <input type="checkbox" id="notif-unread" style="margin-right:6px;"> Solo no leídas
        </label>
        <span id="notif-counter" class="text-muted" style="font-size:12px;"></span>
      </div>
      <div id="notif-list"><div class="loading">Cargando avisos...</div></div>
      <div id="notif-more" style="display:none;text-align:center;margin-top:14px;">
        <button class="btn btn-secondary" type="button" id="notif-load-more">Cargar más avisos</button>
      </div>

      <h3 style="margin:28px 0 12px;">&#128276; Avisos del equipo</h3>
      <p class="text-muted" style="font-size:13px;margin:0 0 10px;">
        Marca <strong>Ocultar</strong> en un aviso para que no vuelva a aparecer en tu cuenta.
        ${isBoss ? 'Como administrador también puedes <strong>eliminarlo para todo el equipo</strong>.' : ''}
      </p>
      <div id="ann-list"><div class="loading">Cargando avisos...</div></div>
    `;

    const listEl = container.querySelector('#notif-list');
    const unreadFilter = container.querySelector('#notif-unread');
    const annListEl = container.querySelector('#ann-list');
    const counterEl = container.querySelector('#notif-counter');
    const moreEl = container.querySelector('#notif-more');
    const moreBtn = container.querySelector('#notif-load-more');
    let records = [];
    // Paginación: el backend devuelve 25 avisos por página (máx. 100). Antes la
    // página pedía solo la primera página y no había forma de ver el resto, por
    // lo que la lista "se cortaba" sin explicación.
    const PAGE_SIZE = 25;
    let page = 1;
    let total = 0;
    let pages = 1;
    let loading = false;

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
        updateFooter();
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
      updateFooter();
    }

    // Contador "mostrando X de Y" + botón de "Cargar más" mientras queden
    // páginas por ver.
    function updateFooter() {
      const shown = records.length;
      if (counterEl) {
        counterEl.textContent = total
          ? `Mostrando ${shown} de ${total} aviso${total === 1 ? '' : 's'}`
          : '';
      }
      if (moreEl) {
        moreEl.style.display = page < pages && shown > 0 ? 'block' : 'none';
      }
    }

    // Marca como leídas (en el servidor) las notificaciones que se están
    // mostrando: al abrir el módulo, el contador de la campana se limpia de
    // una sola vez, sin una petición por aviso.
    async function markVisibleAsRead() {
      const ids = records.filter((n) => n && n._id && !n.read).map((n) => n._id);
      if (!ids.length) return;
      records.forEach((n) => { if (n && !n.read) n.read = true; });
      try {
        await API.notifications.markReadMany(ids);
        window.App && window.App.refreshNotificationBadge && window.App.refreshNotificationBadge();
      } catch (error) {
        // sin acción
      }
    }

    async function load(reset) {
      if (loading) return;
      loading = true;
      const isReset = reset !== false;
      if (isReset) {
        page = 1;
        listEl.innerHTML = '<div class="loading">Cargando avisos...</div>';
      } else {
        moreBtn.disabled = true;
        moreBtn.textContent = 'Cargando...';
      }
      try {
        const params = { page, limit: PAGE_SIZE };
        if (unreadFilter.checked) params.unread = true;
        const result = await API.notifications.list(params);
        const items = (result && Array.isArray(result.data)) ? result.data : [];
        const meta = (result && result.meta) || {};
        total = Number(meta.total) || items.length;
        pages = Number(meta.pages) || 1;
        records = isReset ? items : records.concat(items);
        renderList();
        if (isReset) markVisibleAsRead();
      } catch (error) {
        listEl.innerHTML = UI.errorAlert(error.message);
      } finally {
        loading = false;
        if (moreBtn) {
          moreBtn.disabled = false;
          moreBtn.textContent = 'Cargar más avisos';
        }
      }
    }

    // ------- Avisos del equipo (comunicados de admin / gerencia) -------
    const annReadByMe = (a) => Array.isArray(a.readBy) && a.readBy.some((r) => String(r && (r._id || r)) === String(myId));

    async function loadAnnouncements() {
      try {
        const result = await API.announcements.list();
        // ApiClient.unwrap desenrolla {data:[...]} → arreglo directo (avalúo);
        // se aceptan ambos formatos para no depender de paginación/meta.
        const raw = result && typeof result === 'object' && result.data !== undefined && result.meta !== undefined ? result.data : result;
        let anns = Array.isArray(raw) ? raw : [];
        // El asesor que “oculta” (marca leído) un aviso ya no lo vuelve a ver.
        // El admin/gerencia siempre los ve para poder gestionarlos.
        if (!isBoss) anns = anns.filter((a) => !annReadByMe(a));
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
                  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
                    <button class="btn btn-secondary btn-sm" type="button" data-hide-ann="${a._id}">&#128683; Ocultar</button>
                    ${isBoss ? `<button class="btn btn-danger btn-sm" type="button" data-del-ann="${a._id}">&#128465; Eliminar para todos</button>` : ''}
                  </div>
                </div>`;
            }).join('')}
          </div>`;

        annListEl.querySelectorAll('[data-hide-ann]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            btn.disabled = true;
            try {
              await API.announcements.markRead(btn.dataset.hideAnn);
              loadAnnouncements();
            } catch (error) {
              btn.disabled = false;
              UI.toast(error.message || 'No se pudo ocultar', 'error');
            }
          });
        });
        annListEl.querySelectorAll('[data-del-ann]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const ok = window.confirm('¿Eliminar este aviso para todo el equipo?');
            if (!ok) return;
            btn.disabled = true;
            try {
              await API.announcements.remove(btn.dataset.delAnn);
              UI.toast('Aviso eliminado', 'success');
              loadAnnouncements();
            } catch (error) {
              btn.disabled = false;
              UI.toast(error.message || 'No se pudo eliminar', 'error');
            }
          });
        });
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

    unreadFilter.addEventListener('change', () => load(true));

    if (moreBtn) {
      moreBtn.addEventListener('click', () => {
        if (page >= pages) return;
        page += 1;
        load(false);
      });
    }

    const writeAnnBtn = container.querySelector('[data-write-ann]');
    if (writeAnnBtn) writeAnnBtn.addEventListener('click', openWriteAnnouncement);

    const genBtn = container.querySelector('[data-generate]');
    if (genBtn) genBtn.addEventListener('click', async () => {
      try {
        const res = await API.notifications.generate();
        UI.toast(res.message, 'success');
        load(true);
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
        load(true);
        window.App && window.App.refreshNotificationBadge && window.App.refreshNotificationBadge();
      } catch (error) {
        UI.toast(error.message, 'error');
      }
    });

    // Borra el historial de avisos/notificaciones personales (de mi cuenta).
    const clearNotifsBtn = container.querySelector('[data-clear-notifs]');
    if (clearNotifsBtn) clearNotifsBtn.addEventListener('click', async () => {
      const ok = window.confirm('¿Borrar todo tu historial de avisos y notificaciones? Esta acción no se puede deshacer.');
      if (!ok) return;
      try {
        await API.notifications.clearAll();
        UI.toast('Historial borrado', 'success');
        load(true);
        window.App && window.App.refreshNotificationBadge && window.App.refreshNotificationBadge();
      } catch (error) {
        UI.toast(error.message || 'No se pudo borrar el historial', 'error');
      }
    });

    // Borra TODOS los avisos del equipo (solo admin/gerencia) para que dejen de
    // aparecer en cada inicio de sesión de los asesores.
    const clearAnnsBtn = container.querySelector('[data-clear-anns]');
    if (clearAnnsBtn) clearAnnsBtn.addEventListener('click', async () => {
      const ok = window.confirm('¿Eliminar TODOS los avisos del equipo para todos los usuarios?');
      if (!ok) return;
      try {
        await API.announcements.clearAll();
        UI.toast('Avisos del equipo eliminados', 'success');
        loadAnnouncements();
      } catch (error) {
        UI.toast(error.message || 'No se pudieron eliminar los avisos', 'error');
      }
    });

    load(true);
    loadAnnouncements();
  },
};
