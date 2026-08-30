'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const { Chat, User, Role } = require('../models');

// Códigos de rol que participan en el canal grupal general.
const TEAM_ROLES = ['admin', 'gerencia', 'asesor'];

// Nombre del canal grupal accesible para todo el equipo.
const GENERAL_NAME = 'general';

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

// Obtener chat por ID con mensajes
const getChat = asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.params.id)
    .populate('participants', 'name username role')
    .populate('messages.sender', 'name username');

  if (!chat) {
    return res.status(404).json({ success: false, message: 'Chat no encontrado' });
  }

  // Verificar que el usuario sea participante
  if (!chat.participants.some(p => p._id.toString() === req.user._id.toString())) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este chat' });
  }

  res.json({ success: true, data: chat });
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

// Enviar mensaje
const sendMessage = asyncHandler(async (req, res) => {
  const { message } = req.body;
  const chatId = req.params.id;
  const userId = req.user._id;

  const chat = await Chat.findById(chatId);
  if (!chat) {
    return res.status(404).json({ success: false, message: 'Chat no encontrado' });
  }

  if (!chat.participants.some(p => p.toString() === userId.toString())) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este chat' });
  }

  chat.messages.push({
    sender: userId,
    message,
    readBy: [userId],
  });

  chat.lastMessage = message;
  chat.lastMessageAt = new Date();

  await chat.save();

  const populated = await chat.populate('messages.sender', 'name username');
  const newMsg = populated.messages[populated.messages.length - 1];

  const io = req.app.get('io');
  if (io) {
    // Emitir a la sala del chat abierto, a las habitaciones privadas de cada
    // participante y al canal general (para chats grupales del equipo).
    io.to(`chat:${chatId}`).emit('new-message', { chatId, message: newMsg });
    if (chat.type === 'individual') {
      chat.participants.forEach((p) => {
        io.to(`user:${p.toString()}`).emit('new-message', { chatId, message: newMsg });
      });
    } else {
      io.to('general').emit('new-message', { chatId, message: newMsg });
    }
  }

  res.status(201).json({ success: true, data: newMsg });
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
  getOrCreateGeneralChat,
};
