'use strict';

const crypto = require('crypto');
const asyncHandler = require('../middlewares/asyncHandler');
const { Setting } = require('../models');
const { logAudit } = require('../services/log.service');

const ROLE_KEY_SETTING = 'ROLE_REGISTER_KEY';
const GOOGLE_SETTING = 'GOOGLE_CLIENT_ID';
const WHATSAPP_SETTING = 'whatsapp.number';
const COUNTRY_CODE_SETTING = 'whatsapp.countryCode';
const AGENCY_NAME_SETTING = 'business.agencyName';
const SUPPORT_WHATSAPP_SETTING = 'support.whatsapp';
const SUPPORT_NAME_SETTING = 'support.name';
const SUPPORT_TITLE_SETTING = 'support.title';
const SUPPORT_PHOTO_SETTING = 'support.photo';
const SUPPORT_EMAIL_SETTING = 'support.email';
const SUPPORT_FACEBOOK_SETTING = 'support.facebook';
const SUPPORT_INSTAGRAM_SETTING = 'support.instagram';
const SUPPORT_INTRO_SETTING = 'support.intro';

const LANDING_SETTINGS = {
  heroTitle: { key: 'landing.heroTitle', group: 'landing', description: 'Título del encabezado del catálogo público.' },
  heroSubtitle: { key: 'landing.heroSubtitle', group: 'landing', description: 'Subtítulo del encabezado del catálogo público.' },
  contactTitle: { key: 'landing.contactTitle', group: 'landing', description: 'Título de la sección de contacto del catálogo.' },
  contactText: { key: 'landing.contactText', group: 'landing', description: 'Texto de la sección de contacto del catálogo.' },
  footerText: { key: 'landing.footerText', group: 'landing', description: 'Texto del pie de página del catálogo.' },
  catalogEnabled: { key: 'landing.enabled', group: 'landing', description: 'Permite ver el catálogo público.' },
  websiteUrl: { key: 'landing.websiteUrl', group: 'landing', description: 'URL del sitio web oficial (p. ej. https://inmobles.com).' },
};

const LANDING_DEFAULTS = {
  heroTitle: 'Encuentra el inmueble ideal',
  heroSubtitle: 'Casas, departamentos, locales y terrenos en venta y renta.',
  contactTitle: '¿Te interesa algún inmueble?',
  contactText: 'Escríbenos por WhatsApp o entra a la plataforma para agendar una visita.',
  footerText: 'Bienes Raíces',
  catalogEnabled: true,
  websiteUrl: 'https://inmobles.com',
};

async function readSetting(key) {
  const setting = await Setting.findOne({ key });
  return setting ? setting.value : null;
}

async function writeSetting(key, value, group, description, userId) {
  await Setting.findOneAndUpdate(
    { key },
    { value, group, description, updatedBy: userId },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

function hashRoleKey(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

const getRoleKeyStatus = asyncHandler(async (req, res) => {
  const setting = await Setting.findOne({ key: ROLE_KEY_SETTING });
  res.json({
    success: true,
    data: {
      configured: Boolean(setting && setting.value),
      key: ROLE_KEY_SETTING,
    },
  });
});

const setRoleKey = asyncHandler(async (req, res) => {
  const { roleKey } = req.body || {};
  if (!roleKey || String(roleKey).trim().length < 6) {
    return res.status(400).json({
      success: false,
      message: 'La clave debe tener al menos 6 caracteres.',
    });
  }

  const hash = hashRoleKey(String(roleKey).trim());

  const previous = await Setting.findOne({ key: ROLE_KEY_SETTING });
  await Setting.findOneAndUpdate(
    { key: ROLE_KEY_SETTING },
    { value: hash, group: 'auth', description: 'Clave para registrarse como administrador o gerencia', updatedBy: req.user._id },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await logAudit({
    user: req.user._id,
    action: 'update_setting',
    entity: 'Setting',
    entityId: ROLE_KEY_SETTING,
    field: 'value',
    previousValue: previous ? '[configurada]' : '[no configurada]',
    newValue: '[nueva clave]',
    ip: req.ip,
  });

  res.json({ success: true, message: 'Clave de registro actualizada correctamente.' });
});

const getPublicSettings = asyncHandler(async (req, res) => {
  const roleKey = await Setting.findOne({ key: ROLE_KEY_SETTING });
  const google = await Setting.findOne({ key: GOOGLE_SETTING });
  const whatsapp = await Setting.findOne({ key: WHATSAPP_SETTING });
  const agencyName = await readSetting(AGENCY_NAME_SETTING);

  const support = {
    whatsapp: (await readSetting(SUPPORT_WHATSAPP_SETTING)) || (whatsapp && whatsapp.value) || '',
    name: (await readSetting(SUPPORT_NAME_SETTING)) || 'Soporte',
    title: (await readSetting(SUPPORT_TITLE_SETTING)) || 'Atención a clientes y equipo',
    photo: (await readSetting(SUPPORT_PHOTO_SETTING)) || '',
    email: (await readSetting(SUPPORT_EMAIL_SETTING)) || '',
    facebook: (await readSetting(SUPPORT_FACEBOOK_SETTING)) || '',
    instagram: (await readSetting(SUPPORT_INSTAGRAM_SETTING)) || '',
    intro: (await readSetting(SUPPORT_INTRO_SETTING)) || '¿Necesitas ayuda? Escríbenos y con gusto te atendemos.',
  };

  const landing = {};
  for (const name of Object.keys(LANDING_SETTINGS)) {
    const raw = await readSetting(LANDING_SETTINGS[name].key);
    landing[name] = raw == null ? LANDING_DEFAULTS[name] : raw;
  }
  landing.catalogEnabled = landing.catalogEnabled === true || landing.catalogEnabled === 'true';
  landing.whatsappNumber = (whatsapp && whatsapp.value) || '';

  res.json({
    success: true,
    data: {
      roleRegisterKeyConfigured: Boolean(roleKey && roleKey.value),
      googleClientIdConfigured: Boolean(google && google.value),
      // Los Google Client IDs son públicos por diseño (los usa el navegador).
      googleClientId: (google && google.value) || '',
      // Número de WhatsApp para el catálogo público.
      whatsappNumber: (whatsapp && whatsapp.value) || '',
      // Configuración del catálogo público (editable desde Configuración).
      agencyName: agencyName || '',
      landing,
      support,
    },
  });
});

const setLanding = asyncHandler(async (req, res) => {
  const body = req.body || {};

  if (body.whatsappNumber !== undefined) {
    const clean = String(body.whatsappNumber).replace(/[^\d]/g, '');
    if (!/^\d{10,15}$/.test(clean)) {
      return res.status(400).json({
        success: false,
        message: 'El número de WhatsApp debe tener entre 10 y 15 dígitos (con código de país).',
      });
    }
    await writeSetting(WHATSAPP_SETTING, clean, 'contacto', 'Número de WhatsApp para el catálogo público', req.user._id);
  }

  if (body.countryCode !== undefined) {
    const cc = String(body.countryCode).replace(/[^\d]/g, '');
    if (!/^\d{1,3}$/.test(cc)) {
      return res.status(400).json({ success: false, message: 'El código de país no es válido.' });
    }
    await writeSetting(COUNTRY_CODE_SETTING, cc, 'contacto', 'Código de país para enlaces de WhatsApp', req.user._id);
  }

  if (body.agencyName !== undefined) {
    const name = String(body.agencyName).trim();
    if (!name) {
      return res.status(400).json({ success: false, message: 'El nombre de la agencia no puede ir vacío.' });
    }
    await writeSetting(AGENCY_NAME_SETTING, name, 'negocio', 'Nombre de la inmobiliaria', req.user._id);
  }

  for (const name of Object.keys(LANDING_SETTINGS)) {
    if (body[name] === undefined) continue;
    let value = body[name];
    if (name === 'catalogEnabled') {
      value = value === true || value === 'true' || value === 1 ? 'true' : 'false';
    } else {
      value = String(value).trim();
    }
    const def = LANDING_SETTINGS[name];
    await writeSetting(def.key, value, def.group, def.description, req.user._id);
  }

  await logAudit({
    user: req.user._id,
    action: 'update_setting',
    entity: 'Setting',
    entityId: 'landing',
    field: 'config',
    previousValue: '[configuración anterior]',
    newValue: '[nueva configuración]',
    ip: req.ip,
  });

  res.json({ success: true, message: 'Configuración del catálogo guardada.' });
});

const setWhatsappNumber = asyncHandler(async (req, res) => {
  const { whatsappNumber } = req.body || {};
  const clean = String(whatsappNumber || '').replace(/[^\d]/g, '');
  if (!/^\d{10,15}$/.test(clean)) {
    return res.status(400).json({
      success: false,
      message: 'Ingresa un número de WhatsApp válido (solo dígitos, con código de país).',
    });
  }

  await Setting.findOneAndUpdate(
    { key: WHATSAPP_SETTING },
    { value: clean, group: 'contacto', description: 'Número de WhatsApp para el catálogo público', updatedBy: req.user._id },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.json({ success: true, message: 'Número de WhatsApp guardado.' });
});

const setGoogleClientId = asyncHandler(async (req, res) => {
  const { googleClientId } = req.body || {};
  if (!googleClientId || !String(googleClientId).includes('.')) {
    return res.status(400).json({
      success: false,
      message: 'Ingresa un Google Client ID válido.',
    });
  }

  await Setting.findOneAndUpdate(
    { key: GOOGLE_SETTING },
    { value: String(googleClientId).trim(), group: 'auth', description: 'Google Client ID para registro con Google', updatedBy: req.user._id },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.json({ success: true, message: 'Google Client ID guardado.' });
});

const setSupport = asyncHandler(async (req, res) => {
  res.status(403).json({
    success: false,
    message: 'Los datos de soporte técnico solo pueden modificarse desde el panel de soporte.',
  });
});

module.exports = {
  getRoleKeyStatus,
  setRoleKey,
  getPublicSettings,
  setGoogleClientId,
  setWhatsappNumber,
  setLanding,
  setSupport,
};
