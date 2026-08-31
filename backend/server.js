'use strict';

require('dotenv').config();
const https = require('https');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const seed = require('./src/services/seed.service');
const { port, nodeEnv, jwtSecret } = require('./src/config/env');
const { startJobs, stopJobs } = require('./src/jobs/notification.job');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { User } = require('./src/models');
const { getOrCreateGeneralChat, persistAndBroadcast } = require('./src/controllers/chat.controller');
const { setIo } = require('./src/services/notification.service');

async function start() {
  const connection = await connectDB();

  if (connection) {
    await seed();
    startJobs();
    // Asegura el canal grupal general accesible para todo el equipo.
    try { await getOrCreateGeneralChat(); } catch (e) { console.error('[Chat] No se pudo crear el canal general:', e.message); }
  }

  const server = app.listen(port, () => {
    console.log(`Servidor iniciado en el puerto ${port} (${nodeEnv})`);
  });

  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      if (!token) return next(new Error('Autenticación requerida'));
      const decoded = jwt.verify(token, jwtSecret);
      const user = await User.findById(decoded.id).select('name username role');
      if (!user) return next(new Error('Usuario no encontrado'));
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] ${socket.user && socket.user.name ? socket.user.name : 'usuario'} conectado (${socket.id})`);

    // Cada usuario entra a su habitación privada (para avisos 1 a 1) y al
    // canal grupal general del equipo.
    if (socket.user && socket.user._id) {
      socket.join(`user:${socket.user._id.toString()}`);
    }
    socket.join('general');

    socket.on('join-chat', (chatId) => {
      socket.join(`chat:${chatId}`);
    });

    socket.on('leave-chat', (chatId) => {
      socket.leave(`chat:${chatId}`);
    });

    // Envío de mensajes por socket (reutiliza la misma lógica del REST):
    // valida al usuario, persiste, emite 'receive-message'/'new-message' a la
    // sala del chat y a las salas privadas / canal general.
    socket.on('send-message', async (payload) => {
      const data = payload || {};
      const chatId = data.chatId;
      const text = String(data.message || '').trim();
      if (!socket.user || !socket.user._id) return;
      if (!chatId || !text) return;
      if (text.length > 2000) return;

      const nameUser = (socket.user.name || socket.user.username) || 'Usuario';
      try {
        await persistAndBroadcast(io, chatId, socket.user._id.toString(), nameUser, text);
      } catch (err) {
        socket.emit('message-error', { message: err.message || 'Error al enviar mensaje' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] ${socket.user && socket.user.name ? socket.user.name : 'usuario'} desconectado`);
    });
  });

  app.set('io', io);
  setIo(io);

  const shutdown = (signal) => {
    console.log(`\n${signal} recibido, cerrando servidor...`);
    stopJobs();
    io.close();
    server.close(() => {
      console.log('Servidor cerrado.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    console.error('Promesa rechazada sin capturar:', reason);
  });
}


// Cambia por tu URL pública de Render
const APP_URL = 'https://inmobiliaria-app-lvn7.onrender.com';

setInterval(() => {
  https.get(APP_URL, (res) => {
    console.log(`[Auto-Ping] Servidor activo. Status: ${res.statusCode}`);
  }).on('error', (err) => {
    console.error('[Auto-Ping Error]:', err.message);
  });
}, 10 * 60 * 1000); // Se ejecuta cada 10 minutos

start();