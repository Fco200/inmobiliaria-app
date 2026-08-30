'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const { Chat, User } = require('../models');

// Listar chats del usuario
const listChats = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const chats = await Chat.find({ participants: userId })
    .populate('participants', 'name username role')
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .limit(50);

  res.json({ success: true, data: chats });
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
    // Chat grupal con todos los asesores
    const users = await User.find({ role: { $in: ['admin', 'gerencia', 'asesor'] } });
    const participantIds = users.map(u => u._id);

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
    io.to(`chat:${chatId}`).emit('new-message', {
      chatId,
      message: newMsg,
    });
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
};
