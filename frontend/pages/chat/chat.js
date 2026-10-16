'use strict';

window.Pages = window.Pages || {};

window.Pages.chat = {
  title: 'Chat',

  async render(container) {
    document.body.classList.add('page-chat');
    const isEmbed = /[?&]embed=1\b/.test(window.location.search);
    if (isEmbed) document.body.classList.add('is-embed');

    // En móvil el teclado del sistema redimensiona el "visual viewport" sin
    // cambiar 100vh. Se publican dos variables (alto y desplazamiento reales)
    // para que la conversación abierta quede siempre encima del teclado y la
    // barra de escritura no se pierda detrás de él.
    (function bindChatViewport() {
      const vv = window.visualViewport;
      const apply = () => {
        const h = vv ? vv.height : window.innerHeight;
        const top = vv ? vv.offsetTop : 0;
        document.documentElement.style.setProperty('--chat-vh', Math.round(h) + 'px');
        document.documentElement.style.setProperty('--chat-top', Math.round(top) + 'px');
      };
      apply();
      if (vv) {
        vv.addEventListener('resize', apply);
        vv.addEventListener('scroll', apply);
      }
      window.addEventListener('resize', apply);
      window.addEventListener('orientationchange', () => setTimeout(apply, 250));
    })();

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
              <div id="chat-title" style="font-weight:600;">Selecciona un chat</div>
              <div id="chat-participants" style="font-size:12px;color:var(--text-muted);"></div>
            </div>
            <button class="icon-btn" id="btn-exit-header" type="button" title="Cambiar de módulo" aria-label="Cambiar de módulo">&#9776;</button>
          </div>
          <div class="chat-messages" id="chat-messages">
            <div class="chat-empty">Selecciona una conversación para comenzar</div>
          </div>
          <div class="chat-input-bar" id="chat-input" style="display:none;">
            <input class="form-control" id="msg-input" placeholder="Escribe un mensaje..." autocomplete="off">
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
    const chatMain = $('#chat-main');
    let currentChat = null;
    let chats = [];
    let announcements = [];
    let activeTab = 'chats';
    let socket = null;

    if (isAdmin) btnNewAnnouncement.style.display = '';

    function attachSocketListeners() {
      socket.on('connect', () => {
        console.log('[Chat] Socket conectado');
        if (currentChat) socket.emit('join-chat', currentChat._id);
      });
      socket.on('disconnect', () => console.log('[Chat] Socket desconectado'));

      const onMessage = (data) => {
        const msg = data && data.message;
        if (currentChat && data && data.chatId === currentChat._id) {
          if (msg && msg._id && !currentChat.messages.some((m) => m && m._id === msg._id)) {
            currentChat.messages.push(msg);
          }
          renderMessages();
          if (window.API && API.chats.markRead) API.chats.markRead(data.chatId).catch(() => {});
        }
        // Sonido de mensaje recibido solo si es de otro usuario.
        if (msg && window.Sounds) {
          const senderId = msg.sender && typeof msg.sender === 'object' ? (msg.sender._id || msg.sender.id) : msg.sender;
          if (!senderId || String(senderId) !== String(userId)) {
            window.Sounds.receiveMessage().catch(() => {});
          }
        }
        loadChats();
      };
      socket.on('new-message', onMessage);
      socket.on('receive-message', onMessage);

      // Solo se refresca la lista de avisos del tab; la alerta modal central
      // la gestiona el módulo global Realtime (js/realtime.js).
      socket.on('new-announcement', () => {
        loadAnnouncements();
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
      if (socket) attachSocketListeners();
    }

    function joinChat(chatId) {
      if (socket) socket.emit('join-chat', chatId);
    }
    function leaveChat(chatId) {
      if (socket) socket.emit('leave-chat', chatId);
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
        const msgs = c.messages || [];
        const unread = msgs.filter(m => !(m.readBy || []).some(sameAsUser)).length;
        const preview = c.lastMessage || 'Sin mensajes';
        return `<div class="chat-item${isGeneral(c) ? ' general-item' : ''}" data-id="${c._id}">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="chat-item-name">${UI.escapeHtml(String(name))}</span>
            ${unread ? `<span class="unread-badge">${unread}</span>` : ''}
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
            ${!isRead ? '<span class="unread-badge" style="min-width:auto;height:auto;padding:2px 6px;border-radius:8px;">Nuevo</span>' : ''}
          </div>
          ${isAdmin ? `<div class="announcement-actions">
            <button class="btn btn-secondary btn-sm" data-del-ann="${a._id}" style="font-size:11px;padding:3px 8px;">Eliminar</button>
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

    async function openChat(chatId) {
      if (currentChat) leaveChat(currentChat._id);
      try {
        const result = await API.chats.get(chatId);
        currentChat = pickData(result);
        if (!currentChat || !currentChat._id) throw new Error('Chat no disponible');
        chatTitle.textContent = chatLabel(currentChat);
        chatParticipants.textContent = (currentChat.participants || []).filter(Boolean).map(p => {
          const pName = typeof p === 'object' ? (p.name || p.username) : p;
          return pName || 'Usuario';
        }).join(', ');
        chatInput.style.display = 'flex';
        btnBack.style.display = 'inline-flex';
        chatMain.classList.add('active');
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

    function renderMessages() {
      if (!currentChat || !currentChat.messages || !currentChat.messages.length) {
        chatMessages.innerHTML = '<div class="chat-empty">Sin mensajes</div>';
        return;
      }
      chatMessages.innerHTML = currentChat.messages.map(m => {
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
        const extra = (!isMine && supportMsg) ? ' msg-support' : '';
        return `<div class="msg-bubble ${isMine ? 'msg-sent' : 'msg-received'}${extra}">
          ${!isMine ? `<div class="msg-sender">${supportMsg ? '&#128736;&#65039; ' : ''}${UI.escapeHtml(senderName)}</div>` : ''}
          <div>${linkify(m.message)}</div>
          <div class="msg-time">${Format.time(m.createdAt)}</div>
        </div>`;
      }).join('');
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function sendMessage() {
      const text = msgInput.value.trim();
      if (!text || !currentChat) return;
      const payload = { chatId: currentChat._id, message: text };
      try {
        if (socket && socket.connected) {
          // El servidor hace echo al emisor (está en la sala chat:ID) y también
          // emite a receive-message/new-message; los deduplicates por _id.
          socket.emit('send-message', payload);
        } else if (window.API && API.chats.sendMessage) {
          await API.chats.sendMessage(currentChat._id, { message: text });
        }
        msgInput.value = '';
        if (window.Sounds) window.Sounds.sendMessage().catch(() => {});
      } catch (e) {
        UI.toast('Error al enviar mensaje', 'error');
      }
    }

    // Abrir el canal general del equipo.
    btnGeneral.addEventListener('click', async () => {
      try {
        const result = await API.chats.general();
        const chat = pickData(result);
        if (!chat || !chat._id) throw new Error('Canal no disponible');
        openChat(chat._id);
      } catch (e) {
        UI.toast('No se pudo abrir el canal general', 'error');
      }
    });

    // Abrir el canal dedicado de Soporte Técnico (comunicación con Soporte).
    btnSoporte.addEventListener('click', async () => {
      try {
        const result = await API.chats.soporte();
        const chat = pickData(result);
        if (!chat || !chat._id) throw new Error('Canal no disponible');
        openChat(chat._id);
      } catch (e) {
        UI.toast('No se pudo abrir el canal de Soporte', 'error');
      }
    });

    btnSend.addEventListener('click', sendMessage);
    msgInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

    // Cierra la conversación abierta y regresa a la lista de chats.
    // En móvil la lista ocupa toda la pantalla y ahí vuelve a estar el menú
    // superior, así que siempre hay por dónde salir.
    function closeConversation() {
      if (currentChat) leaveChat(currentChat._id);
      currentChat = null;
      chatMain.classList.remove('active');
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
  },
};