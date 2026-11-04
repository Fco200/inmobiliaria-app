'use strict';

// Middleware de MODO MANTENIMIENTO.
//
// Solo bloquea en la FASE ACTIVA (mantenimientoActivo=true). Durante la fase de
// cuenta regresiva (enCuentaRegresiva) el sistema sigue funcionando para que los
// usuarios puedan guardar su trabajo; el frontend se encarga de mostrar la
// cuenta regresiva y de cerrar la sesión de Asesores/Operadores.
//
// Cuando el bloqueo está activo, todas las peticiones a la API (excepto el login,
// el estado público de mantenimiento y /health) reciben un código 503 con la
// vista amigable de mantenimiento, salvo que el solicitante sea ADMIN o
// SUPERADMIN, que conservan acceso.

const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { jwtSecret } = require('../config/env');
const maintenanceService = require('../services/maintenance.service');

const CACHE_TTL_MS = 5000;
const PRIVILEGED_ROLES = ['superadmin', 'admin'];
let cache = { value: null, at: 0 };

async function mantenimientoActivo() {
  const now = Date.now();
  if (cache.value !== null && now - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }
  let value = false;
  try {
    value = await maintenanceService.isActive();
  } catch (e) {
    value = false;
  }
  cache = { value, at: now };
  return value;
}

// Devuelve el código de rol del usuario autenticado (o '' si no hay sesión).
async function roleOf(req) {
  const header = req.headers && req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return '';
  const token = header.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, jwtSecret);
  } catch (e) {
    return '';
  }
  try {
    const user = await User.findById(decoded.id).populate('role').select('status').lean();
    if (!user || user.status !== 'activo' || !user.role) return '';
    return user.role.code;
  } catch (e) {
    return '';
  }
}

async function esPrivilegiado(req) {
  const role = await roleOf(req);
  return PRIVILEGED_ROLES.includes(role);
}

// Lee el mensaje y la hora/fecha estimada de fin del mantenimiento.
async function datosMantenimiento() {
  try {
    const datos = await maintenanceService.getDisplayData();
    return { mensaje: datos.mensaje, hasta: datos.hasta };
  } catch (e) {
    return { mensaje: '', hasta: '' };
  }
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
  // MANTENIMIENTO DESACTIVADO. El bloqueo del modo mantenimiento se ha
  // neutralizado: ninguna petición a la API se bloquea, el sistema siempre
  // responde normal. (Se conserva la estructura para poder reactivarlo en el
  // futuro si se desea.)
  return next();
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
  // MANTENIMIENTO DESACTIVADO. No se redirige ningún navegador a la pantalla
  // de mantenimiento: todas las páginas se sirven con normalidad.
  return next();
}

module.exports = { maintenance, maintenancePage, mantenimientoActivo };
