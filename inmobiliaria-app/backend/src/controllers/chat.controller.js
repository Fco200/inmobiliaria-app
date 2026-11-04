'use strict';

const mongoose = require('mongoose');
const asyncHandler = require('../middlewares/asyncHandler');
const { Chat, User, Role, Notification } = require('../models');
const { pushNative } = require('../services/notification.service');

// Cantidad máxima de mensajes que se devuelven al abrir una conversación.
// Antes se traían los últimos 200 DESPUÉS de cargar el documento completo
// (con su historial entero) desde MongoDB: con grupos grandes eso significaba
// mover decenas de miles de mensajes por cada apertura. Ahora el corte se
// hace EN EL SERVIDOR con una proyección $slice.
const MAX_MESSAGES_RETURNED = 200;

// Códigos de rol que participan en el canal grupal general.
const TEAM_ROLES = ['admin', 'direccion', 'gerencia', 'asesor', 'superadmin', 'asistencia', 'escrituracion'];

// Nombre del canal grupal accesible para todo el equipo.
const GENERAL_NAME = 'general';

// Nombre del canal grupal dedicado a la comunicación directa con Soporte Técnico.
const SOPORTE_NAME = 'soporte';

// Códigos de rol del equipo que participan en el canal de Soporte (emisores).
const SUPPORT_TEAM_ROLES = ['admin', 'gerencia', 'asesor'];

// Códigos de rol del Soporte Técnico (superadmin), exento de mantenimiento.
const SUPPORT_ROLE = 'superadmin';

// Normaliza un id a ObjectId. Las rutas Express entregan los ids como TEXTO
// (`req.params.id`) y Mongoose solo los castea en las consultas con `find`/
// `updateOne`, NO en las agregaciones (`aggregate`). Sin esta conversión, un
// id en texto no encuentra nada en una agregación.
const toObjectId = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (value._id) return toObjectId(value._id);
  const raw = String(value);
  if (!mongoose.Types.ObjectId.isValid(raw)) return null;
  return new mongoose.Types.ObjectId(raw);
};

// RENDIMIENTO (50+ usuarios a la vez): cada vez que alguien abría el canal
// general se repetían las consultas de roles y usuarios activos, y si
// faltaba alguien se guardaba el documento COMPLETO con `save()`, lo que
// reescribía también todo el historial de mensajes. Ahora:
//   · la lista del equipo se cachea 60 s (es lo mismo para todos), y
//   · los participantes se sincronizan con `$addToSet`, que es atómico y
//     solo toca ese campo: el historial no se reescribe nunca.
const TEAM_CACHE_MS = 60 * 1000;
let teamCache = { key: '', at: 0, ids: [] };

async function activeTeamIds(roleCodes) {
  const key = roleCodes.join(',');
  const now = Date.now();
  if (teamCache.key === key && now - teamCache.at < TEAM_CACHE_MS) {
    return teamCache.ids;
  }
  const roles = await Role.find({ code: { $in: roleCodes } }).select('_id').lean();
  const roleIds = roles.map((r) => r._id);
  const team = await User.find({
    role: { $in: roleIds },
    status: 'activo',
  }).select('_id').lean();
  const ids = team.map((u) => u._id);
  teamCache = { key, at: now, ids };
  return ids;
}

// Añade al chat los miembros del equipo que todavía no estén. Usa `$addToSet`
// (atómico, sin duplicados) en lugar de `save()` para no reescribir el
// historial de mensajes del canal.
async function syncParticipants(chat, teamIds) {
  const current = (chat.participants || []).filter(Boolean).map((p) => p.toString());
  const missing = teamIds.filter((id) => !current.includes(id.toString()));
  if (!missing.length) return chat;
  await Chat.updateOne(
    { _id: chat._id },
    { $addToSet: { participants: { $each: missing } } }
  );
  chat.participants = [...(chat.participants || []), ...missing];
  return chat;
}

/**
 * Devuelve (creándolo si hace falta) el chat grupal general en el que
 * participa todo el equipo. Se invoca al arrancar y bajo demanda.
 */
async function getOrCreateGeneralChat() {
  let chat = await Chat.findOne({ type: 'grupal', name: GENERAL_NAME });
  if (chat) {
    // Mantener sincronizados los participantes con el equipo actual.
    const teamIds = await activeTeamIds(TEAM_ROLES);
    return syncParticipants(chat, teamIds);
  }

  const teamIds = await activeTeamIds(TEAM_ROLES);
  chat = await Chat.create({
    name: GENERAL_NAME,
    type: 'grupal',
    participants: teamIds,
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
    const teamIds = await activeTeamIds([...SUPPORT_TEAM_ROLES, SUPPORT_ROLE]);
    return syncParticipants(chat, teamIds);
  }

  const teamIds = await activeTeamIds([...SUPPORT_TEAM_ROLES, SUPPORT_ROLE]);
  chat = await Chat.create({
    name: SOPORTE_NAME,
    type: 'grupal',
    participants: teamIds,
  });
  return chat;
}

// Listar chats del usuario (los grupales cierran sesión de participantes y se
// devuelven aunque el usuario haya sido agregado después de la creación).
//
// RENDIMIENTO (50+ usuarios simultáneos): antes este listado devolvía el
// historial COMPLETO de cada conversación (hasta 50 chats con todos sus
// mensajes). Eso son megabytes por usuario y por refresco, y saturaba el
// ancho de banda y la RAM del servidor. Ahora:
//   1) el historial NO viaja en la lista (el frontend solo necesita el
//      último mensaje y el contador de no leídos), y
//   2) el contador de no leídos se calcula en MongoDB con una agregación,
//      sin traer los mensajes a memoria.
const listChats = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const chats = await Chat.find({
    $or: [{ participants: userId }, { type: 'grupal' }],
  })
    .select('-messages')
    .populate('participants', 'name username role')
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .limit(50)
    .lean();

  const chatIds = chats.map((c) => c._id);
  let unreadByChat = new Map();
  if (chatIds.length) {
    const rows = await Chat.aggregate([
      { $match: { _id: { $in: chatIds } } },
      {
        $project: {
          unread: {
            $size: {
              $filter: {
                input: { $ifNull: ['$messages', []] },
                as: 'm',
                cond: { $not: { $in: [userId, { $ifNull: ['$$m.readBy', []] }] } },
              },
            },
          },
        },
      },
    ]);
    unreadByChat = new Map(rows.map((r) => [String(r._id), r.unread || 0]));
  }

  const data = chats.map((c) => ({
    ...c,
    unread: unreadByChat.get(String(c._id)) || 0,
  }));

  res.json({ success: true, data });
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
//
// RENDIMIENTO: se cargan por separado los DATOS de la conversación y sus
// ÚLTIMOS 200 mensajes (corte con $slice dentro de MongoDB). Antes se
// descargaba el documento entero con TODOS los mensajes y se recortaba en
// JavaScript: en un canal de equipo con mucho historial eso era una descarga
// enorme por cada apertura y ralentizaba a todos los usuarios a la vez.
const getChat = asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.params.id)
    .select('-messages')
    .populate('participants', 'name username role')
    .lean();

  if (!chat) {
    return res.status(404).json({ success: false, message: 'Chat no encontrado' });
  }

  // Verificar que el usuario sea participante (los participantes pueden venir
  // como null si el usuario referido fue eliminado).
  if (!chat.participants.some(p => p && p._id && p._id.toString() === req.user._id.toString())) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este chat' });
  }

  // Últimos mensajes (corte en el servidor).
  let messages = [];
  try {
    const rows = await Chat.aggregate([
      { $match: { _id: chat._id } },
      { $project: { messages: { $slice: ['$messages', -MAX_MESSAGES_RETURNED] } } },
    ]);
    messages = (rows && rows[0] && rows[0].messages) || [];
  } catch (error) {
    console.error('[Chat] No se pudo recortar el historial del chat:', error.message);
    messages = [];
  }

  // Autores de esos mensajes: una sola consulta para todos los remitentes.
  const senderIds = [...new Set(messages
    .map((m) => (m && m.sender ? String(m.sender) : ''))
    .filter(Boolean))];
  let senderMap = new Map();
  if (senderIds.length) {
    const senders = await User.find({ _id: { $in: senderIds } })
      .select('name username role')
      .populate('role', 'code')
      .lean();
    senderMap = new Map(senders.map((u) => [String(u._id), u]));
  }

  const data = {
    ...chat,
    messages: messages.map((m) => ({
      ...m,
      sender: senderMap.get(String(m.sender)) || m.sender || null,
    })),
  };

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
//
// RENDIMIENTO (50+ usuarios simultáneos): antes se cargaba el documento
// COMPLETO del chat (con TODO su historial) solo para añadir un mensaje al
// final, y luego se volvía a cargar y poblar para emitirlo por socket. En un
// canal de equipo con mucho historial eso movía el historial entero por cada
// mensaje enviado y ralentizaba a todos los usuarios a la vez. Ahora:
//   1) el chat se lee SIN historial (proyección ligera) para validar acceso,
//   2) el mensaje se inserta con un $push ATÓMICO (una sola escritura), y
//   3) el emisor viaja ya resuelto en el payload del socket (sin populate).
const MAX_CHAT_MESSAGES = 5000;

const persistAndBroadcastMessage = async (io, chatId, userId, userName, message, senderRoleCode, clientId, extra = {}) => {
  const text = String(message || '').trim();
  if (!text) throw new Error('El mensaje no puede estar vacío');
  if (text.length > 2000) throw new Error('El mensaje no puede superar los 2000 caracteres');
  if (!userId) throw new Error('Usuario no autenticado');

  // Metadatos del chat: SIN el historial de mensajes.
  const chat = await Chat.findById(chatId).select('-messages').lean();
  if (!chat) throw new Error('Chat no encontrado');

  const participants = (chat.participants || []).filter(Boolean);
  if (!participants.some(p => p.toString() === String(userId))) {
    throw new Error('No tienes acceso a este chat');
  }

  let destinatario = 'GRUPO_GENERAL';
  if (chat.type === 'individual') {
    const other = participants.find(p => p.toString() !== String(userId));
    destinatario = other ? other.toString() : 'GRUPO_GENERAL';
  }

  const now = new Date();
  // El id del emisor puede llegar como ObjectId o como texto (REST vs socket).
  let senderId = null;
  try {
    senderId = new mongoose.Types.ObjectId(String(userId));
  } catch (e) {
    throw new Error('Usuario no autenticado');
  }
  const senderName = (userName || 'Usuario').trim().slice(0, 80) || 'Usuario';

  const newMsg = {
    _id: new mongoose.Types.ObjectId(),
    sender: senderId,
    emisor: senderId,
    emisorNombre: senderName,
    destinatario,
    message: text,
    readBy: [senderId],
    createdAt: now,
    updatedAt: now,
    replyTo: extra.replyTo || null,
    replyToMessage: extra.replyToMessage || undefined,
    mentions: Array.isArray(extra.mentions) ? extra.mentions : [],
  };

  // Escritura atómica: una sola operación contra MongoDB. `$slice` acota el
  // tamaño del documento (límite de 16 MB) conservando siempre los mensajes
  // más recientes; el chat solo muestra los últimos 200 de todos modos.
  const result = await Chat.updateOne(
    { _id: chat._id },
    {
      $push: { messages: { $each: [newMsg], $slice: -MAX_CHAT_MESSAGES } },
      $set: { lastMessage: text, lastMessageAt: now },
    }
  );
  if (!result.matchedCount) throw new Error('Chat no encontrado');

  // El emisor viaja ya resuelto: el frontend lo pinta sin llamadas extra.
  const socketMessage = {
    ...newMsg,
    sender: {
      _id: senderId,
      name: senderName,
      role: senderRoleCode ? { code: senderRoleCode } : null,
    },
  };

  if (io) {
    // Se emite con DOS nombres de evento para compatibilidad: el chat escucha
    // tanto 'receive-message' como 'new-message'.
    // `clientId` lo genera el navegador al enviar: permite reemplazar el
    // mensaje "optimista" (pintado al instante) por el definitivo cuando
    // vuelve el eco del servidor, sin duplicados.
    //
    // RENDIMIENTO: Socket.IO admite varios nombres de evento en una sola
    // llamada (`emit([a, b], payload)`) y los manda en UN solo paquete. Antes
    // eran dos paquetes idénticos por destinatario: con 50 usuarios en el
    // canal general eso era el doble de tráfico de la nada.
    const payload = {
      chatId: String(chat._id),
      message: socketMessage,
      clientId: clientId || null,
    };
    const EVENTS = ['receive-message', 'new-message'];
    io.to(`chat:${chat._id}`).emit(EVENTS, payload);
    if (chat.type === 'individual') {
      participants.forEach((p) => {
        io.to(`user:${p.toString()}`).emit(EVENTS, payload);
      });
    } else {
      io.to('general').emit(EVENTS, payload);
    }
  }

  // Aviso (notificación interna + push nativo) al destinatario de un chat 1 a 1.
  // El hook post('save') de Notification dispara el push. Nunca debe romper el
  // envío del mensaje, por eso todo va en try/catch y se ignora cualquier fallo.
  try {
    if (chat.type === 'individual') {
      const recipients = participants.filter((p) => p.toString() !== String(userId));
      await Promise.all(
        recipients.map((p) =>
          Notification.create({
            user: p,
            type: 'nuevo_mensaje_chat',
            title: `Nuevo mensaje de ${senderName}`,
            message: text.slice(0, 140),
            data: { chatId: String(chat._id) },
          }).catch(() => null)
        )
      );
    } else if (chat.type === 'grupal') {
      // Chats grupales (general / soporte): push NATIVO directo a todos los
      // participantes excepto el emisor. No se crea aviso en la lista interna
      // para no saturarla; el mensaje llega igualmente al celular (incluso
      // bloqueado o con la app cerrada).
      const recipients = participants
        .filter((p) => p.toString() !== String(userId))
        .map((p) => p.toString());
      const groupLabel = chat.name && String(chat.name).trim()
        ? String(chat.name).trim()
        : 'Equipo';
      await pushNative(recipients, {
        title: `${groupLabel}: ${senderName.slice(0, 40)}`,
        body: text.slice(0, 140),
        tag: `chat-${chat._id}`,
        url: 'chat.html',
      });
    }
  } catch (e) { /* el aviso nunca debe impedir el mensaje */ }

  return socketMessage;
};

// Punto de entrada usado por el endpoint REST y por el socket 'send-message'.
// `senderRoleCode` es opcional: si no se pasa, el mensaje se emite sin rol
// (el frontend solo lo usa para etiquetar los mensajes de Soporte Técnico).
const persistAndBroadcast = (io, chatId, userId, userName, message, senderRoleCode, clientId, extra) =>
  persistAndBroadcastMessage(io, chatId, userId, userName, message, senderRoleCode || null, clientId || null, extra || {});

// Enviar mensaje (vía REST)
const sendMessage = asyncHandler(async (req, res) => {
  if (!req.user || !req.user._id) {
    return res.status(401).json({ success: false, message: 'No autorizado' });
  }

  const chatId = req.params.id;
  const text = String((req.body && req.body.message) || '').trim();
  const clientId = (req.body && req.body.clientId) ? String(req.body.clientId) : null;
  if (!text) {
    return res.status(400).json({ success: false, message: 'El mensaje no puede estar vacío' });
  }
  if (text.length > 2000) {
    return res.status(400).json({ success: false, message: 'El mensaje no puede superar los 2000 caracteres' });
  }

  const io = req.app.get('io');
  const nameUser = req.user.name || req.user.username || 'Usuario';
  const roleCode = req.user.role && typeof req.user.role === 'object'
    ? (req.user.role.code || null)
    : null;
  const extra = {};
  if (req.body.replyTo) extra.replyTo = req.body.replyTo;
  if (req.body.replyToMessage) extra.replyToMessage = req.body.replyToMessage;
  if (Array.isArray(req.body.mentions)) extra.mentions = req.body.mentions;

  try {
    const newMsg = await persistAndBroadcast(io, chatId, req.user._id.toString(), nameUser, text, roleCode, clientId, extra);
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

// Marca TODOS los mensajes de un chat como leídos por el usuario.
//
// RENDIMIENTO: se hace con una ACTUALIZACIÓN POR AGREGACIÓN (MongoDB 4.2+),
// que trabaja en el servidor. Antes se cargaba el chat COMPLETO (con todo su
// historial) en memoria, se modificaba cada mensaje y se guardaba el
// documento entero: con mucho historial eso era lentísimo y bloqueaba el
// canal para todos los usuarios a la vez.
//
// Antes de escribir se comprueba si de verdad hay algo pendiente. Sin esa
// comprobación, cada vez que un asesor ABRÍA el canal general se reescribía
// el historial completo aunque ya lo hubiera leído todo: con 50 usuarios
// eso son 50 reescrituras del mismo documento por vuelta, y además se
// peleaban por el mismo documento (bloqueos y reintentos en MongoDB).
//
// Devuelve false si el chat no existe.
const markChatAsRead = async (chatId, userId) => {
  // OJO: las rutas pasan el id como TEXTO (req.params.id) y Mongoose NO
  // castea los filtros de una agregación (sí los de un updateOne). Si el id
  // se quedara como cadena, la agregación no encontraría nada, se creería
  // que no hay nada pendiente y los mensajes NUNCA se marcarían como leídos.
  // Por eso se normaliza a ObjectId antes de consultar.
  const chatObjectId = toObjectId(chatId);
  const userObjectId = toObjectId(userId);
  if (!chatObjectId || !userObjectId) return false;

  // 1) ¿Hay algo sin leer? Solo se calcula el número en el servidor: el
  //    historial no viaja al backend de Node.
  let unread = 0;
  try {
    const rows = await Chat.aggregate([
      { $match: { _id: chatObjectId } },
      {
        $project: {
          unread: {
            $size: {
              $filter: {
                input: { $ifNull: ['$messages', []] },
                as: 'm',
                cond: { $not: { $in: [userObjectId, { $ifNull: ['$$m.readBy', []] }] } },
              },
            },
          },
        },
      },
    ]);
    if (!rows || !rows.length) return false; // el chat no existe
    unread = rows[0].unread || 0;
  } catch (e) {
    unread = -1; // -1 = "no se pudo saber": se intenta escribir de todos modos.
  }

  // 2) Si no hay nada pendiente se sale sin tocar el documento.
  if (unread === 0) return true;

  try {
    await Chat.updateOne(
      { _id: chatObjectId },
      [
        {
          $set: {
            messages: {
              $map: {
                input: { $ifNull: ['$messages', []] },
                as: 'm',
                in: {
                  $cond: [
                    { $in: [userObjectId, { $ifNull: ['$$m.readBy', []] }] },
                    '$$m',
                    {
                      $mergeObjects: [
                        '$$m',
                        { readBy: { $concatArrays: [{ $ifNull: ['$$m.readBy', []] }, [userObjectId]] } },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      ]
    );
    return true;
  } catch (e) {
    // Respaldo para servidores antiguos (< 4.2): carga y guardado clásicos.
    const chat = await Chat.findById(chatObjectId);
    if (!chat) return false;
    chat.messages.forEach(msg => {
      if (!msg.readBy.some((r) => r && r.toString() === String(userObjectId))) {
        msg.readBy.push(userId);
      }
    });
    await chat.save();
    return true;
  }
};

// Marcar mensajes como leídos
const markAsRead = asyncHandler(async (req, res) => {
  const chatId = req.params.id;
  const ok = await markChatAsRead(chatId, req.user._id);
  if (!ok) {
    return res.status(404).json({ success: false, message: 'Chat no encontrado' });
  }
  res.json({ success: true, message: 'Mensajes marcados como leídos' });
});

// Obtener conteo de mensajes no leídos
//
// RENDIMIENTO: el conteo se calcula en MongoDB; no se trae el historial a la
// memoria para contar a mano (antes se cargaban todos los chats con sus
// mensajes completos en cada consulta del badge).
const unreadCount = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const rows = await Chat.aggregate([
    { $match: { participants: userId } },
    {
      $project: {
        unread: {
          $size: {
            $filter: {
              input: { $ifNull: ['$messages', []] },
              as: 'm',
              cond: { $not: { $in: [userId, { $ifNull: ['$$m.readBy', []] }] } },
            },
          },
        },
      },
    },
    { $group: { _id: null, total: { $sum: '$unread' } } },
  ]);

  const totalUnread = rows.length ? (rows[0].total || 0) : 0;
  res.json({ success: true, data: { unread: totalUnread } });
});

// Borra TODO el historial de mensajes de un chat.
// - En los canales grupales del equipo (General/Soporte) solo admin/gerencia
//   pueden vaciarlos, para que un asesor no borre la conversación de todos.
// - En un chat 1:1 cualquiera de sus participantes puede vaciar el suyo.
const clearMessages = asyncHandler(async (req, res) => {
  const chatId = req.params.id;
  const userId = req.user._id;

  // Solo los metadatos: el historial no hace falta para validar permisos y
  // borrarlo con un $set evita recargar y reescribir todo el documento.
  const chat = await Chat.findById(chatId).select('-messages').lean();
  if (!chat) {
    return res.status(404).json({ success: false, message: 'Chat no encontrado' });
  }

  const participants = (chat.participants || []).filter(Boolean);
  const isParticipant = participants.some((p) => p.toString() === String(userId));
  if (!isParticipant) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este chat' });
  }

  const role = req.user.role && typeof req.user.role === 'object' ? (req.user.role.code || '') : req.user.role;
  const isBoss = ['admin', 'direccion', 'gerencia', 'asistencia', 'superadmin'].includes(role);

  if (chat.type === 'grupal' && !isBoss) {
    return res.status(403).json({
      success: false,
      message: 'Solo administradores y gerencia pueden borrar el historial de este canal',
    });
  }

  await Chat.updateOne(
    { _id: chat._id },
    { $set: { messages: [], lastMessage: '', lastMessageAt: null } }
  );

  const io = req.app.get('io');
  if (io) {
    const payload = { chatId: String(chat._id) };
    io.to(`chat:${chat._id}`).emit('chat-cleared', payload);
    if (chat.type === 'grupal') io.to('general').emit('chat-cleared', payload);
  }

  res.json({ success: true, message: 'Historial de chat borrado' });
});

module.exports = {
  listChats,
  getChat,
  createChat,
  sendMessage,
  markAsRead,
  unreadCount,
  clearMessages,
  general,
  supportChat,
  getOrCreateGeneralChat,
  getOrCreateSupportChat,
  persistAndBroadcast,
  markChatAsRead,
  toObjectId,
};
