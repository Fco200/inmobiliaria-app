'use strict';

// Servicio de correo saliente (newsletter, bienvenidas, avisos de propiedades).
// Si no hay credenciales SMTP en el entorno, opera en modo "dry-run": registra
// el correo en consola y NO falla, para que la app siga funcionando en
// desarrollo. En cuanto se configuren SMTP_HOST/USER/PASS los correos se
// envían de verdad.

const nodemailer = require('nodemailer');
const env = require('../config/env');
const mailConfig = require('./mailConfig.service');

// El correo se puede enviar por SMTP o por una API HTTPS. En Render (plan
// gratuito) los puertos SMTP 25, 465 y 587 estan bloqueados: el correo se
// queda "colgado" hasta el timeout y nunca llega. Con una API HTTPS si sale.
const HTTP_TIMEOUT_MS = 12000;
const PROVIDERS = ['smtp', 'resend', 'brevo', 'sendgrid'];

let transporter = null;
let lastError = '';
let lastErrorAt = null;
let lastSuccessAt = null;
// Si un SMTP no conecta (p. ej. Render gratuito bloquea los puertos), se deja
// de intentar unos minutos para que los botones respondan al instante.
let smtpBlockedUntil = 0;

function resolveProvider() {
  // 1) Configuracion guardada desde el panel de soporte (tiene prioridad).
  const saved = mailConfig.get();
  if (mailConfig.isActive() && saved && PROVIDERS.includes(saved.provider)) {
    return saved.provider;
  }
  // 2) Variables de entorno (Render u otros entornos).
  const explicit = String(process.env.MAIL_PROVIDER || '').trim().toLowerCase();
  if (PROVIDERS.includes(explicit)) return explicit;
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.BREVO_API_KEY) return 'brevo';
  if (process.env.SENDGRID_API_KEY) return 'sendgrid';
  return 'smtp';
}

function providerKey(provider) {
  // La clave del panel solo aplica al proveedor que el propio panel eligio.
  const saved = mailConfig.get();
  if (mailConfig.isActive() && saved && saved.provider === provider && saved.apiKey) {
    return saved.apiKey;
  }
  return {
    resend: process.env.RESEND_API_KEY,
    brevo: process.env.BREVO_API_KEY,
    sendgrid: process.env.SENDGRID_API_KEY,
  }[provider] || '';
}

// Origen del proveedor activo, para mostrarlo en el panel.
function providerSource() {
  return mailConfig.isActive() ? 'panel' : 'env';
}

function isConfigured() {
  const provider = resolveProvider();
  if (provider === 'smtp') return Boolean(env.smtpHost && env.smtpUser && env.smtpPass);
  return Boolean(providerKey(provider));
}

// Se conserva el nombre hasSmtp porque el resto del sistema ya lo usa para
// preguntar "hay correo configurado". Ahora tambien cuenta una API HTTPS.
function hasSmtp() {
  return isConfigured();
}
const hasMailer = hasSmtp;

function mailStatus() {
  const provider = resolveProvider();
  const configured = isConfigured();
  const sender = resolveSender();
  const source = providerSource();
  const smtpBlocked = provider === 'smtp' && (env.isProduction || Boolean(process.env.RENDER));
  const status = {
    provider,
    source,
    panel: mailConfig.describe(),
    configured,
    blocked: Boolean(configured && smtpBlocked),
    simulated: !configured,
    from: sender.from,
    replyTo: sender.replyTo || '',
    lastError,
    lastErrorAt,
    lastSuccessAt,
    hint: '',
  };

  if (!configured) {
    status.hint = 'Aun no hay proveedor de correo. Configura Brevo, Resend o SendGrid desde el panel de soporte para activar los envios reales.';
  } else if (smtpBlocked) {
    status.hint = 'Render bloquea los puertos SMTP (25, 465, 587). Configura Brevo, Resend o SendGrid desde el panel de soporte para enviar por HTTPS.';
  } else if (source === 'panel') {
    status.hint = 'El correo usa la configuracion guardada desde el panel de soporte.';
  }

  return status;
}

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: { user: env.smtpUser, pass: env.smtpPass },
    // Sin limites, un SMTP bloqueado deja la peticion colgada hasta 2 minutos.
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 15000,
  });
  return transporter;
}

// Refresca el transport si la configuracion cambio en caliente (env var).
function resetTransporter() {
  transporter = null;
  lastError = '';
  lastErrorAt = null;
  smtpBlockedUntil = 0;
}

function parseAddress(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2].trim() };
  }
  return { name: '', email: raw };
}

// Gmail solo acepta como remitente la cuenta autenticada (o un alias verificado).
// Si MAIL_FROM usa otro dominio, se envia desde la cuenta SMTP y la direccion
// configurada queda como "responder a". Con APIs HTTPS el remitente debe estar
// verificado en el proveedor, asi que se usa MAIL_FROM tal cual.
function resolveSender() {
  let from = String(env.mailFrom || 'INMOBLES <no-responder@inmobles.com>');
  const replyTo = String(process.env.MAIL_REPLY_TO || '').trim() || undefined;

  // La configuracion del panel incluye un remitente verificado en el
  // proveedor. Se usa tal cual para que Brevo/Resend/SendGrid acepten el envio.
  const saved = mailConfig.get();
  if (mailConfig.isActive() && saved && saved.senderEmail) {
    const fallbackName = parseAddress(from).name || 'INMOBLES';
    const name = saved.senderName || fallbackName;
    return {
      from: `${name} <${saved.senderEmail}>`,
      replyTo: saved.replyTo || replyTo,
    };
  }

  if (resolveProvider() !== 'smtp') {
    // Cada proveedor exige un remitente verificado. Si el dominio de MAIL_FROM
    // no esta verificado, BREVO_SENDER_EMAIL / RESEND_FROM / SENDGRID_FROM
    // permiten usar la cuenta verificada sin cambiar el nombre visible.
    const provider = resolveProvider();
    const override = {
      brevo: process.env.BREVO_SENDER_EMAIL || process.env.SMTP_USER,
      resend: process.env.RESEND_FROM,
      sendgrid: process.env.SENDGRID_FROM,
    }[provider];
    if (override && String(override).trim()) {
      const name = parseAddress(from).name || 'INMOBLES';
      from = `${name} <${String(override).trim()}>`;
    }
    return { from, replyTo };
  }

  const addr = parseAddress(from).email;
  const fromDomain = (addr.split('@')[1] || '').toLowerCase();
  const smtpDomain = (String(env.smtpUser || '').split('@')[1] || '').toLowerCase();
  const isGmail = smtpDomain === 'gmail.com' || smtpDomain === 'googlemail.com';
  if (isGmail && fromDomain && fromDomain !== smtpDomain) {
    const name = from.includes('<') ? from.split('<')[0].trim() : 'INMOBLES';
    return { from: `${name || 'INMOBLES'} <${env.smtpUser}>`, replyTo: addr };
  }
  return { from, replyTo };
}

async function postJson(url, headers, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      let detail = text;
      try {
        const parsed = JSON.parse(text);
        detail = parsed.message
          || (parsed.error && parsed.error.message)
          || (Array.isArray(parsed.errors) && parsed.errors[0] && parsed.errors[0].message)
          || text;
      } catch (ignored) { /* respuesta no JSON */ }
      throw new Error(`HTTP ${response.status}: ${String(detail || '').slice(0, 300)}`);
    }
    return text;
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error('El proveedor de correo no respondio a tiempo.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// Envia por API HTTPS (puerto 443). Es la via que funciona en Render.
async function sendViaHttp(message) {
  const provider = resolveProvider();
  const key = providerKey(provider);
  const from = parseAddress(message.from);
  const reply = message.replyTo ? parseAddress(message.replyTo).email : undefined;
  const text = message.text || '';
  const html = message.html || text;

  if (provider === 'resend') {
    const payload = {
      from: from.name ? `${from.name} <${from.email}>` : from.email,
      to: [message.to],
      subject: message.subject,
      text,
      html,
    };
    if (reply) payload.reply_to = reply;
    await postJson('https://api.resend.com/emails', { Authorization: `Bearer ${key}` }, payload);
    return;
  }

  if (provider === 'brevo') {
    const payload = {
      sender: { email: from.email, name: from.name || 'INMOBLES' },
      to: [{ email: message.to }],
      subject: message.subject,
      htmlContent: html,
      textContent: text,
    };
    if (reply) payload.replyTo = { email: reply };
    await postJson('https://api.brevo.com/v3/smtp/email', { 'api-key': key, Accept: 'application/json' }, payload);
    return;
  }

  if (provider === 'sendgrid') {
    const payload = {
      personalizations: [{ to: [{ email: message.to }] }],
      from: { email: from.email, name: from.name || 'INMOBLES' },
      subject: message.subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html },
      ],
    };
    if (reply) payload.reply_to = { email: reply };
    await postJson('https://api.sendgrid.com/v3/mail/send', { Authorization: `Bearer ${key}` }, payload);
    return;
  }

  throw new Error(`Proveedor de correo no soportado: ${provider}`);
}

/**
 * Envia un correo y devuelve el detalle del intento.
 * @returns {Promise<{sent:boolean, simulated:boolean, provider:string, configured:boolean, to:string, error?:string}>}
 */
async function sendMailDetailed(opts = {}) {
  const to = String(opts.to || '').trim();
  const provider = resolveProvider();
  const configured = isConfigured();
  const result = { sent: false, simulated: false, provider, configured, to };

  if (!to) return { ...result, error: 'Destinatario vacio.' };

  const sender = resolveSender();
  const message = {
    from: sender.from,
    replyTo: sender.replyTo,
    to,
    subject: opts.subject || '(sin asunto)',
    text: opts.text || '',
    html: opts.html || opts.text || '',
  };

  // Sin proveedor: se simula para no romper el flujo en desarrollo.
  if (!configured) {
    console.log(
      `[MAIL simulado] Para: ${to}\n  Asunto: ${message.subject}\n  ${(message.text || '').slice(0, 300)}`
    );
    return { ...result, sent: true, simulated: true };
  }

  // Circuito para SMTP: si hace poco que no conecto, no se vuelve a esperar.
  if (provider === 'smtp' && Date.now() < smtpBlockedUntil) {
    const messageText = 'El servidor SMTP no responde (en Render los puertos 25/465/587 estan bloqueados). Configura BREVO_API_KEY o RESEND_API_KEY/SENDGRID_API_KEY para enviar por HTTPS.';
    return { ...result, sent: false, error: lastError || messageText };
  }

  try {
    if (provider === 'smtp') {
      const info = await getTransporter().sendMail(message);
      if (info && Array.isArray(info.rejected) && info.rejected.length) {
        throw new Error(`Destinatario rechazado por el servidor: ${to}`);
      }
    } else {
      await sendViaHttp(message);
    }
    lastSuccessAt = new Date();
    lastError = '';
    lastErrorAt = null;
    return { ...result, sent: true };
  } catch (error) {
    lastError = error && error.message ? error.message : String(error);
    lastErrorAt = new Date();
    if (provider === 'smtp') {
      // Si el puerto esta bloqueado, no reintentar en cada clic durante 10 min.
      smtpBlockedUntil = Date.now() + 10 * 60 * 1000;
      if (process.env.RENDER || env.isProduction) {
        lastError = `${lastError}. En Render los puertos SMTP 25/465/587 estan bloqueados: configura BREVO_API_KEY (o RESEND_API_KEY/SENDGRID_API_KEY) para enviar por HTTPS.`;
      }
    }
    console.error('[MAIL] Error al enviar correo a', to, ':', lastError);
    return { ...result, sent: false, error: lastError };
  }
}

async function sendMail(opts = {}) {
  return (await sendMailDetailed(opts)).sent;
}

// Correo de prueba para comprobar la configuracion desde el CRM.
async function sendTestMail(to) {
  const email = String(to || '').trim();
  const subject = 'Prueba de correo de INMOBLES';
  const text = 'Este es un correo de prueba del CRM INMOBLES. Si lo recibes, el envio de correo esta funcionando correctamente.';
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #eadfc0;border-radius:12px;">
      <h2 style="color:#2d1048;margin:0 0 12px;">Prueba de correo</h2>
      <p style="font-size:14px;color:#333;line-height:1.6;">Este es un correo de prueba del <strong>CRM INMOBLES</strong>.</p>
      <p style="font-size:14px;color:#333;line-height:1.6;">Si lo recibes, el envio de correo esta funcionando correctamente.</p>
    </div>`;
  return sendMailDetailed({ to: email, subject, text, html });
}

// Envia con un limite de tiempo: ninguna peticion HTTP debe quedar colgada
// esperando a un SMTP bloqueado o a un proveedor lento.
async function sendMailWithin(opts, ms = 10000) {
  const fallback = {
    sent: false,
    simulated: false,
    provider: resolveProvider(),
    configured: isConfigured(),
    to: String((opts && opts.to) || ''),
    error: 'Tiempo de espera agotado al enviar el correo.',
  };
  let timer = null;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms); });
  try {
    return await Promise.race([sendMailDetailed(opts), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// El diagnóstico de arranque se hace en server.js, después de cargar la
// configuración guardada desde el panel de soporte. Así no se reporta "modo
// simulado" cuando el proveedor está configurado en MongoDB.

const escapeHtml = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function wrapLayout(title, innerHtml) {
  return `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #eadfc0;">
      <div style="background:#2d1048;padding:22px 24px;border-top:4px solid #b9912f;">
        <div style="font-size:20px;font-weight:700;color:#fff;">INMOBLES</div>
        <div style="font-size:11px;color:#e8d28a;letter-spacing:.12em;text-transform:uppercase;">Profesionales en Negocios Inmobiliarios</div>
      </div>
      <div style="padding:24px;">
        <h2 style="color:#2d1048;margin:0 0 14px;font-size:19px;">${escapeHtml(title)}</h2>
        ${innerHtml}
      </div>
      <div style="background:#faf7ee;padding:16px 24px;font-size:11px;color:#8a8a8a;">
        INMOBLES &middot; inmobles.com &middot; Este correo fue enviado porque te suscribiste a nuestras promociones.
      </div>
    </div>
  `;
}

// Correo de bienvenida al suscribirse al newsletter.
function mailWelcome(email, name) {
  const saludo = name ? `Hola, ${escapeHtml(name)}. ` : 'Hola. ';
  const subject = '¡Bienvenido a INMOBLES!';
  const inner = `
    <p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#333;">${saludo}Gracias por suscribirte a nuestro newsletter.</p>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#333;">A partir de ahora recibirás novedades inmobiliarias: propiedades recién publicadas, precios y promociones antes que nadie.</p>
    <div style="background:#faf7ee;border:1px solid #eadfc0;border-radius:8px;padding:14px 16px;font-size:13px;color:#555;">
      Si en algún momento deseas dejar de recibir avisos, solo contáctanos y te damos de baja.
    </div>
    <p style="margin:18px 0 0;font-size:13px;color:#333;"><a href="https://inmobles.com/propiedades.html" style="background:#b9912f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;">Ver catálogo de propiedades</a></p>
  `;
  return {
    to: email,
    subject,
    text: `${saludo} Gracias por suscribirte a INMOBLES. Recibirás propiedades recién publicadas, precios y promociones.`,
    html: wrapLayout(subject, inner),
  };
}

// Correo para anunciar una propiedad nueva a todos los suscriptores.
function mailNewProperty(property) {
  const place = [property.zone, property.city].filter(Boolean).join(', ') || 'sin ubicación';
  const price = Number(property.price) || 0;
  const priceText = price ? `$${price.toLocaleString('es-MX')}` : 'Precio a consultar';
  const subject = `Nueva ${property.type || 'propiedad'} publicada · ${place}`;
  const inner = `
    <p style="margin:0 0 14px;font-size:14px;color:#333;">En INMOBLES acabamos de publicar una propiedad que puede interesarte:</p>
    <div style="background:#faf7ee;border:1px solid #eadfc0;border-radius:8px;padding:16px 18px;font-size:14px;color:#2d1048;">
      <div style="font-weight:700;font-size:16px;margin-bottom:6px;">${escapeHtml(property.type || 'Propiedad')} en ${escapeHtml(place)}</div>
      <div style="color:#555;margin-bottom:4px;">Operación: ${escapeHtml(property.operationType || 'venta')}</div>
      <div style="font-size:16px;color:#2d1048;font-weight:700;">${priceText}</div>
    </div>
    <p style="margin:18px 0 0;font-size:13px;color:#333;"><a href="https://inmobles.com/propiedades.html?propId=${encodeURIComponent(property._id)}" style="background:#b9912f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;">Ver la propiedad</a></p>
  `;
  return {
    subject,
    html: wrapLayout(subject, inner),
    text: `Nueva ${property.type || 'propiedad'} en ${place}. ${priceText}. Mírala en https://inmobles.com/propiedades.html`,
  };
}

// Aviso al ASESOR RESPONSABLE cuando él mismo (o su equipo) publica la
// propiedad en el inventario general. Es el correo "espejo" del newsletter de
// suscriptores: mientras el suscriptor recibe la promoción, el asesor recibe
// la confirmación de que su propiedad ya está compartida, con un resumen de
// los datos clave y de cuántos clientes interesados fueron avisados.
function mailPropertyPublishedToAdvisor(property, opts = {}) {
  const place = [property.zone, property.city, property.state].filter(Boolean).join(', ') || 'sin ubicación';
  const price = Number(property.price) || 0;
  const priceText = price ? `$${price.toLocaleString('es-MX')}` : 'Precio a consultar';
  const folio = property.folio ? ` (${property.folio})` : '';
  const advisorName = opts.advisorName ? String(opts.advisorName) : '';
  const interesados = Number(opts.interestedClients) || 0;
  const fotos = Array.isArray(property.photos) ? property.photos.length : 0;

  const subject = `Propiedad publicada${folio} · ${place}`;
  const inner = `
    <p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#333;">${advisorName ? `Hola, ${escapeHtml(advisorName)}. ` : 'Hola. '}Tu propiedad ya quedó <strong>publicada en el inventario general</strong> y es visible para todo el equipo.</p>
    <div style="background:#faf7ee;border:1px solid #eadfc0;border-radius:8px;padding:16px 18px;font-size:14px;color:#2d1048;">
      <div style="font-weight:700;font-size:16px;margin-bottom:8px;">${escapeHtml(property.type || 'Propiedad')} en ${escapeHtml(place)}${escapeHtml(folio)}</div>
      <div style="color:#555;margin-bottom:4px;">Operación: ${escapeHtml(property.operationType || 'venta')}</div>
      <div style="color:#555;margin-bottom:4px;">Estado: ${escapeHtml(String(property.status || 'disponible').replace(/_/g, ' '))}</div>
      <div style="color:#555;margin-bottom:4px;">Fotografías: ${fotos}</div>
      <div style="font-size:16px;color:#2d1048;font-weight:700;margin-top:6px;">${priceText}</div>
    </div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 14px;font-size:13px;color:#166534;margin-top:14px;">
      ${interesados
        ? `Se avisó a <strong>${interesados}</strong> ${interesados === 1 ? 'cliente interesado' : 'clientes interesados'} cuyo perfil coincide con esta propiedad.`
        : 'Por ahora no hubo clientes interesados cuyo perfil coincida con esta propiedad.'}
    </div>
    <p style="margin:18px 0 0;font-size:13px;color:#333;"><a href="https://inmobles.com/propiedades.html?propId=${encodeURIComponent(property._id)}" style="background:#b9912f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;">Ver mi propiedad</a></p>
  `;
  return {
    subject,
    html: wrapLayout(subject, inner),
    text: `Tu propiedad${folio} en ${place} quedó publicada. ${priceText}. ${interesados ? `Se avisó a ${interesados} clientes interesados.` : 'Sin clientes interesados por ahora.'}`,
  };
}

// Aviso al asesor cuando NO se pudo generar algo de su propiedad, o cuando el
// proceso de publicación se completó sin poder enviar el correo. Se usa para
// que los procesos "queden limpios": si algo falla, el asesor se entera.
function mailPropertyProcessNotice(property, opts = {}) {
  const advisorName = opts.advisorName ? String(opts.advisorName) : '';
  const place = [property.zone, property.city].filter(Boolean).join(', ') || 'sin ubicación';
  const folio = property.folio ? ` (${property.folio})` : '';
  const subject = opts.subject || `Aviso sobre tu propiedad${folio}`;
  const inner = `
    <p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#333;">${advisorName ? `Hola, ${escapeHtml(advisorName)}. ` : 'Hola. '}${escapeHtml(opts.message || 'Ocurrió un detalle al procesar tu propiedad.')}</p>
    <div style="background:#faf7ee;border:1px solid #eadfc0;border-radius:8px;padding:14px 16px;font-size:13px;color:#2d1048;">
      <div style="font-weight:700;margin-bottom:4px;">${escapeHtml(property.type || 'Propiedad')} en ${escapeHtml(place)}${escapeHtml(folio)}</div>
      ${opts.detail ? `<div style="color:#555;">${escapeHtml(opts.detail)}</div>` : ''}
    </div>
  `;
  return {
    subject,
    html: wrapLayout(subject, inner),
    text: `${opts.message || 'Detalle al procesar la propiedad'} — ${property.type || 'Propiedad'} en ${place}${folio}`,
  };
}

function frontendUrl() {
  return String(process.env.FRONTEND_URL || 'https://crm.inmobles.com').replace(/\/+$/, '');
}

// Correo de confirmación de solicitud de acceso al CRM. Incluye las credenciales
// temporales generadas al aprobar la solicitud para que la persona pueda entrar
// sin depender de que un administrador se las envíe por otro canal.
function mailAccessRequestApproved({ name, email, username, password }) {
  const subject = 'Tu acceso al CRM ha sido habilitado';
  const loginUrl = `${frontendUrl()}/index.html`;
  const hasCredentials = Boolean(username && password);
  const credentials = hasCredentials
    ? `
    <div style="background:#faf7ee;border:1px solid #eadfc0;border-radius:8px;padding:16px 18px;font-size:14px;color:#2d1048;margin:0 0 14px;">
      <div style="font-weight:700;margin-bottom:8px;">Tus datos de acceso</div>
      <div style="margin-bottom:4px;"><strong>Usuario:</strong> ${escapeHtml(username)}</div>
      <div style="margin-bottom:4px;"><strong>Contraseña temporal:</strong> ${escapeHtml(password)}</div>
      <div style="color:#555;font-size:12px;margin-top:8px;">Por seguridad, cambia esta contraseña en tu primer inicio de sesión.</div>
    </div>`
    : `
    <p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#333;">Tu cuenta ya existía en el sistema. Usa tu usuario y contraseña habituales para ingresar.</p>`;

  const inner = `
    <p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#333;">Hola ${escapeHtml(name || '')},</p>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#333;">Tu solicitud de acceso al CRM INMOBLES ha sido aprobada y tu cuenta ya está habilitada.</p>
    ${credentials}
    <p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#333;">Puedes ingresar desde: <a href="${loginUrl}">${loginUrl}</a></p>
    ${hasCredentials ? '<p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#333;">Al entrar, ve a <strong>Mi perfil &rarr; Seguridad</strong> y cambia tu contraseña temporal.</p>' : ''}
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 14px;font-size:13px;color:#9a3412;">
      Si no solicitaste este acceso, ignora este correo y avisa al administrador del sistema.
    </div>
  `;
  const text = hasCredentials
    ? `Hola ${name || ''}, tu acceso al CRM INMOBLES fue aprobado.\n\nUsuario: ${username}\nContraseña temporal: ${password}\n\nIngresa en ${loginUrl} y cambia tu contraseña en Mi perfil > Seguridad.`
    : `Hola ${name || ''}, tu solicitud de acceso fue aprobada. Tu cuenta ya existía; ingresa en ${loginUrl} con tu usuario y contraseña habituales.`;
  return {
    to: email,
    subject,
    html: wrapLayout(subject, inner),
    text,
  };
}

// Correo de campaña del boletín. El mensaje se recibe como texto plano y se
// convierte a HTML seguro: se escapan etiquetas y se respetan los saltos de
// línea. Se envía uno por destinatario (no con copia oculta masiva) para no
// exponer las direcciones del resto de suscriptores.
function mailNewsletterCampaign({ email, name, subject, message, intro }) {
  const safeSubject = String(subject || 'Novedades de INMOBLES').trim();
  const safeMessage = String(message || '').trim();
  const paragraphs = safeMessage
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#333;">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');

  const inner = `
    <p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#333;">${name ? `Hola, ${escapeHtml(name)}. ` : 'Hola. '}${escapeHtml(intro || 'Compartimos contigo estas novedades de INMOBLES:')}</p>
    ${paragraphs || '<p style="margin:0 0 14px;font-size:14px;color:#333;">(Sin contenido adicional)</p>'}
    <p style="margin:18px 0 0;font-size:13px;color:#333;"><a href="${frontendUrl()}/propiedades.html" style="background:#b9912f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;">Ver catálogo de propiedades</a></p>
    <p style="margin:18px 0 0;font-size:11px;color:#8a8a8a;">Recibes este correo porque estás suscrito al boletín de INMOBLES. Si deseas darte de baja, responde a este correo con la palabra BAJA.</p>
  `;

  return {
    to: email,
    subject: safeSubject,
    html: wrapLayout(safeSubject, inner),
    text: `${name ? `Hola, ${name}. ` : 'Hola. '}${intro || 'Compartimos contigo estas novedades de INMOBLES:'}\n\n${safeMessage}\n\nVer propiedades: ${frontendUrl()}/propiedades.html\n\nPara darte de baja responde a este correo con la palabra BAJA.`,
  };
}

// Correo con el código de 6 dígitos para restablecer la contraseña.
function mailPasswordResetCode({ name, email, code }) {
  const subject = 'Tu código para restablecer la contraseña';
  const inner = `
    <p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#333;">Hola ${escapeHtml(name || '')},</p>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#333;">Recibimos una solicitud para restablecer la contraseña de tu cuenta del CRM. Usa este código:</p>
    <div style="text-align:center;margin:18px 0;font-size:30px;font-weight:700;letter-spacing:8px;color:#2d1048;">${escapeHtml(code)}</div>
    <p style="margin:0 0 14px;font-size:13px;line-height:1.65;color:#555;">El código vence en 15 minutos y solo puede usarse una vez.</p>
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 14px;font-size:13px;color:#9a3412;">
      Si no solicitaste este cambio, ignora este correo: tu contraseña no cambiará.
    </div>`;
  return {
    to: email,
    subject,
    html: wrapLayout(subject, inner),
    text: `Hola ${name || ''}. Tu código para restablecer la contraseña es: ${code}. Vence en 15 minutos. Si no lo solicitaste, ignora este correo.`,
  };
}

module.exports = {
  mailPasswordResetCode,
  sendMail,
  sendMailDetailed,
  sendMailWithin,
  sendTestMail,
  mailStatus,
  resolveProvider,
  hasMailer,
  resetTransporter,
  mailWelcome,
  mailNewProperty,
  mailPropertyPublishedToAdvisor,
  mailPropertyProcessNotice,
  mailAccessRequestApproved,
  mailNewsletterCampaign,
  hasSmtp,
};