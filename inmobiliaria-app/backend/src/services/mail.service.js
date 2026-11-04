'use strict';

// Servicio de correo saliente (newsletter, bienvenidas, avisos de propiedades).
// Si no hay credenciales SMTP en el entorno, opera en modo "dry-run": registra
// el correo en consola y NO falla, para que la app siga funcionando en
// desarrollo. En cuanto se configuren SMTP_HOST/USER/PASS los correos se
// envían de verdad.

const nodemailer = require('nodemailer');
const env = require('../config/env');

let transporter = null;
let failedPermanent = false;

function hasSmtp() {
  return Boolean(env.smtpHost && env.smtpUser && env.smtpPass);
}

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: { user: env.smtpUser, pass: env.smtpPass },
  });
  return transporter;
}

// Refresca el transport si la configuración cambió en caliente (env var).
function resetTransporter() {
  transporter = null;
  failedPermanent = false;
}

/**
 * Envía un correo de texto simple.
 * @param {Object} opts { to, subject, html, text }
 * @returns {Promise<boolean>} true si se consideró entregado.
 */
async function sendMail(opts = {}) {
  const to = String(opts.to || '').trim();
  if (!to) return false;

  const message = {
    from: env.mailFrom,
    to,
    subject: opts.subject || '(sin asunto)',
    text: opts.text || '',
    html: opts.html || opts.text || '',
  };

  // Sin SMTP: simulamos el envío para no romper el flujo.
  if (!hasSmtp()) {
    console.log(
      `[MAIL dry-run] Para: ${to}\n  Asunto: ${message.subject}\n  ${(message.text || '').slice(0, 300)}`
    );
    return true;
  }

  try {
    await getTransporter().sendMail(message);
    return true;
  } catch (error) {
    // Si la credencial falla de forma permanente, deja de intentar para no
    // saturar la cola; el resto sigue operando normal.
    if (error && error.responseCode >= 500) {
      failedPermanent = true;
    }
    console.error('[MAIL] Error al enviar correo a', to, ':', error.message);
    return false;
  }
}

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

// Correo de confirmación de solicitud de acceso al CRM.
function mailAccessRequestApproved({ name, email }) {
  const subject = 'Tu acceso al CRM ha sido habilitado';
  const inner = `
    <p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#333;">Hola ${escapeHtml(name || '')},</p>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#333;">Tu solicitud de acceso al CRM INMOBLES ha sido aprobada y tu cuenta ya está habilitada.</p>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#333;">Puedes ingresar desde: <a href="${(process.env.FRONTEND_URL || 'https://crm.inmobles.com')}/index.html">${(process.env.FRONTEND_URL || 'https://crm.inmobles.com')}/index.html</a></p>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#333;">Te recomendamos cambiar tu contraseña al primer inicio de sesión.</p>
  `;
  return {
    to: email,
    subject,
    html: wrapLayout(subject, inner),
    text: `Hola ${name || ''}, tu acceso ha sido habilitado. Ingresa a ${(process.env.FRONTEND_URL || 'https://crm.inmobles.com')}/index.html. Cambia tu contraseña al primer ingreso.`,
  };
}

module.exports = {
  sendMail,
  resetTransporter,
  mailWelcome,
  mailNewProperty,
  mailPropertyPublishedToAdvisor,
  mailPropertyProcessNotice,
  mailAccessRequestApproved,
  hasSmtp,
};