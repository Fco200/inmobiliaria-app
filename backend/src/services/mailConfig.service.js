'use strict';

// Configuracion de correo editable desde el panel de soporte.
//
// En Render (plan gratuito) los puertos SMTP estan bloqueados, por lo que el
// correo debe salir por una API HTTPS. Exigir que el SUPERADMIN entre a Render
// a cambiar variables de entorno es fragil: si no tiene acceso a la cuenta, el
// CRM se queda sin correo. Esta configuracion vive en MongoDB, se cifra con una
// llave derivada de JWT_SECRET y se carga en memoria al arrancar. Cambiarla
// desde el panel surte efecto de inmediato, sin reiniciar el servicio.
//
// Los valores del entorno siguen funcionando como respaldo: si no hay
// configuracion guardada (o esta desactivada), mail.service usa MAIL_PROVIDER,
// BREVO_API_KEY, RESEND_API_KEY, SENDGRID_API_KEY y SMTP_*.

const crypto = require('crypto');
const Config = require('../models/config.model');
const env = require('../config/env');

const CONFIG_KEY = 'mail.config';
const HTTP_PROVIDERS = ['brevo', 'resend', 'sendgrid'];
const ALL_PROVIDERS = [...HTTP_PROVIDERS, 'smtp'];

let runtime = null;
let loaded = false;

function encryptionKey() {
  return crypto
    .createHash('sha256')
    .update(`inmobles-mail-config:${env.jwtSecret || 'dev-secret-change-me'}`)
    .digest();
}

function encryptSecret(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
}

function decryptSecret(payload) {
  const raw = String(payload || '').trim();
  if (!raw) return '';
  const parts = raw.split('.');
  if (parts.length !== 3) return '';
  try {
    const iv = Buffer.from(parts[0], 'base64');
    const tag = Buffer.from(parts[1], 'base64');
    const data = Buffer.from(parts[2], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch (error) {
    console.warn('[MAIL] No se pudo descifrar la clave guardada:', error.message);
    return '';
  }
}

function normalizeProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  return ALL_PROVIDERS.includes(provider) ? provider : '';
}

function mask(value) {
  const text = String(value || '');
  if (!text) return '';
  if (text.length <= 4) return '****';
  return `${'*'.repeat(Math.min(8, text.length - 4))}${text.slice(-4)}`;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function parseAddress(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2].trim() };
  }
  return { name: '', email: raw };
}

/**
 * Carga la configuracion desde MongoDB a memoria. Es idempotente y se llama al
 * arrancar el servidor y despues de cada cambio desde el panel.
 */
async function load() {
  try {
    const doc = await Config.findOne({ key: CONFIG_KEY }).lean();
    const value = doc && doc.value && typeof doc.value === 'object' ? doc.value : null;
    if (!value) {
      runtime = null;
      loaded = true;
      return null;
    }
    const provider = normalizeProvider(value.provider);
    const apiKey = provider === 'smtp' ? '' : decryptSecret(value.apiKey || value.apiKeyEnc || '');
    runtime = {
      provider,
      apiKey,
      senderEmail: normalizeEmail(value.senderEmail),
      senderName: String(value.senderName || '').trim(),
      replyTo: normalizeEmail(value.replyTo),
      enabled: value.enabled !== false,
    };
    loaded = true;
    return runtime;
  } catch (error) {
    // Si Mongo no esta disponible al arrancar, no se rompe el servidor: se usa
    // el entorno hasta que se pueda cargar de nuevo.
    console.warn('[MAIL] No se pudo cargar la configuracion guardada:', error.message);
    loaded = true;
    return runtime;
  }
}

/** Devuelve la configuracion activa (sincrona). */
function get() {
  return runtime;
}

function isLoaded() {
  return loaded;
}

/** Hay una configuracion del panel activa y utilizable. */
function isActive() {
  if (!runtime || runtime.enabled === false) return false;
  if (!runtime.provider) return false;
  if (runtime.provider === 'smtp') return false; // SMTP se toma del entorno.
  // Sin remitente verificado el proveedor rechazaría el envío: se prefiere
  // caer al respaldo del entorno antes que intentar con datos incompletos.
  return Boolean(runtime.apiKey && runtime.senderEmail);
}

/** Describe la configuracion sin exponer la clave completa. */
function describe() {
  const active = isActive();
  return {
    provider: runtime && runtime.provider ? runtime.provider : '',
    senderEmail: runtime && runtime.senderEmail ? runtime.senderEmail : '',
    senderName: runtime && runtime.senderName ? runtime.senderName : '',
    replyTo: runtime && runtime.replyTo ? runtime.replyTo : '',
    enabled: Boolean(runtime && runtime.enabled !== false),
    hasApiKey: Boolean(runtime && runtime.apiKey),
    apiKeyPreview: runtime && runtime.apiKey ? mask(runtime.apiKey) : '',
    source: active ? 'panel' : 'env',
    active,
  };
}

/**
 * Guarda la configuracion. Si apiKey viene vacia y el proveedor no cambio, se
 * conserva la clave existente (el panel nunca devuelve la clave real).
 */
async function save(input, user) {
  const body = input || {};
  const provider = normalizeProvider(body.provider);
  if (!provider) {
    throw Object.assign(new Error('Selecciona un proveedor de correo valido (Brevo, Resend o SendGrid).'), { status: 400 });
  }
  if (provider === 'smtp') {
    throw Object.assign(new Error('SMTP no funciona en Render. Elige Brevo, Resend o SendGrid para enviar por HTTPS.'), { status: 400 });
  }

  const senderEmail = normalizeEmail(body.senderEmail);
  if (!isEmail(senderEmail)) {
    throw Object.assign(new Error('Escribe el correo remitente verificado en el proveedor.'), { status: 400 });
  }

  const senderName = String(body.senderName || '').trim().slice(0, 120);
  const replyTo = normalizeEmail(body.replyTo);
  if (replyTo && !isEmail(replyTo)) {
    throw Object.assign(new Error('El correo de respuesta no es valido.'), { status: 400 });
  }

  let apiKey = String(body.apiKey || '').trim();
  if (!apiKey && runtime && runtime.provider === provider && runtime.apiKey) {
    apiKey = runtime.apiKey;
  }
  if (!apiKey) {
    throw Object.assign(new Error('Escribe la clave API del proveedor de correo.'), { status: 400 });
  }

  const value = {
    provider,
    apiKey: encryptSecret(apiKey),
    senderEmail,
    senderName,
    replyTo,
    enabled: body.enabled !== false,
  };

  await Config.findOneAndUpdate(
    { key: CONFIG_KEY },
    {
      value,
      group: 'correo',
      description: 'Proveedor HTTPS de correo configurado desde el panel de soporte',
      updatedBy: user && user._id ? user._id : null,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  runtime = { provider, apiKey, senderEmail, senderName, replyTo, enabled: value.enabled };
  loaded = true;

  // La configuracion cambio: cualquier error/estado anterior del SMTP ya no
  // aplica y se debe permitir un nuevo intento inmediato.
  try {
    require('./mail.service').resetTransporter();
  } catch (error) {
    /* mail.service puede no estar cargado aun; no es un error fatal. */
  }

  return describe();
}

/** Elimina la configuracion guardada y vuelve al respaldo del entorno. */
async function reset(user) {
  await Config.deleteOne({ key: CONFIG_KEY });
  runtime = null;
  loaded = true;
  try {
    require('./mail.service').resetTransporter();
  } catch (error) {
    /* ignore */
  }
  return describe();
}

/** Aplica una configuracion en memoria (util para pruebas). */
function setRuntime(value) {
  if (!value) {
    runtime = null;
    loaded = true;
    return runtime;
  }
  runtime = {
    provider: normalizeProvider(value.provider),
    apiKey: String(value.apiKey || ''),
    senderEmail: normalizeEmail(value.senderEmail),
    senderName: String(value.senderName || '').trim(),
    replyTo: normalizeEmail(value.replyTo),
    enabled: value.enabled !== false,
  };
  loaded = true;
  return runtime;
}

module.exports = {
  CONFIG_KEY,
  HTTP_PROVIDERS,
  ALL_PROVIDERS,
  load,
  get,
  isLoaded,
  isActive,
  describe,
  save,
  reset,
  setRuntime,
  mask,
  isEmail,
  parseAddress,
};
