'use strict';

require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/db');
const seed = require('./src/services/seed.service');
const { port, nodeEnv, jwtSecret } = require('./src/config/env');
const { startJobs, stopJobs } = require('./src/jobs/notification.job');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { User } = require('./src/models');
const { getOrCreateGeneralChat } = require('./src/controllers/chat.controller');

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
    console.log(`[Socket] ${socket.user.name} conectado (${socket.id})`);

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

    socket.on('disconnect', () => {
      console.log(`[Socket] ${socket.user.name} desconectado`);
    });
  });

  app.set('io', io);

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

start();