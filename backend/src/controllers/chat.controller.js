'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const { Chat, User, Role } = require('../models');

// Códigos de rol que participan en el canal grupal general.
const TEAM_ROLES = ['admin', 'gerencia', 'asesor', 'superadmin'];

// Nombre del canal grupal accesible para todo el equipo.
const GENERAL_NAME = 'general';

// Nombre del canal grupal dedicado a la comunicación directa con Soporte Técnico.
const SOPORTE_NAME = 'soporte';

// Códigos de rol del equipo que participan en el canal de Soporte (emisores).
const SUPPORT_TEAM_ROLES = ['admin', 'gerencia', 'asesor'];

// Códigos de rol del Soporte Técnico (superadmin), exento de mantenimiento.
const SUPPORT_ROLE = 'superadmin';

/**
 * Devuelve (creándolo si hace falta) el chat grupal general en el que
 * participa todo el equipo. Se invoca al arrancar y bajo demanda.
 */
async function getOrCreateGeneralChat() {
  let chat = await Chat.findOne({ type: 'grupal', name: GENERAL_NAME });
  if (chat) {
    // Mantener sincronizados los participantes con el equipo actual.
    const roles = await Role.find({ code: { $in: TEAM_ROLES } });
    const roleIds = roles.map((r) => r._id);
    const team = await User.find({
      role: { $in: roleIds },
      status: 'activo',
    }).select('_id');
    const teamIds = team.map((u) => u._id);
    const missing = teamIds.filter((id) => !chat.participants.some((p) => p.toString() === id.toString()));
    if (missing.length) {
      chat.participants.push(...missing);
      await chat.save();
    }
    return chat;
  }

  const roles = await Role.find({ code: { $in: TEAM_ROLES } });
  const roleIds = roles.map((r) => r._id);
  const team = await User.find({ role: { $in: roleIds }, status: 'activo' }).select('_id');
  chat = await Chat.create({
    name: GENERAL_NAME,
    type: 'grupal',
    participants: team.map((u) => u._id),
  });
  return chat;
}

/**
 * Devuelve (creándolo si hace falta) el canal grupal dedicado a Soporte
 * Técnico, en el que participan todos los asesores/administradores y el
 * usuario de Soporte (SUPERADMIN). Los asesores escriben ahí para recibir
 * atención directa del Soporte.
 */
async function getOrCreateSupportChat() {
  let chat = await Chat.findOne({ type: 'grupal', name: SOPORTE_NAME });
  if (chat) {
    // Mantener sincronizados los participantes con el equipo y el soporte actual.
    const roles = await Role.find({ code: { $in: [...SUPPORT_TEAM_ROLES, SUPPORT_ROLE] } });
    const roleIds = roles.map((r) => r._id);
    const team = await User.find({ role: { $in: roleIds }, status: 'activo' }).select('_id');
    const teamIds = team.map((u) => u._id);
    const missing = teamIds.filter((id) => !chat.participants.some((p) => p && p.toString() === id.toString()));
    if (missing.length) {
      chat.participants.push(...missing);
      await chat.save();
    }
    return chat;
  }

  const roles = await Role.find({ code: { $in: [...SUPPORT_TEAM_ROLES, SUPPORT_ROLE] } });
  const roleIds = roles.map((r) => r._id);
  const team = await User.find({ role: { $in: roleIds }, status: 'activo' }).select('_id');
  chat = await Chat.create({
    name: SOPORTE_NAME,
    type: 'grupal',
    participants: team.map((u) => u._id),
  });
  return chat;
}

// Listar chats del usuario (los grupales cierran sesión de participantes y se
// devuelven aunque el usuario haya sido agregado después de la creación).
const listChats = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const chats = await Chat.find({
    $or: [{ participants: userId }, { type: 'grupal' }],
  })
    .populate('participants', 'name username role')
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .limit(50);

  res.json({ success: true, data: chats });
});

// Devuelve (creándolo) el canal grupal general para el equipo.
const general = asyncHandler(async (req, res) => {
  const chat = await getOrCreateGeneralChat();
  const populated = await chat.populate('participants', 'name username role');
  res.json({ success: true, data: populated });
});

// Devuelve (creándolo) el canal grupal dedicado a Soporte Técnico.
const supportChat = asyncHandler(async (req, res) => {
  const chat = await getOrCreateSupportChat();
  const populated = await chat.populate('participants', 'name username role');
  res.json({ success: true, data: populated });
});

// Obtener chat por ID con mensajes
const getChat = asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.params.id)
    .populate('participants', 'name username role')
    .populate('messages.sender', 'name username role');

  if (!chat) {
    return res.status(404).json({ success: false, message: 'Chat no encontrado' });
  }

  // Verificar que el usuario sea participante (los participantes pueden venir
  // como null si el usuario referido fue eliminado).
  if (!chat.participants.some(p => p && p._id && p._id.toString() === req.user._id.toString())) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este chat' });
  }

  // En producción no conviene mandar historiales gigantes: se devuelven solo
  // los últimos 200 mensajes.
  const data = chat.toObject();
  data.messages = (data.messages || []).slice(-200);

  res.json({ success: true, data });
});

// Crear chat individual o grupal
const createChat = asyncHandler(async (req, res) => {
  const { type, participantId, name } = req.body;
  const userId = req.user._id;

  if (type === 'individual' && participantId) {
    // Verificar si ya existe un chat individual
    const existing = await Chat.findOne({
      type: 'individual',
      participants: { $all: [userId, participantId], $size: 2 },
    });

    if (existing) {
      return res.json({ success: true, data: existing });
    }

    const chat = await Chat.create({
      type: 'individual',
      participants: [userId, participantId],
    });

    const populated = await chat.populate('participants', 'name username role');
    return res.status(201).json({ success: true, data: populated });
  }

  if (type === 'grupal') {
    // Chat grupal con todo el equipo. "Chat General" apunta al canal general.
    if (name === 'general' || (name || '').toLowerCase().startsWith('general')) {
      const chat = await getOrCreateGeneralChat();
      const populated = await chat.populate('participants', 'name username role');
      return res.status(200).json({ success: true, data: populated });
    }

    // Canal dedicado a Soporte Técnico (comunicación directa con Soporte).
    if (name === 'soporte' || (name || '').toLowerCase().startsWith('soporte')) {
      const chat = await getOrCreateSupportChat();
      const populated = await chat.populate('participants', 'name username role');
      return res.status(200).json({ success: true, data: populated });
    }

    const team = await User.find({ status: 'activo' }).select('_id');
    const participantIds = team.map(u => u._id);
    if (!participantIds.includes(userId)) participantIds.push(userId);

    const chat = await Chat.create({
      name: name || 'Chat General',
      type: 'grupal',
      participants: participantIds,
    });

    const populated = await chat.populate('participants', 'name username role');
    return res.status(201).json({ success: true, data: populated });
  }

  res.status(400).json({ success: false, message: 'Tipo de chat inválido' });
});

// Lógica única de persistencia + broadcast del mensaje. La usan tanto el
// endpoint REST (POST /chats/:id/messages) como el socket 'send-message',
// para que las dos vías se comporten igual.
const persistAndBroadcast = async (io, chatId, userId, userName, message) => {
  const text = String(message || '').trim();
  if (!text) throw new Error('El mensaje no puede estar vacío');
  if (text.length > 2000) throw new Error('El mensaje no puede superar los 2000 caracteres');
  if (!userId) throw new Error('Usuario no autenticado');

  const chat = await Chat.findById(chatId);
  if (!chat) throw new Error('Chat no encontrado');

  if (!chat.participants.some(p => p && p.toString() === String(userId))) {
    throw new Error('No tienes acceso a este chat');
  }

  let destinatario = 'GRUPO_GENERAL';
  if (chat.type === 'individual') {
    const other = chat.participants.find(p => p && p.toString() !== String(userId));
    destinatario = other ? other.toString() : 'GRUPO_GENERAL';
  }

  chat.messages.push({
    sender: userId,
    emisor: userId,
    emisorNombre: (userName || 'Usuario').trim().slice(0, 80),
    destinatario,
    message: text,
    readBy: [userId],
  });

  chat.lastMessage = text;
  chat.lastMessageAt = new Date();

  await chat.save();

  const populated = await chat.populate('messages.sender', 'name username role');
  const newMsg = populated.messages[populated.messages.length - 1];

  if (io) {
    // Se emite con DOS nombres de evento para compatibilidad: el chat escucha
    // tanto 'receive-message' como 'new-message'.
    const payload = { chatId, message: newMsg };
    io.to(`chat:${chatId}`).emit('receive-message', payload);
    io.to(`chat:${chatId}`).emit('new-message', payload);
    if (chat.type === 'individual') {
      chat.participants.forEach((p) => {
        if (p) {
          const room = `user:${p.toString()}`;
          io.to(room).emit('receive-message', payload);
          io.to(room).emit('new-message', payload);
        }
      });
    } else {
      io.to('general').emit('receive-message', payload);
      io.to('general').emit('new-message', payload);
    }
  }

  return newMsg;
};

// Enviar mensaje (vía REST)
const sendMessage = asyncHandler(async (req, res) => {
  if (!req.user || !req.user._id) {
    return res.status(401).json({ success: false, message: 'No autorizado' });
  }

  const chatId = req.params.id;
  const text = String((req.body && req.body.message) || '').trim();
  if (!text) {
    return res.status(400).json({ success: false, message: 'El mensaje no puede estar vacío' });
  }
  if (text.length > 2000) {
    return res.status(400).json({ success: false, message: 'El mensaje no puede superar los 2000 caracteres' });
  }

  const io = req.app.get('io');
  const nameUser = req.user.name || req.user.username || 'Usuario';

  try {
    const newMsg = await persistAndBroadcast(io, chatId, req.user._id.toString(), nameUser, text);
    return res.status(201).json({ success: true, data: newMsg });
  } catch (error) {
    if (error.message === 'Chat no encontrado') {
      return res.status(404).json({ success: false, message: error.message });
    }
    if (error.message === 'No tienes acceso a este chat') {
      return res.status(403).json({ success: false, message: error.message });
    }
    throw error;
  }
});

// Marcar mensajes como leídos
const markAsRead = asyncHandler(async (req, res) => {
  const chatId = req.params.id;
  const userId = req.user._id;

  const chat = await Chat.findById(chatId);
  if (!chat) {
    return res.status(404).json({ success: false, message: 'Chat no encontrado' });
  }

  chat.messages.forEach(msg => {
    if (!msg.readBy.includes(userId)) {
      msg.readBy.push(userId);
    }
  });

  await chat.save();

  res.json({ success: true, message: 'Mensajes marcados como leídos' });
});

// Obtener conteo de mensajes no leídos
const unreadCount = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const chats = await Chat.find({
    participants: userId,
    'messages.readBy': { $ne: userId },
  });

  let totalUnread = 0;
  chats.forEach(chat => {
    chat.messages.forEach(msg => {
      if (!msg.readBy.includes(userId)) {
        totalUnread++;
      }
    });
  });

  res.json({ success: true, data: { unread: totalUnread } });
});

module.exports = {
  listChats,
  getChat,
  createChat,
  sendMessage,
  markAsRead,
  unreadCount,
  general,
  supportChat,
  getOrCreateGeneralChat,
  getOrCreateSupportChat,
  persistAndBroadcast,
};
