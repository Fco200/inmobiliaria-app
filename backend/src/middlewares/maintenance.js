'use strict';

// Middleware de MODO MANTENIMIENTO.
//
// Cuando la variable global `mantenimiento.on` está en 'true', todas las
// peticiones a la API (excepto el login del panel de soporte) reciben un
// código 503 con una vista amigable de mantenimiento, salvo que el solicitante
// sea un usuario de rol SUPERADMIN (soporte técnico). De esta forma el equipo
// técnico puede seguir accediendo a la plataforma para diagnosticar o revertir
// el modo mientras el resto de usuarios ven la pantalla de mantenimiento.

const jwt = require('jsonwebtoken');
const { Config, User } = require('../models');
const { jwtSecret } = require('../config/env');

const CACHE_TTL_MS = 5000;
let cache = { value: null, at: 0 };

async function mantenimientoActivo() {
  const now = Date.now();
  if (cache.value !== null && now - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }
  let value = false;
  try {
    const cfg = await Config.findOne({ key: 'mantenimiento.on' }).lean();
    value = cfg ? String(cfg.value) === 'true' : false;
  } catch (e) {
    value = false;
  }
  cache = { value, at: now };
  return value;
}

async function esSuperadmin(req) {
  const header = req.headers && req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return false;
  const token = header.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, jwtSecret);
  } catch (e) {
    return false;
  }
  try {
    const user = await User.findById(decoded.id).populate('role').select('status').lean();
    return Boolean(user && user.status === 'activo' && user.role && user.role.code === 'superadmin');
  } catch (e) {
    return false;
  }
}

// Lee el mensaje y la hora/fecha estimada de fin del mantenimiento.
async function datosMantenimiento() {
  const [mensajeCfg, hastaCfg] = await Promise.all([
    Config.findOne({ key: 'mantenimiento.mensaje' }).lean(),
    Config.findOne({ key: 'mantenimiento.hasta' }).lean(),
  ]);
  return {
    mensaje: mensajeCfg ? String(mensajeCfg.value) : '',
    hasta: hastaCfg ? String(hastaCfg.value) : '',
  };
}

// Construye la URL de la pantalla de mantenimiento con el mensaje y la
// hora estimada de fin como query params (la página los lee y muestra).
function maintenanceUrl(datos) {
  const params = [];
  if (datos && datos.mensaje) params.push(`m=${encodeURIComponent(datos.mensaje)}`);
  if (datos && datos.hasta) params.push(`hasta=${encodeURIComponent(datos.hasta)}`);
  return params.length ? `/mantenimiento.html?${params.join('&')}` : '/mantenimiento.html';
}

async function maintenance(req, res, next) {
  // Rutas públicas de autenticación de soporte: SIEMPRE accesibles para poder
  // desactivar el mantenimiento desde el panel.
  if (
    req.path === '/soporte/auth/login' ||
    (req.path === '/health')
  ) {
    return next();
  }

  const activo = await mantenimientoActivo();
  if (!activo) return next();

  const superadmin = await esSuperadmin(req);
  if (superadmin) return next();

  const datos = await datosMantenimiento();

  // Petición de API en mantenimiento: respuesta 503 (JSON para clientes). La
  // vista amigable de mantenimiento la maneja `maintenancePage` (navegación).
  return res.status(503).json({
    success: false,
    message: datos.mensaje || 'El sistema se encuentra en mantenimiento. Intenta más tarde.',
    code: 'MAINTENANCE_MODE',
    mantenimiento: { mensaje: datos.mensaje, hasta: datos.hasta },
  });
}

// Renderiza la vista amigable de mantenimiento para peticiones de páginas web
// (no API). Se registra ANTES del estático para que las navegaciones del CRM
// muestren la pantalla de mantenimiento, evitando bloquear los recursos estáticos.
const STATIC_PATTERNS = [
  /^\/js\//, /^\/css\//, /^\/icons\//, /^\/logos?\//, /^\/uploads\//,
  /\.(png|jpe?g|gif|svg|ico|webp|css|js|json|woff2?|ttf|eot|map)$/i,
];
const PUBLIC_PAGES = ['/index.html', '/', '/login', '/mantenimiento.html', '/soporte.html'];

async function maintenancePage(req, res, next) {
  const pathname = req.path || '/';
  // Nunca bloquear recursos estáticos ni las páginas públicas de acceso para
  // que el login, el panel de soporte y la propia pantalla de mantenimiento
  // sigan siendo alcanzables.
  if (STATIC_PATTERNS.some((rx) => rx.test(pathname))) return next();
  if (PUBLIC_PAGES.includes(pathname)) return next();

  const activo = await mantenimientoActivo();
  if (!activo) return next();
  const superadmin = await esSuperadmin(req);
  if (superadmin) return next();

  const datos = await datosMantenimiento();
  const url = maintenanceUrl(datos);
  // Redirige a la pantalla amigable con el mensaje y la hora estimada de fin.
  return res.status(503).redirect(url);
}

module.exports = { maintenance, maintenancePage, mantenimientoActivo };
