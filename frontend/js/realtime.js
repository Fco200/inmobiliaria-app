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

  // Muestra la alerta modal centrada de un aviso del equipo.
  function showAlert(announcement) {
    // NOTA: UI y Format son const globales de "clásicos" <script>: NO existen
    // como window.UI / window.Format. Se referencia el global lexical directo.
    if (!announcement || !announcement._id || typeof UI === 'undefined') return;
    if (seenIds().includes(announcement._id)) return;
    // Quien publica el aviso ya lo conoce; no se le vuelve a mostrar.
    const author = announcement.author || {};
    const authorId = author && typeof author === 'object' ? (author._id || author.id) : author;
    if (authorId && String(authorId) === String(currentUserId())) return;

    markSeen(announcement._id);
    markReadServer(announcement._id);

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
        <div style="padding:24px 22px;">
          <h3 style="margin:0 0 12px;font-size:19px;line-height:1.3;color:#1f1b2e;">${UI.escapeHtml(announcement.title)}</h3>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#3d3560;white-space:pre-wrap;">${UI.escapeHtml(announcement.message)}</p>
          <div style="font-size:12px;color:#9088ab;">${UI.escapeHtml(authorName)}${date ? ` · ${date}` : ''}</div>
        </div>
        <div style="padding:14px 22px;background:#faf8fd;text-align:right;">
          <button class="btn btn-primary" type="button" data-ok>Entendido</button>
        </div>
      </div>`;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-ok]')) {
        overlay.remove();
      }
    });
    document.body.appendChild(overlay);
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
    const onChatActivity = () => {
      if (window.App && window.App.refreshChatBadge) window.App.refreshChatBadge();
    };
    socket.on('new-message', onChatActivity);
    socket.on('receive-message', onChatActivity);
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

  // Respaldo: si no hay socket conectado, cada 30s revisa avisos no vistos.
  function startPolling() {
    if (pollTimer) return;
    const check = () => {
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
    check();
    pollTimer = setInterval(check, 30000);
  }

  return { connect, getSocket, startPolling };
})();