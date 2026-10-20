'use strict';

const fs = require('fs');
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
const { User } = require('./models');

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
        // Las imágenes permiten: 'self' (uploads en producción, mismo origen),
        // data:/blob: (QR local y avatares), el backend local en desarrollo
        // (Live Server sirve la página en otro origen → hay que permitir
        // localhost:5000 o las fotos de perfil/propiedades no se muestran) y el
        // respaldo externo del QR (api.qrserver.com).
        'img-src': ["'self'", 'data:', 'blob:', 'http://localhost:5000', 'http://127.0.0.1:5000', 'http://localhost:5500', 'http://127.0.0.1:5500', 'https://api.qrserver.com'],
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

// Límite de peticiones para una operación de oficina corporativa. El equipo
// navega rápido entre módulos (listados, filtros, detalle) y cada pantalla
// dispara varias peticiones, por lo que 300/15min era insuficiente y producía
// bloqueos del tipo "Demasiadas peticiones, intenta más tarde".
//  - Se eleva a 1500 por IP cada 15 min (~100/min sostenido), suficiente para
//    30+ usuarios simultáneos sin permitir abuso.
//  - `skipSuccessfulRequests` NO se usa (queremos contar todo), pero se
//    excluyen del conteo los preflight CORS (OPTIONS), que no son peticiones
//    de datos reales.
//  - Se usa el store en memoria por defecto; con `trust proxy` la IP real del
//    cliente se respeta detrás de Render/Nginx.
const API_WINDOW_MS = Number(process.env.API_RATE_WINDOW_MS || 15 * 60 * 1000);
const API_RATE_MAX = Number(process.env.API_RATE_MAX || 1500);

app.use(
  '/api',
  rateLimit({
    windowMs: API_WINDOW_MS,
    max: API_RATE_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
    message: { success: false, message: 'Demasiadas peticiones, intenta más tarde' },
  })
);

const frontendDir = path.join(__dirname, '../../frontend');

// Vista previa ("card") al compartir en WhatsApp/Facebook: las meta tags OG de
// una página estática no pueden cambiar por asesor, así que servimos las
// páginas públicas del catálogo inyectando og:image con la foto del asesor
// indicado por ?asesorId= (foto pública de /uploads). Si no hay asesor, se usa
// el logo del sitio. Los browsers ignoran estas metas; el scraper ya las lee.
const PAGE_OG_SPLIT = '</head>';
const PREVIEW_PAGES = ['propiedades.html', 'landing.html'];

function injectOgTags(html, meta) {
  const tags = [
    '<!-- OG público -->',
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${meta.title}">`,
    `<meta property="og:description" content="${meta.description}">`,
    `<meta property="og:image" content="${meta.image}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:image" content="${meta.image}">`,
  ].join('\n    ');
  return html.replace(PAGE_OG_SPLIT, `\n    ${tags}\n  ${PAGE_OG_SPLIT}`);
}

PREVIEW_PAGES.forEach((page) => {
  app.get(`/${page}`, async (req, res, next) => {
    try {
      const asesorId = String(req.query.asesorId || '').trim();
      const photoPath = asesorId
        ? await (async () => {
            const user = await User.findById(asesorId).select('photo name').lean();
            return (user && user.photo) ? user.photo : '';
          })()
        : '';
      const base = `${req.protocol}://${req.get('host')}`;
      const image = photoPath
        ? base + String(photoPath).replace(/^\//, '')
        : base + '/logoinmobles.png';

      const filePath = path.join(frontendDir, page);
      const raw = fs.readFileSync(filePath, 'utf8');
      const html = injectOgTags(raw, {
        title: photoPath ? 'Carta de presentación · INMOBLES' : 'INMOBLES · Catálogo inmobiliario',
        description: photoPath
          ? 'Conoce el catálogo de propiedades de este asesor INMOBLES.'
          : 'Profesionales en negocios inmobiliarios.',
        image,
      });
      res.status(200).set('Content-Type', 'text/html; charset=utf-8').send(html);
    } catch (error) {
      // No se pudo generar la vista previa: deja que el estático la sirva.
      next();
    }
  });
});

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

const { fileAuth } = require('./middlewares/fileAuth');
const storage = require('./services/storage.service');

// Archivos subidos (INE, contratos, fotos): requieren sesión salvo las fotos
// de propiedades publicadas (catálogo público). Se sirve con nosniff y sin
// caché para que las fotos de perfil/propiedades SIEMPRE reflejen el archivo
// actualizado (si el asesor cambia su foto, la nueva se muestra al instante).
// Cuando el almacenamiento en la nube (R2) está configurado, los archivos se
// sirven desde el bucket en streaming; si no, desde el disco local.
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('Cache-Control', 'no-store');
    next();
  },
  fileAuth,
  storage.serveStatic()
);

app.use('/api', maintenance, apiRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
