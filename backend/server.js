'use strict';

require('dotenv').config();

// Render no siempre tiene ruta de salida por IPv6: forzamos que las conexiones
// salientes (p. ej. SMTP de Gmail) resuelvan a IPv4 primero, evitando
// "connect ENETUNREACH <ipv6>:587".
// Render no siempre tiene ruta de salida por IPv6: forzamos que las conexiones
// salientes (p. ej. SMTP de Gmail) resuelvan a IPv4 primero, evitando
// "connect ENETUNREACH <ipv6>:587".
try {
  require('node:dns').setDefaultResultOrder('ipv4first');
} catch (e) {
  console.warn('[DNS] No se pudo forzar IPv4, continuando...');
}

const https = require('https');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const seed = require('./src/services/seed.service');
const { port, nodeEnv, jwtSecret } = require('./src/config/env');
const { hasSmtp, resetTransporter } = require('./src/services/mail.service');
const { startJobs, stopJobs } = require('./src/jobs/notification.job');
const maintenanceJob = require('./src/jobs/maintenance.job');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { User } = require('./src/models');
const { getOrCreateGeneralChat, getOrCreateSupportChat, persistAndBroadcast } = require('./src/controllers/chat.controller');
const { setIo } = require('./src/services/notification.service');
const logger = require('./src/services/logger.service');

async function start() {
  // Diagnóstico de correo: si no hay SMTP, todo se queda en "dry-run" (no envía).
  if (hasSmtp()) {
    console.log('[MAIL] SMTP configurado: envío REAL activado.');
  } else {
    console.warn('[MAIL] SIN SMTP configurado: MODO DRY-RUN. Revisa SMTP_HOST/USER/PASS en las variables de entorno.');
  }

  const connection = await connectDB();

  if (connection) {
    await seed();
    startJobs();
    // Asegura el canal grupal general y el canal de Soporte accesibles para el equipo.
    try { await getOrCreateGeneralChat(); } catch (e) { console.error('[Chat] No se pudo crear el canal general:', e.message); }
    try { await getOrCreateSupportChat(); } catch (e) { console.error('[Chat] No se pudo crear el canal de soporte:', e.message); }
  }

  const server = app.listen(port, () => {
    console.log(`Servidor iniciado en el puerto ${port} (${nodeEnv})`);
  });

  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  logger.setIo(io);

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
    logger.info('Cliente Socket.io conectado', {
      socketId: socket.id,
      usuario: socket.user && (socket.user.name || socket.user.username),
    }, 'socket');

    // Cada usuario entra a su habitación privada (para avisos 1 a 1) y al
    // canal grupal general del equipo.
    if (socket.user && socket.user._id) {
      socket.join(`user:${socket.user._id.toString()}`);
    }
    socket.join('general');

    socket.on('connect_error', (err) => {
      logger.error('Error de conexión de Socket.io', {
        socketId: socket.id,
        reason: err && err.message,
      }, 'socket');
    });

    socket.on('error', (err) => {
      logger.error('Error en Socket.io', {
        socketId: socket.id,
        reason: err && err.message,
      }, 'socket');
    });

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
        logger.error('Error al enviar mensaje por Socket.io', {
          chatId,
          reason: err.message,
        }, 'socket');
        socket.emit('message-error', { message: err.message || 'Error al enviar mensaje' });
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info('Cliente Socket.io desconectado', {
        socketId: socket.id,
        usuario: socket.user && (socket.user.name || socket.user.username),
        reason: reason || '',
      }, 'socket');
      console.log(`[Socket] ${socket.user && socket.user.name ? socket.user.name : 'usuario'} desconectado`);
    });
  });

  app.set('io', io);
  setIo(io);
  maintenanceJob.setIo(io);
  maintenanceJob.startMaintenanceJob();

  const shutdown = (signal) => {
    console.log(`\n${signal} recibido, cerrando servidor...`);
    stopJobs();
    maintenanceJob.stopMaintenanceJob();
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
    logger.error('Promesa rechazada sin capturar', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason && reason.stack,
    }, 'proceso');
  });
  process.on('uncaughtException', (err) => {
    console.error('Excepción no capturada:', err);
    logger.error('Excepción no capturada', {
      reason: err && err.message,
      stack: err && err.stack,
    }, 'proceso');
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