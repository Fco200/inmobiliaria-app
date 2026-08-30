'use strict';

window.Pages = window.Pages || {};

window.Pages.chat = {
  title: 'Chat',

  async render(container) {
    // El layout se inyecta ANTES de consultar los elementos para evitar
    // errores "cannot read properties of null". Todas las consultas se
    // acotan al contenedor de esta página (no a document global).
    container.innerHTML = `
      <div class="chat-wrap">
        <div class="chat-sidebar" id="chat-sidebar">
          <div class="chat-sidebar-head">
            <button class="btn btn-primary" id="btn-general">&#128172; Canal general</button>
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
            <button class="icon-btn" id="btn-back-chat" type="button" style="display:none;">&#8592;</button>
            <div>
              <div id="chat-title" style="font-weight:600;">Selecciona un chat</div>
              <div id="chat-participants" style="font-size:12px;color:var(--text-muted);"></div>
            </div>
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
    const btnNewAnnouncement = $('#btn-new-announcement');
    const btnNewChat = $('#btn-new-chat');
    const btnSend = $('#btn-send');
    const chatMain = $('#chat-main');
    let currentChat = null;
    let chats = [];
    let announcements = [];
    let activeTab = 'chats';
    let socket = null;

    const user = ApiClient.getStoredUser();
    const isAdmin = user && user.role && ['admin', 'gerencia'].includes(user.role.code || user.role);

    if (isAdmin) btnNewAnnouncement.style.display = '';

    function attachSocketListeners() {
      socket.on('connect', () => console.log('[Chat] Socket conectado'));
      socket.on('disconnect', () => console.log('[Chat] Socket desconectado'));

      socket.on('new-message', (data) => {
        const msg = data && data.message;
        if (currentChat && data && data.chatId === currentChat._id) {
          if (msg && !currentChat.messages.some((m) => m._id === msg._id)) {
            currentChat.messages.push(msg);
          }
          renderMessages();
          API.chats.markRead(data.chatId).catch(() => {});
        }
        loadChats();
      });

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
        chats = result.data || [];
        if (activeTab === 'chats') renderChatList();
      } catch (e) {
        chatList.innerHTML = '<p class="text-muted" style="padding:16px;">Error al cargar chats</p>';
      }
    }

    async function loadAnnouncements() {
      try {
        const result = await API.announcements.list();
        announcements = result.data || [];
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
      const userId = user && user._id;
      chatList.innerHTML = chats.map(c => {
        const isGeneral = c.type === 'grupal' && (c.name === 'general' || (c.name || '').toLowerCase().startsWith('general'));
        const name = isGeneral
          ? 'Canal general'
          : (c.type === 'grupal'
              ? (c.name || 'Chat de equipo')
              : ((c.participants || []).find(p => String(p._id || p) !== String(userId)) || {}).name || 'Chat');
        const msgs = c.messages || [];
        const unread = msgs.filter(m => !(m.readBy || []).includes(userId)).length;
        const preview = c.lastMessage || 'Sin mensajes';
        return `<div class="chat-item${isGeneral ? ' general-item' : ''}" data-id="${c._id}">
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
        const isRead = a.readBy && a.readBy.some(r => (r._id || r) === user?._id);
        return `<div class="announcement-card ${a.priority || ''}" data-id="${a._id}">
          <div class="announcement-header">
            <span class="announcement-title">${UI.escapeHtml(a.title)}</span>
            <span class="announcement-priority ${a.priority || 'normal'}">${a.priority || 'normal'}</span>
          </div>
          <div class="announcement-body">${UI.escapeHtml(a.message)}</div>
          <div class="announcement-meta">
            <span>${a.author ? UI.escapeHtml(a.author.name) : 'Admin'} · ${Format.dateTime(a.createdAt)}</span>
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
      try {
        await API.announcements.markRead(id);
        const ann = announcements.find(a => a._id === id);
        if (ann && user) {
          if (!ann.readBy) ann.readBy = [];
          ann.readBy.push({ _id: user._id });
        }
      } catch (e) { /* ignore */ }
    }

    async function openChat(chatId) {
      if (currentChat) leaveChat(currentChat._id);
      try {
        const result = await API.chats.get(chatId);
        currentChat = result.data;
        const userId = user && user._id;
        const isGeneral = currentChat.type === 'grupal' && (currentChat.name === 'general' || (currentChat.name || '').toLowerCase().startsWith('general'));
        chatTitle.textContent = isGeneral
          ? 'Canal general'
          : (currentChat.type === 'grupal'
              ? (currentChat.name || 'Chat de equipo')
              : ((currentChat.participants || []).find(p => String(p._id || p) !== String(userId)) || {}).name || 'Chat');
        chatParticipants.textContent = (currentChat.participants || []).map(p => p.name || 'Usuario').join(', ');
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

    function renderMessages() {
      if (!currentChat || !currentChat.messages || !currentChat.messages.length) {
        chatMessages.innerHTML = '<div class="chat-empty">Sin mensajes</div>';
        return;
      }
      const userId = user && user._id;
      chatMessages.innerHTML = currentChat.messages.map(m => {
        const s = m.sender || {};
        const sId = String(s._id || m.sender || '');
        const isMine = sId ? sId === String(userId) : true;
        const senderName = s.name || s.username || 'Usuario';
        return `<div class="msg-bubble ${isMine ? 'msg-sent' : 'msg-received'}">
          ${!isMine ? `<div class="msg-sender">${UI.escapeHtml(senderName)}</div>` : ''}
          <div>${UI.escapeHtml(String(m.message || ''))}</div>
          <div class="msg-time">${Format.time(m.createdAt)}</div>
        </div>`;
      }).join('');
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function sendMessage() {
      const text = msgInput.value.trim();
      if (!text || !currentChat) return;
      try {
        await API.chats.sendMessage(currentChat._id, { message: text });
        msgInput.value = '';
      } catch (e) {
        UI.toast('Error al enviar mensaje', 'error');
      }
    }

    // Abrir el canal general del equipo.
    btnGeneral.addEventListener('click', async () => {
      try {
        const result = await API.chats.general();
        const chat = result.data;
        openChat(chat._id);
      } catch (e) {
        UI.toast('No se pudo abrir el canal general', 'error');
      }
    });

    btnSend.addEventListener('click', sendMessage);
    msgInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

    btnBack.addEventListener('click', () => {
      if (currentChat) leaveChat(currentChat._id);
      chatMain.classList.remove('active');
      currentChat = null;
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
        users = (res && res.data) || [];
      } catch (e) {
        users = [];
      }
      // Quién puede iniciar un chat 1:1: todos pueden con todos (menos ellos mismos).
      const others = users.filter(u =>
        u.role && ['admin', 'gerencia', 'asesor'].includes(u.role.code || u.role) &&
        String(u._id) !== String(user && user._id)
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
            const chat = res.data;
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

    // Abrir el canal general de forma predeterminada para que el chat se
    // sienta "listo" al entrar (grupal visible para todo el equipo).
    try {
      const gen = await API.chats.general();
      if (gen && gen.data) openChat(gen.data._id);
    } catch (e) {
      /* el canal general se abre bajo demanda */
    }
  },
};