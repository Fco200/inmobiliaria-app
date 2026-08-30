'use strict';

require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const seed = require('./src/services/seed.service');
const { port, nodeEnv, jwtSecret } = require('./src/config/env');
const { startJobs, stopJobs } = require('./src/jobs/notification.job');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { User } = require('./src/models');

// Inicializar cliente de Gemini si la clave existe
const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

// Endpoint para el asistente de IA con Gemini
app.post('/api/ai/chat', async (req, res) => {
  try {
    if (!ai) {
      return res.status(500).json({ error: 'GEMINI_API_KEY no configurada en el servidor' });
    }

    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'El prompt es requerido' });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    res.json({ respuesta: response.text });
  } catch (error) {
    console.error('Error al consultar Gemini:', error);
    res.status(500).json({ error: 'Error interno al procesar con IA' });
  }
});

async function start() {
  const connection = await connectDB();

  if (connection) {
    await seed();
    startJobs();
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