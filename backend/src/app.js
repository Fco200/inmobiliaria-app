'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const apiRoutes = require('./routes');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');
const { maintenance, maintenancePage } = require('./middlewares/maintenance');
const { clientUrl, isProduction } = require('./config/env');

const app = express();

// Detrás de proxies (Render, Nginx, etc.) se respeta la IP real del cliente
// para el límite de peticiones.
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        // Permitir llamadas a la API del backend local aunque la página se sirva
        // desde 127.0.0.1 (evita bloqueos de "connect-src" del navegador).
        // Se agrega el CDN de Socket.IO (source map/script) y el esquema wss:
        // para que el WebSocket de chat funcione en cualquier dominio de
        // producción (Render cambia el hostname entre deploys).
        'connect-src': ["'self'", 'http://localhost:5000', 'http://127.0.0.1:5000', 'ws://localhost:5000', 'wss://localhost:5000', 'https://accounts.google.com', 'https://cdn.socket.io', 'wss:', 'ws:'],
        // SDK de Google Identity Services para el botón "Registrarse con Google"
        // (script + iframe de One Tap).
        'script-src': ["'self'", 'https://accounts.google.com', 'https://cdn.socket.io'],
        'frame-src': ["'self'", 'https://accounts.google.com'],
      },
    },
  })
);
// CORS restringido: el frontend servido por el propio backend no necesita
// orígenes extra. CLIENT_URL admite una lista separada por comas para casos
// como Live Server (p. ej. http://localhost:5500,http://127.0.0.1:5500).
const allowedOrigins = String(clientUrl || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Sin Origin (mismo origen / curl / apps nativas) → permitido.
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

if (!isProduction) {
  app.use(morgan('dev'));
}

app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Demasiadas peticiones, intenta más tarde' },
  })
);

const frontendDir = path.join(__dirname, '../../frontend');

// En modo mantenimiento se muestra la pantalla amigable para las navegaciones
// de páginas (no bloquear recursos estáticos ni las páginas públicas/panel de
// soporte). Se registra antes del estático para interceptar el contenido HTML.
app.use(maintenancePage);
app.use(
  express.static(frontendDir, {
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-store');
    },
  })
);

const uploadsDir = path.join(__dirname, '../uploads');
const { fileAuth } = require('./middlewares/fileAuth');

// Archivos subidos (INE, contratos, fotos): requieren sesión salvo las fotos
// de propiedades publicadas (catálogo público). Se sirve con nosniff.
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    next();
  },
  fileAuth,
  express.static(uploadsDir)
);

app.use('/api', maintenance, apiRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
