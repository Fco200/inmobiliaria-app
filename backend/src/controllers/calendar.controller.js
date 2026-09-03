'use strict';

/*
 * Calendario interno + integración con Google Calendar.
 *
 * - GET /api/calendar/events?start&end : agrega eventos de citas, tareas,
 *   negocios (etapas/cierres), metas y prospección en un rango de fechas.
 * - OAuth con Google Calendar: se genera una URL de autorización, se intercambia
 *   el code por tokens y se pueden sincronizar eventos al calendario del usuario.
 *
 * Las llamadas a la API de Google se hacen con el módulo nativo https (sin
 * dependencias extra).
 */

const https = require('https');
const jwt = require('jsonwebtoken');

const { Appointment, Task, Business, Goal, ProspectingActivity, Session } = require('../models');
const User = require('../models/user.model');
const { googleCalendarClientId, googleCalendarClientSecret, googleCalendarRedirectUri, clientUrl, jwtSecret } = require('../config/env');
const { hashToken } = require('../services/session.service');

const GOOGLE_TOKEN_URL = 'oauth2.googleapis.com';
const GOOGLE_CALENDAR_URL = 'www.googleapis.com';
const GOOGLE_TOKEN_PATH = '/token';
const GOOGLE_AUTH_PATH = '/o/oauth2/v2/auth';

// Alcances pedidos al usuario: ver y gestionar su calendario + perfil público.
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email';

// Mapa de colores por tipo de evento para el frontend.
const TYPE_META = {
  appointment: { label: 'Cita', color: '#2563eb' },
  task: { label: 'Tarea', color: '#d97706' },
  business: { label: 'Negocio', color: '#7c3aed' },
  goal: { label: 'Meta', color: '#059669' },
  prospecting: { label: 'Prospección', color: '#db2777' },
};

// ---------------------------------------------------------------------------
// Helpers de Google (https nativo)
// ---------------------------------------------------------------------------

function httpsRequest(host, path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: host, path, method: options.method || 'GET', headers: options.headers || {} },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let parsed = null;
          try { parsed = data ? JSON.parse(data) : null; } catch (e) { parsed = data; }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Intercambia un code de autorización por tokens de acceso y refresco.
async function exchangeCodeForTokens(code) {
  const params = new URLSearchParams({
    code,
    client_id: googleCalendarClientId,
    client_secret: googleCalendarClientSecret,
    redirect_uri: googleCalendarRedirectUri,
    grant_type: 'authorization_code',
  });

  const res2 = await new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: GOOGLE_TOKEN_URL, path: GOOGLE_TOKEN_PATH, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      (r) => {
        let data = '';
        r.on('data', (c) => { data += c; });
        r.on('end', () => {
          try { resolve({ status: r.statusCode, body: JSON.parse(data) }); }
          catch (e) { reject(new Error('Respuesta inválida de Google')); }
        });
      }
    );
    req.on('error', reject);
    req.write(params.toString());
    req.end();
  });

  return res2.body;
}

// Renueva el access token usando el refresh token.
async function refreshAccessToken(refreshToken) {
  const params = new URLSearchParams({
    client_id: googleCalendarClientId,
    client_secret: googleCalendarClientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: GOOGLE_TOKEN_URL, path: GOOGLE_TOKEN_PATH, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      (r) => {
        let data = '';
        r.on('data', (c) => { data += c; });
        r.on('end', () => {
          try { resolve({ status: r.statusCode, body: JSON.parse(data) }); }
          catch (e) { reject(new Error('Respuesta inválida de Google')); }
        });
      }
    );
    req.on('error', reject);
    req.write(params.toString());
    req.end();
  });
  if (res.status !== 200 || !res.body || !res.body.access_token) {
    throw new Error('No se pudo renovar el token de Google Calendar.');
  }
  return res.body.access_token;
}

// Obtiene el access token vigente (renovándolo si expiró) y lo guarda.
async function getValidAccessToken(user) {
  const gc = user.googleCalendar || {};
  if (!gc.accessToken) return null;
  const now = new Date();
  if (gc.expiresAt && new Date(gc.expiresAt) > now) {
    return gc.accessToken;
  }
  if (!gc.refreshToken) {
    throw new Error('Sesión de Google Calendar sin token de refresco. Vuelve a conectar.');
  }
  const newToken = await refreshAccessToken(gc.refreshToken);
  await User.updateOne(
    { _id: user._id },
    { 'googleCalendar.accessToken': newToken, 'googleCalendar.expiresAt': new Date(Date.now() + 3600 * 1000) }
  );
  return newToken;
}

// Inserta un evento en el calendario primario del usuario.
async function googleCreateEvent(user, event) {
  const token = await getValidAccessToken(user);
  if (!token) return null;
  const resource = {
    summary: event.summary,
    description: event.description || '',
    start: { dateTime: new Date(event.start).toISOString() },
    end: { dateTime: new Date(event.end).toISOString() },
    ...(event.location ? { location: event.location } : {}),
  };
  const res = await httpsRequest(GOOGLE_CALENDAR_URL, '/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  }, resource);
  if (res.status >= 200 && res.status < 300) return res.body;
  return null;
}

// ---------------------------------------------------------------------------
// Recolección de eventos internos
// ---------------------------------------------------------------------------

function parseISODate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// Normaliza un rango de fechas: empieza a las 00:00 del día inicial y termina
// a las 23:59:59 del día final.
function dateRange(start, end) {
  const s = parseISODate(start);
  const e = parseISODate(end);
  if (!s || !e) return { error: 'Fechas inválidas' };
  const from = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0);
  const to = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59, 999);
  return { from, to };
}

function inRange(d, from, to) {
  const date = parseISODate(d);
  return date ? date >= from && date <= to : false;
}

// Agrega los eventos de un usuario según los módulos.
async function gatherEvents(userId, from, to) {
  const events = [];

  // --- Citas (appointments): su campo `date` es la fecha del evento.
  const appointments = await Appointment.find({
    user: userId,
    date: { $gte: from, $lte: to },
  })
    .populate('client', 'name')
    .populate('property', 'zone city type')
    .lean();

  appointments.forEach((a) => {
    const end = new Date(a.date.getTime() + 60 * 60 * 1000);
    events.push({
      id: `appointment:${a._id}`,
      type: 'appointment',
      sourceId: String(a._id),
      title: ['visita_propiedad', 'oficina', 'firma', 'avaluo', 'seguimiento', 'otro'].includes(a.type)
        ? `Cita ${a.type.replace(/_/g, ' ')}`
        : 'Cita',
      summary: `Cita: ${a.client && a.client.name ? a.client.name : 'Sin cliente'}`,
      description: a.notes || '',
      start: a.date,
      end,
      location: a.place || '',
      status: a.status,
      meta: TYPE_META.appointment,
      client: a.client || null,
      property: a.property || null,
    });
  });

  // --- Tareas (tasks): su campo `date` es la fecha límite.
  const tasks = await Task.find({
    assignedTo: userId,
    date: { $gte: from, $lte: to },
  })
    .populate('client', 'name')
    .lean();
  tasks.forEach((t) => {
    const end = new Date(t.date.getTime() + 60 * 60 * 1000);
    events.push({
      id: `task:${t._id}`,
      type: 'task',
      sourceId: String(t._id),
      title: t.title,
      summary: t.title,
      description: t.description || '',
      start: t.date,
      end,
      location: '',
      status: t.status,
      priority: t.priority,
      meta: TYPE_META.task,
      client: t.client || null,
    });
  });

  // --- Negocios (businesses): se incluyen por sus fechas de cierre y etiquetas
  // de etapa dentro del rango (fechas de inicio/fin y fechas de promesa/cierre).
  const businesses = await Business.find({
    $or: [
      { mainAdvisor: userId },
      { partnerAdvisor: userId },
    ],
  }).populate('buyerClient', 'name').lean();

  businesses.forEach((b) => {
    const candidates = [];
    if (b.startedAt) candidates.push({ label: 'Inicio negocio', date: b.startedAt });
    if (b.closing && b.closing.promiseDate) candidates.push({ label: 'Promesa', date: b.closing.promiseDate });
    if (b.closing && b.closing.closingDate) candidates.push({ label: 'Cierre', date: b.closing.closingDate });
    (b.postSale && b.postSale.followUps || []).forEach((f) => {
      candidates.push({ label: 'Seguimiento postventa', date: f.date });
    });
    candidates
      .filter((c) => inRange(c.date, from, to))
      .forEach((c) => {
        const d = parseISODate(c.date);
        events.push({
          id: `business:${b._id}:${c.label}:${d.getTime()}`,
          type: 'business',
          sourceId: String(b._id),
          title: `${c.label} · ${b.name}`,
          summary: b.name,
          description: `${c.label} de negocio ${b.currentStage || ''}`.trim(),
          start: d,
          end: new Date(d.getTime() + 60 * 60 * 1000),
          location: '',
          status: b.status,
          stage: b.currentStage,
          meta: TYPE_META.business,
          client: b.buyerClient || null,
        });
      });
  });

  // --- Metas (goals): rangos inicio-fin.
  const goals = await Goal.find({
    user: userId,
    $or: [
      { startDate: { $gte: from, $lte: to } },
      { endDate: { $gte: from, $lte: to } },
      { startDate: { $lte: to }, endDate: { $gte: from } },
    ],
  }).lean();

  goals.forEach((g) => {
    const s = parseISODate(g.startDate);
    const e = parseISODate(g.endDate);
    if (!s || !e) return;
    events.push({
      id: `goal:${g._id}`,
      type: 'goal',
      sourceId: String(g._id),
      title: `Meta: ${g.name}`,
      summary: `Meta: ${g.name}`,
      description: g.description || '',
      start: s,
      end: e,
      location: '',
      status: g.status,
      meta: TYPE_META.goal,
    });
  });

  // --- Prospección (prospecting): fecha de la actividad.
  const prospecting = await ProspectingActivity.find({
    user: userId,
    date: { $gte: from, $lte: to },
  }).lean();
  prospecting.forEach((p) => {
    const end = new Date(p.date.getTime() + (p.timeSpent ? p.timeSpent * 60000 : 60 * 60 * 1000));
    events.push({
      id: `prospecting:${p._id}`,
      type: 'prospecting',
      sourceId: String(p._id),
      title: `Prospección: ${p.type}`,
      summary: `Prospección ${p.type}`,
      description: p.observations || '',
      start: p.date,
      end,
      location: p.location || '',
      status: '',
      meta: TYPE_META.prospecting,
    });
  });

  events.sort((a, b) => new Date(a.start) - new Date(b.start));
  return events;
}

// ---------------------------------------------------------------------------
// Handlers de Express
// ---------------------------------------------------------------------------

// GET /api/calendar/events?start&end  → lista agregada de eventos.
const listEvents = async (req, res, next) => {
  try {
    const { from, to } = dateRange(req.query.start, req.query.end);
    if (!from || !to) {
      return res.status(400).json({ success: false, message: 'Parámetros start y end requeridos (ISO).' });
    }
    const events = await gatherEvents(req.user._id, from, to);
    res.json({ success: true, data: { events, types: TYPE_META } });
  } catch (error) {
    next(error);
  }
};

// GET /api/calendar/status  → estado de la integración con Google.
const status = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('+googleCalendar.accessToken +googleCalendar.refreshToken');
    const gc = (user && user.googleCalendar) || {};
    res.json({
      success: true,
      data: {
        configured: Boolean(googleCalendarClientId && googleCalendarClientSecret),
        connected: Boolean(gc.refreshToken),
        syncEnabled: Boolean(gc.syncEnabled),
        email: gc.email || '',
        syncedAt: gc.syncedAt || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/calendar/google/auth-url  → URL para iniciar el OAuth con Google.
const authUrl = async (req, res, next) => {
  try {
    if (!googleCalendarClientId || !googleCalendarClientSecret) {
      return res.status(400).json({
        success: false,
        message: 'La integración con Google Calendar no está configurada. Configura las credenciales en el backend (.env).',
      });
    }
    const redirect = googleCalendarRedirectUri || `${clientUrl || `http://localhost:5000`}/api/calendar/google/callback`;
    const params = new URLSearchParams({
      client_id: googleCalendarClientId,
      redirect_uri: redirect,
      response_type: 'code',
      scope: GOOGLE_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      // El `state` transporta el JWT de sesión: el navegador lo devuelve tras
      // autorizar en Google y sirve para identificar al usuario en el callback
      // (que no puede enviar el header Authorization).
      state: req.token,
    });
    const url = `https://accounts.google.com${GOOGLE_AUTH_PATH}?${params.toString()}`;
    res.json({ success: true, data: { url } });
  } catch (error) {
    next(error);
  }
};

// GET /api/calendar/google/callback?code&error&state  → intercambio de code por
// tokens. Llega sin header Authorization (navegación directa), así que el
// usuario se identifica con el JWT recibido en `state`.
const callback = async (req, res, next) => {
  try {
    const { code, error, state } = req.query;
    if (error) {
      return res.redirect(`/calendar.html?gc=denied`);
    }
    if (!code) {
      return res.status(400).json({ success: false, message: 'Falta el código de autorización.' });
    }
    // Validar el JWT del `state` y la sesión revocable, igual que `protect`.
    let userId = null;
    if (state) {
      try {
        const decoded = jwt.verify(state, jwtSecret);
        userId = decoded && decoded.id;
      } catch (e) {
        userId = null;
      }
    }
    if (!userId) {
      return res.redirect('/calendar.html?gc=session');
    }
    const session = await Session.findOne({ tokenHash: hashToken(state) });
    if (!session) {
      return res.redirect('/calendar.html?gc=session');
    }
    const user = await User.findById(userId).select('+email');
    if (!user || user.status !== 'activo') {
      return res.redirect('/calendar.html?gc=session');
    }

    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      return res.redirect('/calendar.html?gc=error');
    }
    await User.updateOne(
      { _id: user._id },
      {
        'googleCalendar.accessToken': tokens.access_token,
        'googleCalendar.refreshToken': tokens.refresh_token,
        'googleCalendar.scope': tokens.scope || '',
        'googleCalendar.syncEnabled': true,
        'googleCalendar.syncedAt': new Date(),
        'googleCalendar.expiresAt': new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
        'googleCalendar.email': user.email || '',
      }
    );
    res.redirect('/calendar.html?gc=connected');
  } catch (error) {
    next(error);
  }
};

// POST /api/calendar/google/disconnect  → desconecta la integración.
const disconnect = async (req, res, next) => {
  try {
    await User.updateOne(
      { _id: req.user._id },
      {
        'googleCalendar.accessToken': null,
        'googleCalendar.refreshToken': null,
        'googleCalendar.syncEnabled': false,
        'googleCalendar.email': '',
        'googleCalendar.syncedAt': null,
        'googleCalendar.expiresAt': null,
      }
    );
    res.json({ success: true, message: 'Google Calendar desconectado.' });
  } catch (error) {
    next(error);
  }
};

// POST /api/calendar/google/toggle  → habilita/deshabilita la sincronización.
const toggleSync = async (req, res, next) => {
  try {
    const enabled = Boolean(req.body && req.body.enabled);
    await User.updateOne(
      { _id: req.user._id },
      { 'googleCalendar.syncEnabled': enabled }
    );
    res.json({ success: true, data: { syncEnabled: enabled } });
  } catch (error) {
    next(error);
  }
};

// POST /api/calendar/google/sync  → sincroniza todos los eventos del rango
// indicado al Google Calendar del usuario.
const syncToGoogle = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('+googleCalendar.accessToken +googleCalendar.refreshToken');
    const gc = (user && user.googleCalendar) || {};
    if (!gc.refreshToken) {
      return res.status(400).json({ success: false, message: 'Primero conecta tu Google Calendar.' });
    }
    const { from, to } = dateRange(req.body && req.body.start, req.body && req.body.end);
    if (!from || !to) {
      return res.status(400).json({ success: false, message: 'Fechas inválidas.' });
    }
    const events = await gatherEvents(req.user._id, from, to);
    const created = [];
    for (const event of events.slice(0, 50)) {
      // No se envían metas (son rangos largos) por defecto; se omite.
      if (event.type === 'goal') continue;
      // eslint-disable-next-line no-await-in-loop
      const g = await googleCreateEvent(user, {
        summary: event.summary,
        description: event.description,
        start: event.start,
        end: event.end,
        location: event.location,
      });
      if (g) created.push(g.id);
    }
    await User.updateOne(
      { _id: user._id },
      { 'googleCalendar.syncedAt': new Date() }
    );
    res.json({ success: true, data: { synced: created.length } });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listEvents,
  status,
  authUrl,
  callback,
  disconnect,
  toggleSync,
  syncToGoogle,
  gatherEvents,
  googleCreateEvent,
};
