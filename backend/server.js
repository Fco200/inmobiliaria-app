'use strict';

require('dotenv').config();

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
const storageJob = require('./src/jobs/storage.job');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { User, Session, Notification } = require('./src/models');
const { getOrCreateGeneralChat, getOrCreateSupportChat, persistAndBroadcast } = require('./src/controllers/chat.controller');
const { setIo } = require('./src/services/notification.service');
const sessionService = require('./src/services/session.service');
const logger = require('./src/services/logger.service');

async function start() {
  // Diagnóstico de correo: si no hay SMTP, todo se queda en "dry-run" (no envía).
  if (hasSmtp()) {
    console.log('[MAIL] SMTP configurado: envío REAL activado.');
  } else {
    console.warn('[MAIL] SIN SMTP configurado: MODO DRY-RUN. Revisa SMTP_HOST/USER/PASS en las variables de entorno.');
  }

  // Diagnóstico de almacenamiento: deja claro en los logs DÓNDE se guardan las
  // fotos y documentos. En Render debe ser "mongodb" o "r2" (persistente); si
  // aparece "local" las fotos se borrarán en cada despliegue.
  const storageMode = require('./src/services/storage.service').getMode();
  if (storageMode === 'local' && nodeEnv === 'production') {
    console.warn('[Storage] MODO LOCAL en producción: las fotos SE BORRARÁN en cada despliegue. Define STORAGE_DRIVER=mongodb o r2, o conecta MongoDB.');
  } else {
    console.log(`[Storage] Modo activo: ${storageMode}`);
  }

  const connection = await connectDB();

  if (connection) {
    await seed();
    startJobs();
    // Los avisos internos de tipo "nueva_propiedad" ("Se publicó una casa…
    // coincide con los intereses de X") ya no se generan por defecto. Aquí se
    // eliminan los que quedaron de versiones anteriores para que la campana
    // del equipo quede limpia. Si se reactivan con
    // NOTIFY_INTERESTED_CLIENTS=true, la limpieza NO se ejecuta (de lo
    // contrario borraría los avisos nuevos en cada reinicio).
    const notifyInterestedClients = /^(1|true|si|sí)$/i.test(
      String(process.env.NOTIFY_INTERESTED_CLIENTS || 'false')
    );
    if (!notifyInterestedClients) {
      try {
        const removed = await Notification.deleteMany({ type: 'nueva_propiedad' });
        if (removed.deletedCount) {
          console.log(`[Notificaciones] Eliminados ${removed.deletedCount} avisos antiguos de "nueva propiedad".`);
        }
      } catch (e) {
        console.warn('[Notificaciones] No se pudieron limpiar los avisos antiguos:', e.message);
      }
    }
    // Asegura el canal grupal general y el canal de Soporte accesibles para el equipo.
    try { await getOrCreateGeneralChat(); } catch (e) { console.error('[Chat] No se pudo crear el canal general:', e.message); }
    try { await getOrCreateSupportChat(); } catch (e) { console.error('[Chat] No se pudo crear el canal de soporte:', e.message); }
    // Un mismo dispositivo puede quedar suscrito varias veces al cambiar de
    // cuenta; eso hacía que el celular mostrara el mismo aviso repetido.
    try {
      const push = require('./src/services/push.service');
      await push.cleanupDuplicates();
    } catch (e) { console.warn('[Push] Limpieza inicial omitida:', e.message); }
    // Limpieza de archivos subidos sin registro (fotos huérfanas): con la
    // cuota gratuita de Atlas, unas pocas fotos de celular repetidas bastan
    // para dejar la base de datos sin espacio y bloquear las escrituras.
    storageJob.startStorageJob();
  }

  const server = app.listen(port, () => {
    console.log(`Servidor iniciado en el puerto ${port} (${nodeEnv})`);
  });

  // Soporte para 1000+ conexiones concurrentes:
  //  - `maxConnections`: tope alto de sockets simultáneos (Node no limita por
  //    defecto, pero un valor explícito evita agotar descriptores del sistema
  //    sin control).
  //  - `keepAliveTimeout`/`headersTimeout`: mantiene vivas las conexiones
  //    reutilizables (el CRM hace muchas peticiones seguidas) sin cortar
  //    cabeceras que todavía se están enviando.
  //  - `requestTimeout`: 10 min para que una subida de fotos grande no se
  //    corte a la mitad; el cliente sigue viendo el aviso de "subiendo".
  server.maxConnections = Number(process.env.SERVER_MAX_CONNECTIONS || 2048);
  server.keepAliveTimeout = Number(process.env.SERVER_KEEPALIVE_TIMEOUT || 65000);
  server.headersTimeout = Number(process.env.SERVER_HEADERS_TIMEOUT || 66000);
  server.requestTimeout = Number(process.env.SERVER_REQUEST_TIMEOUT || 10 * 60 * 1000);

  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    // Ajustes para 50+ usuarios simultáneos en una sola instancia:
    //  - `pingInterval`/`pingTimeout`: el servidor comprueba la conexión cada
    //    30 s y la da por muerta a los 20 s de no responder. Con los valores
    //    por defecto (25 s/20 s) un pc en reposo con la pestaña en segundo
    //    plano se desconectaba y reconectaba en bucle, generando carga.
    //  - `maxHttpBufferSize` pequeño: los mensajes de chat son cortos; un
    //    payload enorme es un abuso y no debe memorie.
    //  - `connectionStateRecovery`: si la conexión se cae, el cliente recupera
    //    las salas y los paquetes perdidos en lugar de quedarse desconectado.
    pingInterval: 30000,
    pingTimeout: 20000,
    maxHttpBufferSize: 1e6,
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: false,
    },
  });

  logger.setIo(io);

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      if (!token) return next(new Error('Autenticación requerida'));
      const decoded = jwt.verify(token, jwtSecret);
      const user = await User.findById(decoded.id).select('name username role status').populate('role', 'code');
      if (!user) return next(new Error('Usuario no encontrado'));
      // Un usuario desactivado no puede mantener el socket abierto.
      if (user.status !== 'activo') return next(new Error('Tu usuario está inactivo'));
      // La sesión debe seguir vigente en la base de datos (revocada o expirada
      // → rechazo). Así un dispositivo cuya sesión cerró el administrador queda
      // desconectado al instante, incluso si intenta reconectar.
      const session = await Session.findOne({ tokenHash: sessionService.hashToken(token) });
      if (!session) return next(new Error('Tu sesión fue cerrada. Inicia sesión de nuevo.'));
      socket.user = user;
      socket.sessionHash = session.tokenHash;
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

    // Cada usuario entra a su habitación privada (para avisos 1 a 1), al
    // canal grupal general del equipo y a la sala de SU sesión: la sala
    // `session:<hash>` recibe el evento 'session-revoked' cuando esa sesión
    // concreta es cerrada, para que solo ese dispositivo pierda el acceso.
    if (socket.user && socket.user._id) {
      socket.join(`user:${socket.user._id.toString()}`);
    }
    if (socket.sessionHash) {
      socket.join(sessionService.sessionRoom(socket.sessionHash));
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
      const roleCode = socket.user.role && typeof socket.user.role === 'object'
        ? (socket.user.role.code || null)
        : null;
      const clientId = data.clientId ? String(data.clientId) : null;
      const extra = {};
      if (data.replyTo) extra.replyTo = data.replyTo;
      if (data.replyToMessage) extra.replyToMessage = data.replyToMessage;
      if (Array.isArray(data.mentions)) extra.mentions = data.mentions;
      try {
        await persistAndBroadcast(io, chatId, socket.user._id.toString(), nameUser, text, roleCode, clientId, extra);
      } catch (err) {
        logger.error('Error al enviar mensaje por Socket.io', {
          chatId,
          reason: err.message,
        }, 'socket');
        socket.emit('message-error', { message: err.message || 'Error al enviar mensaje', clientId });
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
  sessionService.setIo(io);
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