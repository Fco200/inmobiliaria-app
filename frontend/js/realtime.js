'use strict';

/*
 * Realtime (Socket.IO global + alertas de avisos).
 *
 * Conexión de socket única para toda la aplicación (se reutiliza en el chat)
 * y capa de alertas: cuando el administrador o gerencia publica un aviso, el
 * equipo lo recibe como una alerta modal centrada en pantalla, en cualquier
 * página en la que se encuentre. Incluye un respaldo por polling por si el
 * socket no logra conectar (red, proxies, etc.).
 */
window.Realtime = (() => {
  let socket = null;
  let connecting = null;
  let pollTimer = null;

  const ALERT_KEY = 'crm_alerted';
  const NOTIF_ALERT_KEY = 'crm_notif_alerted';

  function baseUrl() {
    if (window.AppConfig && window.AppConfig.BASE_URL) return window.AppConfig.BASE_URL;
    return window.location.origin;
  }

  function currentUserId() {
    try {
      const user = window.ApiClient && window.ApiClient.getStoredUser();
      return (user && (user._id || user.id)) || null;
    } catch (error) {
      return null;
    }
  }

  function loadSocketClient() {
    return new Promise((resolve) => {
      if (window.io) return resolve();
      const s = document.createElement('script');
      s.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => resolve();
      document.head.appendChild(s);
    });
  }

  function seenIds() {
    try {
      return JSON.parse(localStorage.getItem(ALERT_KEY) || '[]');
    } catch (error) {
      return [];
    }
  }

  function markSeen(id) {
    const list = seenIds();
    if (!list.includes(id)) {
      list.push(id);
      localStorage.setItem(ALERT_KEY, JSON.stringify(list.slice(-80)));
    }
  }

  function markReadServer(id) {
    if (window.API && window.API.announcements && window.API.announcements.markRead) {
      window.API.announcements.markRead(id).catch(() => {});
    }
  }

  function refreshBadges() {
    if (window.App && window.App.refreshChatBadge) window.App.refreshChatBadge();
    if (window.App && window.App.refreshNotificationBadge) window.App.refreshNotificationBadge();
  }

  // Notificación visual (toast clicable en esquina) para un mensaje de chat
  // entrante de otro usuario. Muestra remitente + previsualización del texto y
  // refresca el contador de la burbuja del chat de inmediato. Evita notificar
  // los mensajes que envió el propio usuario.
  function showChatMessage(data) {
    if (!data || typeof UI === 'undefined') return;
    const msg = data.message || {};
    const sender = msg.sender || {};
    const senderId = sender && typeof sender === 'object' ? (sender._id || sender.id) : sender;
    const me = currentUserId();
    if (me && senderId && String(senderId) === String(me)) return;

    // El chat abierto en primer plano ya muestra el mensaje en vivo; no
    // duplicar la notificación ni el contador ahí (se marca como leído).
    if (window.location.pathname.indexOf('chat.html') !== -1) return;

    const senderName = (sender && (sender.name || sender.username)) || msg.emisorNombre || 'Mensaje';
    const text = String(msg.message || '');

    // Toast dedicado de chat: clicable para abrir el módulo de chat directo.
    let holder = document.getElementById('toast-holder');
    if (!holder) {
      holder = document.createElement('div');
      holder.id = 'toast-holder';
      holder.style.cssText =
        'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:4000;display:flex;flex-direction:column;align-items:center;gap:8px;width:max-content;max-width:min(460px,calc(100vw - 32px));pointer-events:none;';
      document.body.appendChild(holder);
    }
    const el = document.createElement('div');
    el.style.cssText =
      'padding:13px 18px;border-radius:12px;color:#fff;font-size:13px;text-align:center;' +
      'box-shadow:0 16px 40px rgba(0,0,0,0.3);max-width:100%;cursor:pointer;pointer-events:auto;' +
      'background:linear-gradient(135deg,#5B2D8E,#7B3FBF);animation:toastSlideIn 0.3s ease-out;';
    el.innerHTML = `
      <div style="font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px;">&#128172; ${UI.escapeHtml(senderName)}</div>
      <div style="margin-top:2px;color:rgba(255,255,255,0.92);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:300px;">${UI.escapeHtml(text)}</div>
    `;
    el.title = `Mensaje de ${senderName} - haz clic para abrir el chat`;
    el.addEventListener('click', () => {
      if (window.AppShell && typeof window.AppShell.openPanel === 'function') window.AppShell.openPanel('chat');
      else window.location.href = 'chat.html';
    });
    holder.appendChild(el);
    setTimeout(() => {
      el.style.animation = 'toastSlideOut 0.3s ease-in forwards';
      setTimeout(() => el.remove(), 300);
    }, 4500);

    // Sonido de mensaje recibido (solo mensajes de otros usuarios).
    if (typeof Sounds !== 'undefined') Sounds.receiveMessage().catch(() => {});

    // Actualiza el contador no leído de la burbuja del chat al instante.
    if (window.App && window.App.refreshChatBadge) window.App.refreshChatBadge();
  }


  // Muestra la alerta modal centrada de un aviso del equipo.
  function showAlert(announcement) {
    // NOTA: UI y Format son const globales de "clásicos" <script>: NO existen
    // como window.UI / window.Format. Se referencia el global lexical directo.
    if (!announcement || !announcement._id || typeof UI === 'undefined') return;
    if (seenIds().includes(announcement._id)) return;
    if (typeof Sounds !== 'undefined') Sounds.announcement().catch(() => {});
    // Quien publica el aviso ya lo conoce; no se le vuelve a mostrar.
    const author = announcement.author || {};
    const authorId = author && typeof author === 'object' ? (author._id || author.id) : author;
    if (authorId && String(authorId) === String(currentUserId())) return;

    // Motivo: la notificación/aviso NO se marca como leída aquí. El usuario la
    // verá como clicable y, al abrir el detalle, se marcará como leída vía API.
    markSeen(announcement._id);

    const palette = {
      normal: { color: '#5B2D8E', soft: '#f3e8ff' },
      importante: { color: '#d97706', soft: '#fef3c7' },
      urgente: { color: '#dc2626', soft: '#fee2e2' },
    };
    const p = palette[announcement.priority] || palette.normal;
    const authorName = (author && author.name) || (author && author.username) || 'Administración';
    const date = typeof Format !== 'undefined' ? Format.dateTime(announcement.createdAt) : '';

    const overlay = document.createElement('div');
    overlay.id = 'announcement-alert';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:2100;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(20,10,30,0.6);backdrop-filter:blur(2px);';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:14px;max-width:520px;width:100%;box-shadow:0 24px 70px rgba(0,0,0,0.4);overflow:hidden;border-top:6px solid ${p.color};">
        <div style="padding:18px 22px;border-bottom:1px solid #f0edf3;display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <strong style="font-size:15px;color:${p.color};">&#128276; Nuevo aviso del equipo</strong>
          <span style="background:${p.soft};color:${p.color};font-size:11px;font-weight:700;padding:3px 12px;border-radius:20px;text-transform:uppercase;">${UI.escapeHtml(announcement.priority || 'normal')}</span>
        </div>
        <div style="padding:22px 22px 6px;cursor:pointer;" data-detail>
          <h3 style="margin:0 0 12px;font-size:19px;line-height:1.3;color:#1f1b2e;">${UI.escapeHtml(announcement.title)}</h3>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#3d3560;white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${UI.escapeHtml(announcement.message)}</p>
        </div>
        <div style="padding:6px 22px 0;font-size:12px;color:#9088ab;">${UI.escapeHtml(authorName)}${date ? ` · ${date}` : ''}</div>
        <div style="padding:14px 22px;background:#faf8fd;display:flex;justify-content:flex-end;gap:10px;">
          <button class="btn btn-sm" type="button" data-cerrar>Cerrar</button>
          <button class="btn btn-primary" type="button" data-detail>Ver detalle</button>
        </div>
      </div>`;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-cerrar]')) {
        overlay.remove();
      } else if (e.target.closest('[data-detail]')) {
        overlay.remove();
        openAnnouncementDetail(announcement);
      }
    });
    document.body.appendChild(overlay);
  }

  // Abre el detalle del aviso en un modal y marca como leído al confirmarlo.
  function openAnnouncementDetail(announcement) {
    if (typeof UI === 'undefined') return;
    const palette = {
      normal: { color: '#5B2D8E', soft: '#f3e8ff' },
      importante: { color: '#d97706', soft: '#fef3c7' },
      urgente: { color: '#dc2626', soft: '#fee2e2' },
    };
    const p = palette[announcement.priority] || palette.normal;
    const authorName = (announcement.author && (announcement.author.name || announcement.author.username)) || 'Administración';
    const date = typeof Format !== 'undefined' ? Format.dateTime(announcement.createdAt) : '';

    const modal = UI.openModal({
      title: 'Aviso',
      size: 520,
      body: `
        <div style="padding:18px 20px;border-left:6px solid ${p.color};background:${p.soft};border-radius:10px;margin-bottom:14px;">
          <span style="display:inline-block;background:${p.color};color:#fff;font-size:11px;font-weight:700;padding:3px 12px;border-radius:20px;text-transform:uppercase;">${UI.escapeHtml(announcement.priority || 'normal')}</span>
        </div>
        <h3 style="margin:0 0 14px;font-size:20px;line-height:1.35;color:#1f1b2e;">${UI.escapeHtml(announcement.title)}</h3>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#3d3560;white-space:pre-wrap;">${UI.escapeHtml(announcement.message)}</p>
        <div style="font-size:13px;color:#9088ab;border-top:1px solid #f0edf3;padding-top:12px;">
          <div><strong>Autor:</strong> ${UI.escapeHtml(authorName)}</div>
          ${date ? `<div style="margin-top:4px;"><strong>Fecha:</strong> ${date}</div>` : ''}
        </div>
      `,
      footer: `
        <button class="btn btn-primary" type="button" data-confirm>&#10004;&nbsp; Marcar como leída</button>
      `,
    });

    const overlay = modal.bodyEl.closest('#modal-overlay');
    const confirmBtn = overlay.querySelector('[data-confirm]');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        markReadServer(announcement._id);
        UI.closeModal();
        if (window.App && window.App.refreshNotificationBadge) window.App.refreshNotificationBadge();
      });
    }
  }

  function seenNotifIds() {
    try {
      return JSON.parse(localStorage.getItem(NOTIF_ALERT_KEY) || '[]');
    } catch (error) {
      return [];
    }
  }

  function markNotifSeen(id) {
    const list = seenNotifIds();
    if (!list.includes(id)) {
      list.push(id);
      localStorage.setItem(NOTIF_ALERT_KEY, JSON.stringify(list.slice(-80)));
    }
  }

  // Alertas modales de las notificaciones individuales del usuario (recordatorios,
  // tareas vencidas, nuevos prospectos, etc.). Se muestran una sola vez por id.
  function showNotification(item) {
    if (!item || !item._id || typeof UI === 'undefined') return;
    if (seenNotifIds().includes(item._id)) return;
    if (typeof Sounds !== 'undefined') Sounds.notification().catch(() => {});

    markNotifSeen(item._id);

    const color = '#2d7d6c';
    const soft = '#e4f5f1';
    const date = typeof Format !== 'undefined' ? Format.dateTime(item.createdAt) : '';

    const overlay = document.createElement('div');
    overlay.id = 'notification-alert';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:2100;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(16,30,25,0.55);backdrop-filter:blur(2px);';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:14px;max-width:480px;width:100%;box-shadow:0 24px 70px rgba(0,0,0,0.4);overflow:hidden;border-top:6px solid ${color};">
        <div style="padding:16px 20px;border-bottom:1px solid #f0edf3;display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <strong style="font-size:15px;color:${color};">&#128276; Notificación nueva</strong>
        </div>
        <div style="padding:20px 20px 6px;cursor:pointer;" data-detail>
          <h3 style="margin:0 0 12px;font-size:18px;line-height:1.3;color:#1f1b2e;">${UI.escapeHtml(item.title || 'Notificación')}</h3>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#3d3560;white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${UI.escapeHtml(item.message || '')}</p>
        </div>
        <div style="padding:6px 20px 0;font-size:12px;color:#9088ab;">${date || ''}</div>
        <div style="padding:14px 20px;background:#faf8fd;display:flex;justify-content:flex-end;gap:10px;">
          <button class="btn btn-sm" type="button" data-cerrar>Cerrar</button>
          <button class="btn btn-primary" type="button" data-detail>Ver detalle</button>
        </div>
      </div>`;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-cerrar]')) {
        overlay.remove();
      } else if (e.target.closest('[data-detail]')) {
        overlay.remove();
        openNotificationDetail(item);
      }
    });
    document.body.appendChild(overlay);
  }

  // Abre el detalle de la notificación en un modal y marca como leída al confirmar.
  function openNotificationDetail(item) {
    if (typeof UI === 'undefined') return;
    const color = '#2d7d6c';
    const soft = '#e4f5f1';
    const date = typeof Format !== 'undefined' ? Format.dateTime(item.createdAt) : '';

    const modal = UI.openModal({
      title: 'Notificación',
      size: 500,
      body: `
        <div style="padding:16px 18px;border-left:6px solid ${color};background:${soft};border-radius:10px;margin-bottom:14px;">
          <span style="font-size:12px;color:${color};font-weight:700;text-transform:uppercase;">${UI.escapeHtml(item.type || 'aviso')}</span>
        </div>
        <h3 style="margin:0 0 14px;font-size:19px;line-height:1.35;color:#1f1b2e;">${UI.escapeHtml(item.title || 'Notificación')}</h3>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#3d3560;white-space:pre-wrap;">${UI.escapeHtml(item.message || '')}</p>
        <div style="font-size:13px;color:#9088ab;border-top:1px solid #f0edf3;padding-top:12px;">
          ${date ? `<div><strong>Fecha:</strong> ${date}</div>` : ''}
        </div>
      `,
      footer: `
        <button class="btn btn-primary" type="button" data-confirm>&#10004;&nbsp; Marcar como leída</button>
      `,
    });

    const overlay = modal.bodyEl.closest('#modal-overlay');
    const confirmBtn = overlay.querySelector('[data-confirm]');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        if (window.API && window.API.notifications && window.API.notifications.markRead) {
          window.API.notifications.markRead(item._id).catch(() => {});
        }
        UI.closeModal();
        if (window.App && window.App.refreshNotificationBadge) window.App.refreshNotificationBadge();
      });
    }
  }

  function wire() {
    if (!socket) return;
    socket.on('new-announcement', (announcement) => {
      showAlert(announcement);
      refreshBadges();
    });
    socket.on('delete-announcement', () => {
      refreshBadges();
    });
    socket.on('new-notification', (item) => {
      showNotification(item);
      refreshBadges();
    });
    const onChatActivity = (data) => {
      // Notificación visual de mensaje entrante (fuera del módulo de chat).
      showChatMessage(data);
      if (window.App && window.App.refreshChatBadge) window.App.refreshChatBadge();
    };
    socket.on('new-message', onChatActivity);
    socket.on('receive-message', onChatActivity);

    // Cierre de sesión puntual EN TIEMPO REAL: el servidor emite 'session-revoked'
    // solo a la sala `session:<hash>` del dispositivo afectado. Ese dispositivo
    // pierde el acceso al instante; los demás usuarios y dispositivos siguen
    // con su sesión normal.
    socket.on('session-revoked', (payload) => {
      forceLogout((payload && payload.message) || 'Tu sesión fue cerrada. Inicia sesión de nuevo.');
    });

    // Las listas de sesiones (Configuración y Soporte) se refrescan solas
    // cuando alguien abre o cierra una sesión en cualquier dispositivo.
    socket.on('sessions-changed', () => {
      try {
        window.dispatchEvent(new CustomEvent('sessions-changed'));
      } catch (e) { /* ignore */ }
    });

    // Órdenes de mantenimiento masivo enviadas desde el Panel de Soporte.
    // Estas acciones pueden afectar a CUALQUIER dispositivo conectado.
    socket.on('force-update', () => {
      // Limpia caché + service worker y recarga para traer la última versión.
      (async () => {
        try {
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
          if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map((r) => r.unregister()));
          }
          localStorage.removeItem('crm_app_version_seen');
        } catch (e) { /* ignore */ }
        window.location.reload();
      })();
    });
    socket.on('force-reload', () => {
      window.location.reload();
    });
    socket.on('force-logout', () => {
      forceLogout('Tu sesión fue cerrada.');
    });
  }

  // Cierra la sesión local: guarda un mensaje para la pantalla de login y
  // limpia token/usuario almacenados antes de redirigir.
  function forceLogout(message) {
    try {
      if (message) localStorage.setItem('crm_logout_msg', String(message));
      localStorage.removeItem('crm_token');
      localStorage.removeItem('crm_user');
      localStorage.removeItem('crm_login_at');
    } catch (e) { /* ignore */ }
    window.location.replace('index.html');
  }

  function reset() {
    socket = null;
    connecting = null;
  }

  // Conecta (o reutiliza) el socket global. Devuelve la instancia o null.
  async function connect() {
    if (socket) return socket;
    if (!connecting) {
      connecting = (async () => {
        await loadSocketClient();
        const token = localStorage.getItem('crm_token');
        if (!token || !window.io) return null;
        const instance = io(baseUrl(), { auth: { token } });
        instance.on('connect', () => {
          // El servidor ya une al usuario a su sala privada (user:<id>) y al
          // canal grupal general (general) al autenticarse.
          socket = instance;
          wire();
        });
        instance.on('disconnect', () => reset());
        return instance;
      })();
    }
    return connecting;
  }

  function getSocket() {
    return socket;
  }

  // Respaldo: si no hay socket conectado, cada 30s revisa avisos y
  // notificaciones no vistas.
  function startPolling() {
    if (pollTimer) return;
    const checkAnnouncements = () => {
      if (socket && socket.connected) return;
      if (!window.API || !window.API.announcements) return;
      window.API.announcements.list().then((res) => {
        // ApiClient.unwrap desenrolla {data:[...]} → arreglo directo.
        const raw = res && typeof res === 'object' && res.data !== undefined && res.meta !== undefined ? res.data : res;
        const list = Array.isArray(raw) ? raw : [];
        const unseen = list.filter((a) => a && a._id && !seenIds().includes(a._id));
        if (unseen.length) showAlert(unseen[0]);
      }).catch(() => {});
    };
    const checkNotifications = () => {
      if (socket && socket.connected) return;
      if (!window.API || !window.API.notifications) return;
      window.API.notifications.list({ unread: true }).then((res) => {
        let items = res;
        if (res && typeof res === 'object' && Array.isArray(res.data)) items = res.data;
        if (Array.isArray(items)) {
          const unseen = items.filter((n) => n && n._id && !seenNotifIds().includes(n._id));
          if (unseen.length) showNotification(unseen[0]);
        }
      }).catch(() => {});
    };
    // Respaldo de chat: sin socket, refresca el contador no leído para que la
    // burbuja del chat se actualice aunque se pierda la conexión en vivo.
    const checkChat = () => {
      if (socket && socket.connected) return;
      if (window.App && window.App.refreshChatBadge) window.App.refreshChatBadge();
    };
    checkAnnouncements();
    checkNotifications();
    checkChat();
    pollTimer = setInterval(() => {
      checkAnnouncements();
      checkNotifications();
      checkChat();
    }, 30000);
  }

  return { connect, getSocket, startPolling };
})();