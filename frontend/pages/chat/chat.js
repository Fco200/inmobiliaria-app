'use strict';

window.Pages = window.Pages || {};

// ---------------------------------------------------------------------------
// Mensajes rápidos
//
// Hay dos tipos:
//   · Los FIJOS, que ve TODO el equipo sin importar el usuario ni el
//     dispositivo (son los saludos habituales: "Buenos días equipo", etc.).
//   · Los PROPIOS de cada asesor, que se guardan en SU navegador
//     (localStorage) para no ensuciar la cuenta de los demás.
// ---------------------------------------------------------------------------
const CHAT_QUICK_DEFAULT = [
  'Buenos días equipo',
  'Buenas tardes equipo',
  'Buenas noches equipo',
  'Hola equipo',
];
const CHAT_QUICK_KEY = 'chat_quick_messages';
const CHAT_QUICK_MAX = 24;

const chatQuickCustom = () => {
  try {
    const raw = localStorage.getItem(CHAT_QUICK_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list)
      ? list.filter((m) => typeof m === 'string' && m.trim()).slice(0, CHAT_QUICK_MAX)
      : [];
  } catch (e) {
    // Modo privado / almacenamiento bloqueado: se sigue con los mensajes fijos.
    return [];
  }
};

const chatQuickSave = (list) => {
  try {
    localStorage.setItem(CHAT_QUICK_KEY, JSON.stringify(list.slice(0, CHAT_QUICK_MAX)));
  } catch (e) { /* sin almacenamiento: no se guardan los personalizados */ }
};

// Clave de día (para los separadores "Hoy / Ayer / fecha").
const chatDayKey = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
};

const chatDayLabel = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const today = chatDayKey(new Date());
  const yesterday = chatDayKey(new Date(Date.now() - 86400000));
  const key = chatDayKey(dt);
  if (key === today) return 'Hoy';
  if (key === yesterday) return 'Ayer';
  return dt.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: dt.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
};

window.Pages.chat = {
  title: 'Chat',

  async render(container) {
    document.body.classList.add('page-chat');
    const isEmbed = /[?&]embed=1\b/.test(window.location.search);
    if (isEmbed) document.body.classList.add('is-embed');

    // En móvil el teclado del sistema redimensiona el "visual viewport" sin
    // cambiar 100vh. Se publican dos variables (alto y desplazamiento reales)
    // para que la conversación abierta quede siempre encima del teclado y la
    // barra de escritura no se pierda detrás de él. Se enlaza UNA sola vez por
    // documento (render() puede volver a ejecutarse desde el shell).
    const applyChatViewport = () => {
      // Dentro del panel flotante (iframe) el visualViewport pertenece a la
      // página padre y da valores erróneos: en ese caso se usa el tamaño real
      // del propio iframe.
      const vv = isEmbed ? null : window.visualViewport;
      const h = vv ? vv.height : window.innerHeight;
      const top = vv ? vv.offsetTop : 0;
      document.documentElement.style.setProperty('--chat-vh', Math.round(h) + 'px');
      document.documentElement.style.setProperty('--chat-top', Math.round(top) + 'px');
    };
    applyChatViewport();
    if (!window.__chatViewportBound) {
      window.__chatViewportBound = true;
      const vv = isEmbed ? null : window.visualViewport;
      if (vv) {
        vv.addEventListener('resize', applyChatViewport);
        vv.addEventListener('scroll', applyChatViewport);
      }
      window.addEventListener('resize', applyChatViewport);
      window.addEventListener('orientationchange', () => setTimeout(applyChatViewport, 250));
    }

    // El layout se inyecta ANTES de consultar los elementos para evitar
    // errores "cannot read properties of null". Todas las consultas se
    // acotan al contenedor de esta página (no a document global).
    const isBossUser = (u) => {
      const role = u && u.role ? (u.role.code || u.role) : '';
      return role === 'admin' || role === 'gerencia';
    };
    const user = (window.ApiClient && window.ApiClient.getStoredUser()) || {};
    const userId = user ? (user._id || user.id) : null;
    const isAdmin = isBossUser(user);
    const myName = (user && (user.name || user.username)) || 'Yo';

    // ¿El dispositivo es táctil? En el móvil Enter debe hacer SALTO DE LÍNEA
    // (el botón "Enviar" manda) y en el escritorio Enter ENVÍA el mensaje.
    const isTouch = () => (
      window.matchMedia && window.matchMedia('(pointer: coarse)').matches
    ) || window.innerWidth <= 768;

    if (!userId) {
      container.innerHTML = `
        <div class="card">
          <div class="empty-state">
            <p>Inicia sesión para usar el chat.</p>
          </div>
        </div>`;
      return;
    }

    // Comparador robusto de ids: los participantes/readBy pueden venir como
    // string, ObjectId o null (usuarios eliminados), nunca debe lanzar errores.
    const sameAsUser = (ref) => {
      const id = ref && typeof ref === 'object' ? (ref._id || ref.id) : ref;
      return id != null && String(id) === String(userId);
    };

    // ApiClient.unwrap devuelve el cuerpo `data` cuando el endpoint NO usa meta
    // (caso de chats y avisos) y devuelve {data, meta} cuando sí la usa (usuarios).
    // Este helper normaliza ambos formatos para no romper por "el resultado ya
    // viene desenrollado".
    const pickData = (res) => (
      res && typeof res === 'object' && res.data !== undefined && res.meta !== undefined ? res.data : res
    );

    // Nombre legible de un chat del equipo (canales fijos + respaldo).
    const isGeneral = (c) => c && c.type === 'grupal' && (c.name === 'general' || (c.name || '').toLowerCase().startsWith('general'));
    const isSoporte = (c) => c && c.type === 'grupal' && (c.name === 'soporte' || (c.name || '').toLowerCase().startsWith('soporte'));
    const chatLabel = (c) => {
      if (isGeneral(c)) return 'Canal general';
      if (isSoporte(c)) return 'Soporte técnico';
      if (c && c.type === 'grupal') return c.name || 'Chat de equipo';
      const other = (c.participants || []).filter(Boolean).find(p => !sameAsUser(p && (p._id || p)));
      return (other && (other.name || other.username)) || 'Chat';
    };

    container.innerHTML = `
      <div class="chat-wrap">
        <div class="chat-sidebar" id="chat-sidebar">
          <div class="chat-sidebar-head">
            <button class="btn btn-secondary chat-exit" id="btn-exit-modules" type="button" title="Volver al menú de módulos">&#8592; Módulos</button>
            <button class="btn btn-primary" id="btn-general">&#128172; Canal general</button>
            <button class="btn btn-primary" id="btn-soporte">&#128736;&#65039; Soporte</button>
            <button class="btn btn-secondary" id="btn-new-chat">+ Chat 1:1</button>
            <button class="btn btn-secondary" id="btn-new-announcement" style="display:none;">+ Aviso</button>
          </div>
          <div class="chat-sidebar-tabs">
            <button class="chat-sidebar-tab active" data-tab="chats">Chats</button>
            <button class="chat-sidebar-tab" data-tab="announcements">Avisos</button>
          </div>
          <div class="chat-sidebar-list" id="chat-list">
            <div class="loading">Cargando chats...</div>
          </div>
        </div>
        <div class="chat-main" id="chat-main">
          <div class="chat-header" id="chat-header">
            <button class="icon-btn" id="btn-back-chat" type="button" title="Volver a la lista de chats" aria-label="Volver a la lista de chats">&#8592;</button>
            <div class="chat-header-titles">
              <div id="chat-title" class="chat-title-line">Selecciona un chat</div>
              <div id="chat-participants" class="chat-subline"></div>
            </div>
            <span class="chat-conn" id="chat-conn" data-state="idle" title="Estado de la conexión">&#9679;</span>
            <button class="icon-btn" id="btn-clear-chat" type="button" title="Borrar historial de la conversación" aria-label="Borrar historial" style="display:none;">&#128465;</button>
            <button class="icon-btn" id="btn-exit-header" type="button" title="Cambiar de módulo" aria-label="Cambiar de módulo">&#9776;</button>
          </div>
          <div class="chat-banner" id="chat-banner" hidden></div>
          <div class="chat-messages" id="chat-messages">
            <div class="chat-empty">Selecciona una conversación para comenzar</div>
          </div>
          <div class="chat-quick" id="chat-quick" style="display:none;">
            <div class="chat-quick-head">
              <span class="chat-quick-title">Mensajes rápidos</span>
              <button class="icon-btn chat-quick-btn" id="btn-quick-add" type="button" title="Guardar un mensaje propio" aria-label="Agregar mensaje rápido">+</button>
              <button class="icon-btn chat-quick-btn" id="btn-quick-toggle" type="button" title="Ocultar los mensajes rápidos" aria-label="Ocultar mensajes rápidos">&#9662;</button>
            </div>
            <div class="chat-quick-list" id="chat-quick-list"></div>
          </div>
          <div class="chat-input-bar" id="chat-input" style="display:none;">
            <textarea class="form-control chat-textarea" id="msg-input" rows="1" maxlength="2000" placeholder="Escribe un mensaje..." autocomplete="off" autocapitalize="sentences"></textarea>
            <button class="btn btn-primary" id="btn-send">Enviar</button>
          </div>
        </div>
      </div>
    `;

    const $ = (sel) => container.querySelector(sel);
    const chatList = $('#chat-list');
    const chatMessages = $('#chat-messages');
    const chatInput = $('#chat-input');
    const msgInput = $('#msg-input');
    const chatTitle = $('#chat-title');
    const chatParticipants = $('#chat-participants');
    const btnBack = $('#btn-back-chat');
    const btnGeneral = $('#btn-general');
    const btnSoporte = $('#btn-soporte');
    const btnNewAnnouncement = $('#btn-new-announcement');
    const btnNewChat = $('#btn-new-chat');
    const btnSend = $('#btn-send');
    const btnExit = $('#btn-exit-modules');
    const btnExitHeader = $('#btn-exit-header');
    const btnClearChat = $('#btn-clear-chat');
    const chatMain = $('#chat-main');
    const chatBanner = $('#chat-banner');
    const chatConn = $('#chat-conn');
    const quickBox = $('#chat-quick');
    const quickList = $('#chat-quick-list');

    let currentChat = null;
    let chats = [];
    let announcements = [];
    let activeTab = 'chats';
    let socket = null;
    // Índice del primer mensaje no leído (para la línea de "Nuevos mensajes").
    let unreadDivider = -1;
    // Cola de mensajes que aún no se han podido entregar (sin conexión).
    const pendingQueue = [];
    let flushing = false;
    let chatsReloadTimer = null;
    let markReadTimer = null;

    if (isAdmin) btnNewAnnouncement.style.display = '';

    // -----------------------------------------------------------------------
    // Estado de conexión
    // -----------------------------------------------------------------------
    const setConnState = (state, text) => {
      if (!chatConn) return;
      chatConn.dataset.state = state;
      chatConn.textContent = text || '';
      chatConn.title = {
        online: 'Conectado: los mensajes llegan al instante',
        offline: 'Sin conexión: los mensajes se guardan y se envían al reconectar',
        connecting: 'Conectando…',
        idle: 'Conectado',
      }[state] || '';
    };

    const showBanner = (text) => {
      if (!chatBanner) return;
      if (!text) {
        chatBanner.hidden = true;
        chatBanner.textContent = '';
        return;
      }
      chatBanner.hidden = false;
      chatBanner.textContent = text;
    };

    // -----------------------------------------------------------------------
    // Socket
    // -----------------------------------------------------------------------
    function attachSocketListeners() {
      socket.on('connect', () => {
        console.log('[Chat] Socket conectado');
        setConnState('online', 'En línea');
        showBanner('');
        if (currentChat) socket.emit('join-chat', currentChat._id);
        // Al volver la conexión se manda lo que se quedó pendiente.
        flushQueue();
      });
      socket.on('disconnect', () => {
        console.log('[Chat] Socket desconectado');
        setConnState('offline', 'Sin conexión');
        showBanner('Sin conexión. Los mensajes que envíes se guardarán y saldrán al reconectar.');
      });
      socket.on('connect_error', () => {
        setConnState('connecting', 'Conectando…');
      });
      socket.on('reconnect_attempt', () => {
        setConnState('connecting', 'Conectando…');
      });

      const onMessage = (data) => {
        const msg = data && data.message;
        if (currentChat && data && String(data.chatId) === String(currentChat._id)) {
          if (msg) {
            // Si el mensaje trae clientId, corresponde a uno que YA se
            // pintó de forma optimista: se reemplaza en vez de duplicarlo.
            const idxByClient = data.clientId
              ? currentChat.messages.findIndex((m) => m && m.clientId === data.clientId)
              : -1;
            const idxById = msg._id
              ? currentChat.messages.findIndex((m) => m && m._id === msg._id)
              : -1;
            if (idxByClient >= 0) {
              currentChat.messages[idxByClient] = { ...msg, clientId: data.clientId };
              clearPendingWatch(data.clientId);
            } else if (idxById >= 0) {
              currentChat.messages[idxById] = msg;
            } else if (msg._id) {
              currentChat.messages.push(msg);
            }
          }
          renderMessages();
          markReadSoon(data.chatId);
        }
        // Sonido de mensaje recibido solo si es de otro usuario.
        if (msg && window.Sounds) {
          const senderId = msg.sender && typeof msg.sender === 'object' ? (msg.sender._id || msg.sender.id) : msg.sender;
          if (!senderId || String(senderId) !== String(userId)) {
            window.Sounds.receiveMessage().catch(() => {});
          }
        }
        // La lista se refresca con retardo: con 50+ usuarios, recargarla en
        // cada mensaje disparaba demasiadas peticiones al servidor.
        scheduleChatsReload();
      };
      socket.on('new-message', onMessage);
      socket.on('receive-message', onMessage);

      // Error al enviar: el mensaje se devuelve con su clientId para poder
      // marcarlo como fallido y ofrecer reenvío.
      socket.on('message-error', (data) => {
        const clientId = data && data.clientId;
        if (clientId) {
          const item = currentChat && currentChat.messages.find((m) => m && m.clientId === clientId);
          if (item) {
            item.pending = false;
            item.failed = true;
            renderMessages();
          }
          const qi = pendingQueue.findIndex((q) => q.clientId === clientId);
          if (qi >= 0) pendingQueue.splice(qi, 1);
        }
        UI.toast((data && data.message) || 'No se pudo enviar el mensaje', 'error');
      });

      // Solo se refresca la lista de avisos del tab; la alerta modal central
      // la gestiona el módulo global Realtime (js/realtime.js).
      socket.on('new-announcement', () => {
        loadAnnouncements();
      });

      // Alguien (p. ej. el admin) borró el historial del chat abierto.
      socket.on('chat-cleared', (data) => {
        const id = data && data.chatId;
        if (currentChat && String(currentChat._id) === String(id)) {
          currentChat.messages = [];
          unreadDivider = -1;
          renderMessages();
        }
        scheduleChatsReload();
      });
    }

    async function initSocket() {
      const token = localStorage.getItem('crm_token');
      if (!token || socket) return;

      // Se reutiliza el socket global (Realtime) cuando está disponible para
      // no mantener dos conexiones a la vez.
      if (window.Realtime && window.Realtime.connect) {
        try {
          socket = await window.Realtime.connect();
        } catch (error) {
          socket = null;
        }
      }
      if (!socket && window.io) {
        socket = io(window.AppConfig ? window.AppConfig.BASE_URL : window.location.origin, {
          auth: { token },
        });
      }
      if (socket) {
        attachSocketListeners();
        setConnState(socket.connected ? 'online' : 'connecting', socket.connected ? 'En línea' : 'Conectando…');
      } else {
        // Sin socket se sigue trabajando por REST (más lento, pero funcional).
        setConnState('offline', 'Sin conexión');
        showBanner('Conexión en vivo no disponible: los mensajes se envían por Internet.');
      }
    }

    function joinChat(chatId) {
      if (socket) socket.emit('join-chat', chatId);
    }
    function leaveChat(chatId) {
      if (socket) socket.emit('leave-chat', chatId);
    }

    // -----------------------------------------------------------------------
    // Lista de conversaciones
    // -----------------------------------------------------------------------
    // Marcar como leído con retardo: si llegan varios mensajes seguidos se
    // manda UNA sola petición en vez de una por mensaje.
    function markReadSoon(chatId) {
      if (!chatId) return;
      clearTimeout(markReadTimer);
      markReadTimer = setTimeout(() => {
        markReadTimer = null;
        if (API.chats && API.chats.markRead) API.chats.markRead(chatId).catch(() => {});
      }, 1200);
    }

    async function loadChats() {
      try {
        const result = await API.chats.list();
        const list = pickData(result);
        chats = Array.isArray(list) ? list : [];
        if (activeTab === 'chats') renderChatList();
      } catch (e) {
        chatList.innerHTML = '<p class="text-muted" style="padding:16px;">Error al cargar chats</p>';
      }
    }

    // Refresco con retardo de la lista: evita una petición al servidor por
    // cada mensaje que llega cuando hay mucho tráfico en el equipo.
    function scheduleChatsReload() {
      if (chatsReloadTimer) return;
      chatsReloadTimer = setTimeout(() => {
        chatsReloadTimer = null;
        loadChats();
      }, 5000);
    }

    async function loadAnnouncements() {
      try {
        const result = await API.announcements.list();
        const list = pickData(result);
        announcements = Array.isArray(list) ? list : [];
        if (activeTab === 'announcements') renderAnnouncements();
      } catch (e) {
        chatList.innerHTML = '<p class="text-muted" style="padding:16px;">Error al cargar avisos</p>';
      }
    }

    function renderChatList() {
      if (!chats.length) {
        chatList.innerHTML = '<p class="text-muted" style="padding:16px;">No hay conversaciones aún</p>';
        return;
      }
      chatList.innerHTML = chats.map(c => {
        const name = chatLabel(c);
        // El contador de no leídos lo calcula el servidor: antes se traía el
        // historial completo de cada conversación solo para contarlo.
        const unread = Number(c.unread || 0);
        const preview = c.lastMessage || 'Sin mensajes';
        const active = currentChat && String(currentChat._id) === String(c._id);
        return `<div class="chat-item${isGeneral(c) ? ' general-item' : ''}${active ? ' active' : ''}" data-id="${c._id}">
          <div class="chat-item-row">
            <span class="chat-item-name">${UI.escapeHtml(String(name))}</span>
            ${unread ? `<span class="unread-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
          </div>
          <div class="chat-item-preview">${UI.escapeHtml(String(preview))}</div>
          ${c.lastMessageAt ? `<div class="chat-item-time">${Format.dateTime(c.lastMessageAt)}</div>` : ''}
        </div>`;
      }).join('');

      chatList.querySelectorAll('.chat-item').forEach(el => {
        el.addEventListener('click', () => openChat(el.dataset.id));
      });
    }

    function renderAnnouncements() {
      if (!announcements.length) {
        chatList.innerHTML = '<p class="text-muted" style="padding:16px;">No hay avisos</p>';
        return;
      }
      chatList.innerHTML = announcements.map(a => {
        const isRead = (a.readBy || []).some(sameAsUser);
        const authorName = a.author && typeof a.author === 'object' ? (a.author.name || a.author.username) : (a.author || 'Admin');
        return `<div class="announcement-card ${a.priority || ''}" data-id="${a._id}">
          <div class="announcement-header">
            <span class="announcement-title">${UI.escapeHtml(a.title)}</span>
            <span class="announcement-priority ${a.priority || 'normal'}">${a.priority || 'normal'}</span>
          </div>
          <div class="announcement-body">${UI.escapeHtml(String(a.message || ''))}</div>
          <div class="announcement-meta">
            <span>${UI.escapeHtml(String(authorName))} · ${Format.dateTime(a.createdAt)}</span>
            ${!isRead ? '<span class="unread-badge chat-badge-inline">Nuevo</span>' : ''}
          </div>
          ${isAdmin ? `<div class="announcement-actions">
            <button class="btn btn-secondary btn-sm" data-del-ann="${a._id}">Eliminar</button>
          </div>` : ''}
        </div>`;
      }).join('');

      chatList.querySelectorAll('.announcement-card').forEach(el => {
        el.addEventListener('click', () => markAnnouncementRead(el.dataset.id));
      });

      chatList.querySelectorAll('[data-del-ann]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.delAnn;
          if (!window.confirm('¿Eliminar este aviso?')) return;
          try {
            await API.announcements.remove(id);
            announcements = announcements.filter(a => a._id !== id);
            renderAnnouncements();
            UI.toast('Aviso eliminado', 'success');
          } catch (err) {
            UI.toast('Error al eliminar', 'error');
          }
        });
      });
    }

    async function markAnnouncementRead(id) {
      if (!userId) return;
      try {
        await API.announcements.markRead(id);
        const ann = announcements.find(a => a._id === id);
        if (ann) {
          if (!ann.readBy) ann.readBy = [];
          if (!ann.readBy.some(sameAsUser)) ann.readBy.push({ _id: userId });
        }
      } catch (e) { /* ignore */ }
    }

    // -----------------------------------------------------------------------
    // Conversación
    // -----------------------------------------------------------------------
    async function openChat(chatId) {
      if (currentChat) leaveChat(currentChat._id);
      try {
        const result = await API.chats.get(chatId);
        currentChat = pickData(result);
        if (!currentChat || !currentChat._id) throw new Error('Chat no disponible');
        if (!Array.isArray(currentChat.messages)) currentChat.messages = [];
        chatTitle.textContent = chatLabel(currentChat);
        chatParticipants.textContent = (currentChat.participants || []).filter(Boolean).map(p => {
          const pName = typeof p === 'object' ? (p.name || p.username) : p;
          return pName || 'Usuario';
        }).join(', ');
        chatInput.style.display = 'flex';
        quickBox.style.display = 'flex';
        btnBack.style.display = 'inline-flex';
        // El borrado de historial de los canales del equipo (General/Soporte)
        // queda reservado a admin/gerencia; en los chats 1:1 cualquiera.
        if (btnClearChat) {
          const canClear = currentChat.type !== 'grupal' || isAdmin;
          btnClearChat.style.display = canClear ? 'inline-flex' : 'none';
        }
        chatMain.classList.add('active');
        // Línea divisoria de "Nuevos mensajes": se marca el primer mensaje que
        // el usuario todavía no había leído (antes de marcar todo como leído).
        unreadDivider = currentChat.messages.findIndex((m) => {
          const read = (m && m.readBy) || [];
          return !read.some(sameAsUser);
        });
        renderMessages();
        joinChat(chatId);
        await API.chats.markRead(chatId).catch(() => {});
        loadChats();
      } catch (e) {
        UI.toast('Error al abrir chat', 'error');
      }
    }

    // Convierte los enlaces del mensaje en anclas clicables (se escapa TODO el
    // texto primero y solo después se envuelven las URLs, por lo que no se
    // permite inyectar HTML desde un mensaje).
    function linkify(text) {
      const escaped = UI.escapeHtml(String(text || ''));
      return escaped.replace(/(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi, (raw) => {
        // La puntuación final ("frase." o "enlace),") no forma parte del enlace.
        const tail = raw.match(/[.,;:!?)\]}¿¡]+$/);
        const url = tail ? raw.slice(0, raw.length - tail[0].length) : raw;
        if (!url) return raw;
        const href = /^https?:/i.test(url) ? url : 'https://' + url;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>${tail ? tail[0] : ''}`;
      });
    }

    const isNearBottom = () => {
      if (!chatMessages) return true;
      return chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 120;
    };

    function renderMessages() {
      if (!currentChat || !currentChat.messages || !currentChat.messages.length) {
        chatMessages.innerHTML = '<div class="chat-empty">Sin mensajes</div>';
        return;
      }
      const nearBottom = isNearBottom();
      let lastDay = '';
      const html = currentChat.messages.map((m, i) => {
        const s = m.sender || {};
        const sRaw = s && typeof s === 'object' ? (s._id || s.id || null) : (s || null);
        const sId = sRaw ? String(sRaw) : '';
        const isMine = sId ? sameAsUser(sRaw) : true;
        // ¿Es un mensaje del Soporte Técnico? Puede venir identificado por el
        // rol del remitente (superadmin) o porque el chat es el canal de Soporte.
        const senderRole = s && s.role ? (s.role.code || s.role) : null;
        const supportMsg = senderRole === 'superadmin' || isSoporte(currentChat);
        const senderName = supportMsg ? 'Soporte Técnico'
          : ((s && (s.name || s.username)) || m.emisorNombre || 'Usuario');

        let sep = '';
        const stamp = m.createdAt ? new Date(m.createdAt) : null;
        const dayKey = stamp ? chatDayKey(stamp) : '';
        if (dayKey && dayKey !== lastDay) {
          lastDay = dayKey;
          sep = `<div class="chat-day"><span>${UI.escapeHtml(chatDayLabel(stamp))}</span></div>`;
        }
        const unreadSep = (unreadDivider === i)
          ? '<div class="chat-day chat-day-unread"><span>Nuevos mensajes</span></div>'
          : '';

        const state = m.failed ? ' msg-failed' : (m.pending ? ' msg-pending' : '');
        const extra = (!isMine && supportMsg) ? ' msg-support' : '';
        const retry = m.failed
          ? `<button class="msg-retry" type="button" data-retry="${UI.escapeHtml(m.clientId || '')}">Reintentar</button>`
          : '';
        const status = m.pending
          ? '<span class="msg-state">Enviando…</span>'
          : (m.failed ? '<span class="msg-state">No se envió</span>' : '');

        return `${sep}${unreadSep}<div class="msg-bubble ${isMine ? 'msg-sent' : 'msg-received'}${extra}${state}"${m.clientId ? ` data-client="${UI.escapeHtml(m.clientId)}"` : ''}>
          ${!isMine ? `<div class="msg-sender">${supportMsg ? '&#128736;&#65039; ' : ''}${UI.escapeHtml(senderName)}</div>` : ''}
          <div>${linkify(m.message)}</div>
          <div class="msg-time">${Format.time(m.createdAt)}${status}${retry}</div>
        </div>`;
      }).join('');

      chatMessages.innerHTML = html;
      chatMessages.querySelectorAll('[data-retry]').forEach(btn => {
        btn.addEventListener('click', () => retryMessage(btn.dataset.retry));
      });
      if (nearBottom || unreadDivider === 0) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    }

    // -----------------------------------------------------------------------
    // Envío de mensajes (con cola y aviso optimista)
    // -----------------------------------------------------------------------
    const newClientId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    async function sendMessage(textOverride) {
      const text = String(textOverride != null ? textOverride : msgInput.value).trim();
      if (!text || !currentChat) return;
      if (text.length > 2000) {
        UI.toast('El mensaje es demasiado largo (máximo 2000 caracteres)', 'warning');
        return;
      }
      const clientId = newClientId();
      const item = {
        clientId,
        chatId: String(currentChat._id),
        text,
      };
      // Se pinta de inmediato (mensaje "optimista"): el asesor no espera a la
      // red para ver lo que escribió.
      currentChat.messages.push({
        _id: 'tmp-' + clientId,
        clientId,
        message: text,
        createdAt: new Date().toISOString(),
        sender: { _id: userId, name: myName, role: user.role || null },
        emisorNombre: myName,
        pending: true,
      });
      msgInput.value = '';
      autoGrow();
      renderMessages();
      pendingQueue.push(item);
      flushQueue();
      if (window.Sounds) window.Sounds.sendMessage().catch(() => {});
    }

    // Envía lo que esté en la cola. Si no hay conexión, los mensajes quedan en
    // la cola y se reintentan al reconectar.
    async function flushQueue() {
      if (flushing || !pendingQueue.length) return;
      flushing = true;
      try {
        while (pendingQueue.length) {
          const item = pendingQueue[0];
          // eslint-disable-next-line no-await-in-loop
          const done = await deliver(item);
          if (!done) break;
          pendingQueue.shift();
        }
      } finally {
        flushing = false;
      }
    }

    async function deliver(item) {
      if (socket && socket.connected) {
        socket.emit('send-message', { chatId: item.chatId, message: item.text, clientId: item.clientId });
        // Si el eco no llega (se cayó la red), el mensaje se marca como fallido.
        watchPending(item.clientId);
        return true;
      }
      try {
        const res = await API.chats.sendMessage(item.chatId, { message: item.text, clientId: item.clientId });
        const data = pickData(res);
        clearPendingWatch(item.clientId);
        if (data && currentChat) {
          const idx = currentChat.messages.findIndex((m) => m && m.clientId === item.clientId);
          if (idx >= 0) currentChat.messages[idx] = { ...data, clientId: item.clientId };
          renderMessages();
        }
        return true;
      } catch (e) {
        // Error del servidor (4xx): el mensaje está mal, no vale la pena reintentar.
        const status = e && (e.status || e.statusCode);
        if (status && status >= 400 && status < 500) {
          markFailed(item.clientId, (e && e.message) || 'No se pudo enviar');
          UI.toast((e && e.message) || 'No se pudo enviar el mensaje', 'error');
          return true;
        }
        // Error de red: se deja en la cola para reintentar.
        return false;
      }
    }

    function markFailed(clientId, reason) {
      if (!currentChat || !clientId) return;
      const item = currentChat.messages.find((m) => m && m.clientId === clientId);
      if (item) {
        item.pending = false;
        item.failed = true;
        item.error = reason || '';
      }
      renderMessages();
    }

    // Si el servidor nunca confirma el mensaje (se cayó la conexión justo al
    // enviarlo), se marca como fallido para que el asesor pueda reenviarlo.
    const pendingWatch = new Map();
    function watchPending(clientId) {
      clearTimeout(pendingWatch.get(clientId));
      pendingWatch.set(clientId, setTimeout(() => {
        pendingWatch.delete(clientId);
        if (!currentChat) return;
        const item = currentChat.messages.find((m) => m && m.clientId === clientId);
        if (item && item.pending) markFailed(clientId, 'Sin confirmación del servidor');
      }, 10000));
    }
    function clearPendingWatch(clientId) {
      clearTimeout(pendingWatch.get(clientId));
      pendingWatch.delete(clientId);
    }

    function retryMessage(clientId) {
      if (!clientId) return;
      const item = currentChat && currentChat.messages.find((m) => m && m.clientId === clientId);
      if (!item) return;
      item.pending = true;
      item.failed = false;
      renderMessages();
      const queueItem = { clientId, chatId: String(currentChat._id), text: item.message };
      pendingQueue.push(queueItem);
      flushQueue();
    }

    // -----------------------------------------------------------------------
    // Mensajes rápidos
    // -----------------------------------------------------------------------
    function renderQuickMessages() {
      const custom = chatQuickCustom();
      const all = CHAT_QUICK_DEFAULT.concat(custom);
      quickList.innerHTML = all.map((m, i) => {
        const isCustom = i >= CHAT_QUICK_DEFAULT.length;
        return `<span class="chat-quick-chip${isCustom ? ' is-custom' : ''}">
          <button class="chat-quick-text" type="button" data-quick="${i}" title="Poner este mensaje en el recuadro">${UI.escapeHtml(m)}</button>
          ${isCustom ? `<button class="chat-quick-del" type="button" data-quick-del="${i}" title="Quitar este mensaje" aria-label="Quitar mensaje">&times;</button>` : ''}
        </span>`;
      }).join('');

      quickList.querySelectorAll('[data-quick]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.quick);
          const all2 = CHAT_QUICK_DEFAULT.concat(chatQuickCustom());
          const text = all2[idx];
          if (!text) return;
          msgInput.value = text;
          autoGrow();
          msgInput.focus();
          msgInput.setSelectionRange(text.length, text.length);
        });
      });
      quickList.querySelectorAll('[data-quick-del]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.quickDel);
          const custom = chatQuickCustom();
          const realIdx = idx - CHAT_QUICK_DEFAULT.length;
          if (realIdx < 0) return;
          custom.splice(realIdx, 1);
          chatQuickSave(custom);
          renderQuickMessages();
        });
      });
    }

    function addQuickMessage() {
      const modal = UI.openModal({
        title: 'Guardar un mensaje rápido',
        body: `
          <form id="quick-form">
            <div class="form-field">
              <label class="form-label" for="quick-text">Mensaje</label>
              <input class="form-control" id="quick-text" maxlength="120" placeholder="Ej. Buenos días, ¿a qué hora es la visita?" required>
              <small class="text-muted">Quedará guardado solo en este navegador y estará disponible para ti.</small>
            </div>
            <button class="btn btn-primary btn-block" type="submit">Guardar</button>
          </form>
        `,
        size: 420,
      });
      const form = modal.bodyEl.querySelector('#quick-form');
      const input = modal.bodyEl.querySelector('#quick-text');
      if (input) setTimeout(() => input.focus(), 50);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = String(input.value || '').trim();
        if (!text) return;
        const custom = chatQuickCustom();
        if (!custom.some((m) => m.toLowerCase() === text.toLowerCase())) custom.unshift(text);
        chatQuickSave(custom);
        UI.closeModal();
        renderQuickMessages();
        UI.toast('Mensaje guardado', 'success');
      });
    }

    // -----------------------------------------------------------------------
    // Recuadro de escritura
    // -----------------------------------------------------------------------
    const autoGrow = () => {
      if (!msgInput) return;
      msgInput.style.height = 'auto';
      msgInput.style.height = Math.min(msgInput.scrollHeight, 140) + 'px';
    };

    msgInput.addEventListener('input', autoGrow);
    msgInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      // En el móvil Enter hace salto de línea (el botón "Enviar" manda);
      // en el escritorio Enter envía y Shift+Enter hace salto de línea.
      if (isTouch() || e.shiftKey) return;
      e.preventDefault();
      sendMessage();
    });
    btnSend.addEventListener('click', () => sendMessage());

    // -----------------------------------------------------------------------
    // Botones de la barra lateral
    // -----------------------------------------------------------------------
    async function openNamedChat(fn, errorText) {
      try {
        const result = await fn();
        const chat = pickData(result);
        if (!chat || !chat._id) throw new Error('Canal no disponible');
        openChat(chat._id);
      } catch (e) {
        UI.toast(errorText, 'error');
      }
    }

    // Abrir el canal general del equipo.
    btnGeneral.addEventListener('click', () => openNamedChat(() => API.chats.general(), 'No se pudo abrir el canal general'));
    // Abrir el canal dedicado de Soporte Técnico (comunicación con Soporte).
    btnSoporte.addEventListener('click', () => openNamedChat(() => API.chats.soporte(), 'No se pudo abrir el canal de Soporte'));

    // Cierra la conversación abierta y regresa a la lista de chats.
    // En móvil la lista ocupa toda la pantalla y ahí vuelve a estar el menú
    // superior, así que siempre hay por dónde salir.
    function closeConversation() {
      if (currentChat) leaveChat(currentChat._id);
      currentChat = null;
      unreadDivider = -1;
      if (btnClearChat) btnClearChat.style.display = 'none';
      chatMain.classList.remove('active');
      renderChatList();
    }

    // Sale del módulo de chat: primero cierra la conversación (si hay) y luego
    // regresa al módulo desde el que se entró; sin módulo de origen, al inicio.
    function exitToModules() {
      closeConversation();
      // Embebido en el panel flotante: no se navega fuera del módulo actual.
      if (isEmbed) return;
      let referrer = null;
      try {
        referrer = document.referrer ? new URL(document.referrer) : null;
      } catch (error) {
        referrer = null;
      }
      const fromAnotherModule = referrer
        && referrer.origin === window.location.origin
        && referrer.pathname !== window.location.pathname;
      if (fromAnotherModule && window.history.length > 1) window.history.back();
      else window.location.href = 'home.html';
    }

    btnBack.addEventListener('click', closeConversation);
    if (btnExit) btnExit.addEventListener('click', exitToModules);
    if (btnExitHeader) btnExitHeader.addEventListener('click', exitToModules);

    // Borra el historial de la conversación abierta (con confirmación).
    if (btnClearChat) btnClearChat.addEventListener('click', async () => {
      if (!currentChat) return;
      const ok = window.confirm('¿Borrar todo el historial de esta conversación? Esta acción no se puede deshacer.');
      if (!ok) return;
      btnClearChat.disabled = true;
      try {
        await API.chats.clearMessages(currentChat._id);
        currentChat.messages = [];
        unreadDivider = -1;
        renderMessages();
        UI.toast('Historial borrado', 'success');
      } catch (e) {
        UI.toast(e.message || 'No se pudo borrar el historial', 'error');
      }
      btnClearChat.disabled = false;
    });

    // Tecla Escape (PC): cierra la conversación. No actúa con modales abiertos
    // para no pisar el cierre de confirmaciones y formularios.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (document.getElementById('modal-overlay')) return;
      if (currentChat) closeConversation();
    });

    const tabEls = Array.from(container.querySelectorAll('.chat-sidebar-tab'));
    tabEls.forEach(tab => {
      tab.addEventListener('click', () => {
        tabEls.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeTab = tab.dataset.tab;
        if (activeTab === 'chats') {
          renderChatList();
        } else {
          loadAnnouncements();
        }
      });
    });

    btnNewChat.addEventListener('click', async () => {
      let users = [];
      try {
        const res = await API.users.list({ limit: 100 });
        const list = pickData(res);
        users = Array.isArray(list) ? list : [];
      } catch (e) {
        users = [];
      }
      // Quién puede iniciar un chat 1:1: todos pueden con todos (menos ellos mismos).
      const others = users.filter(u =>
        u && u.role && ['admin', 'gerencia', 'asesor', 'superadmin'].includes(u.role.code || u.role) &&
        String(u._id || u.id) !== String(userId)
      );
      const modal = UI.openModal({
        title: 'Nuevo chat 1:1',
        body: `
          <div style="display:flex;flex-direction:column;gap:12px;">
            <p class="text-muted">Selecciona un compañero para conversar:</p>
            ${others.length
              ? others.map(u => `<button class="btn btn-secondary btn-block chat-user-btn" data-user="${u._id}">${UI.escapeHtml(u.name)} · ${UI.escapeHtml(u.role && (u.role.name || u.role.code || ''))}</button>`).join('')
              : '<p class="text-muted">No hay otros usuarios disponibles.</p>'}
          </div>
        `,
        size: 420,
      });
      modal.bodyEl.querySelectorAll('.chat-user-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          UI.closeModal();
          try {
            const res = await API.chats.create({ type: 'individual', participantId: btn.dataset.user });
            const chat = pickData(res);
            if (!chat || !chat._id) throw new Error('No se pudo crear el chat');
            openChat(chat._id);
          } catch (e) {
            UI.toast(e.message || 'No se pudo crear el chat', 'error');
          }
        });
      });
    });

    btnNewAnnouncement.addEventListener('click', () => {
      UI.openModal({
        title: 'Crear aviso',
        body: `
          <form id="announcement-form" style="display:flex;flex-direction:column;gap:12px;">
            <div>
              <label class="form-label">Título</label>
              <input class="form-control" id="ann-title" placeholder="Título del aviso" required maxlength="200">
            </div>
            <div>
              <label class="form-label">Mensaje</label>
              <textarea class="form-control" id="ann-message" rows="4" placeholder="Escribe el aviso..." required maxlength="2000"></textarea>
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
        size: 450,
      });
      document.getElementById('announcement-form').addEventListener('submit', async (e) => {
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
    });

    // Botón de "agregar mensaje rápido" y plegado de la tira.
    const btnQuickAdd = $('#btn-quick-add');
    const btnQuickToggle = $('#btn-quick-toggle');
    if (btnQuickAdd) btnQuickAdd.addEventListener('click', addQuickMessage);
    if (btnQuickToggle) {
      btnQuickToggle.addEventListener('click', () => {
        const hidden = quickList.classList.toggle('is-hidden');
        btnQuickToggle.innerHTML = hidden ? '&#9652;' : '&#9662;';
        btnQuickToggle.title = hidden ? 'Mostrar los mensajes rápidos' : 'Ocultar los mensajes rápidos';
      });
    }

    // El recuadro se behave distinto en móvil (Enter = salto de línea) y en
    // escritorio (Enter = enviar).
    msgInput.setAttribute('enterkeyhint', isTouch() ? 'enter' : 'send');

    renderQuickMessages();
    initSocket();
    loadChats();

    // En PC se abre el canal general para que el chat arranque "listo".
    // En móvil NO: se prefiere mostrar la lista de chats con el menú superior
    // visible, para que entrar al chat nunca deje sin salida al usuario.
    if (!window.matchMedia('(max-width: 768px)').matches) {
      API.chats.general()
        .then((result) => {
          const gen = pickData(result);
          if (gen && gen._id) openChat(gen._id);
        })
        .catch(() => { /* el canal general se abre bajo demanda */ });
    }

    // Al volver a la app (el móvil la suspende en segundo plano) se reintenta
    // la cola y se refresca la lista: así no se pierden mensajes.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (socket && !socket.connected && socket.connect) socket.connect();
      flushQueue();
      scheduleChatsReload();
    });
  },
};
