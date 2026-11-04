'use strict';

const path = require('path');
const jwt = require('jsonwebtoken');
const asyncHandler = require('./asyncHandler');
const { Session, Property, User, Business, Document } = require('../models');
const { jwtSecret } = require('../config/env');
const { hashToken } = require('../services/session.service');
const { BOSS_ROLES, BUSINESS_WIDE_ROLES } = require('../utils/scope');

// Caché de "¿este archivo es una foto de una propiedad publicada?" para no
// golpear la BD en cada imagen del catálogo público.
const publicCache = new Map();
const CACHE_TTL = 60 * 1000;

// Caché de "¿este archivo es la foto de perfil de un usuario activo?" de modo
// que el directorio público de asesores pueda mostrar los avatares actualizados.
const photoCache = new Map();

// Escape de un nombre de archivo para usarlo dentro de una expresión regular.
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Busca propiedades cuyo arreglo `photos` contenga ESTE archivo, sin importar
// cómo se haya guardado la ruta en la BD (relativa /uploads/x.jpg, absoluta
// http://host/uploads/x.jpg o con la extensión en mayúsculas). Antes se usaba
// igualdad exacta y cualquier variación dejaba la imagen en 401 (rota).
async function countPropertiesWithFile(fileName, extraFilter = {}) {
  const safe = escapeRegex(fileName);
  return Property.countDocuments({
    ...extraFilter,
    photos: { $regex: `(^|/)${safe}$`, $options: 'i' },
  });
}

async function isPubliclyShared(fileName) {
  const now = Date.now();
  const cached = publicCache.get(fileName);
  if (cached && cached.expiresAt > now) return cached.isPublic;

  let isPublic = false;
  try {
    const count = await countPropertiesWithFile(fileName, {
      isPublished: true,
      status: { $ne: 'inactiva' },
    });
    isPublic = count > 0;
  } catch (error) {
    isPublic = false;
  }
  publicCache.set(fileName, { isPublic, expiresAt: now + CACHE_TTL });
  return isPublic;
}

// Foto de perfil de un usuario activo → pública (para la landing y el
// directorio de asesores). Un nuevo avatar sube con nombre único (Date.now),
// así el navegador siempre pide el archivo nuevo; el caché solo evita repetir
// la consulta a BD durante un minuto.
async function isPublicUserPhoto(fileName) {
  const now = Date.now();
  const cached = photoCache.get(fileName);
  if (cached && cached.expiresAt > now) return cached.isPublic;

  let isPublic = false;
  try {
    const safe = escapeRegex(fileName);
    const count = await User.countDocuments({
      photo: { $regex: `(^|/)${safe}$`, $options: 'i' },
      status: 'activo',
    });
    isPublic = count > 0;
  } catch (error) {
    isPublic = false;
  }
  photoCache.set(fileName, { isPublic, expiresAt: now + CACHE_TTL });
  return isPublic;
}

// Caché "¿este archivo pertenece a un documento de negocio?" para no repetir la
// consulta en cada carga de imagen. Guarda el id del negocio (o null).
const businessDocCache = new Map();

async function businessIdForFile(fileName) {
  const now = Date.now();
  const cached = businessDocCache.get(fileName);
  if (cached && cached.expiresAt > now) return cached.businessId;

  let businessId = null;
  try {
    const safe = escapeRegex(fileName);
    const doc = await Document.findOne({
      business: { $ne: null },
      $or: [
        { fileUrl: { $regex: `(^|/)${safe}$`, $options: 'i' } },
        { fileName },
      ],
    })
      .select('business')
      .lean();
    businessId = doc ? doc.business : null;
  } catch (error) {
    businessId = null;
  }
  businessDocCache.set(fileName, { businessId, expiresAt: now + CACHE_TTL });
  return businessId;
}

// Un asesor solo puede ver/descargar documentos del negocio en el que está
// registrado (captador o asesor de cliente). Dirección, administración,
// gerencia, asistencia y escrituración conservan acceso operativo.
async function canAccessBusinessDocument(userId, businessId) {
  try {
    const user = await User.findById(userId).populate('role').select('role').lean();
    const code = user && user.role && user.role.code ? user.role.code : '';
    if (BOSS_ROLES.includes(code) || BUSINESS_WIDE_ROLES.includes(code)) return true;

    const business = await Business.findById(businessId)
      .select('mainAdvisor partnerAdvisor asesor_captador_id asesor_cliente_id')
      .lean();
    if (!business) return true;

    const uid = String(userId);
    return [business.mainAdvisor, business.partnerAdvisor, business.asesor_captador_id, business.asesor_cliente_id]
      .some((id) => id && String(id) === uid);
  } catch (error) {
    return false;
  }
}

/**
 * Protege los archivos estáticos de /uploads:
 *  - Con token válido (header Bearer o ?token= para <img>/<a>) → acceso total.
 *  - Sin token → solo archivos que pertenecen a fotos de propiedades publicadas.
 */
const fileAuth = asyncHandler(async (req, res, next) => {
  const fileName = path.basename(req.path || '');
  let token = null;
  const header = req.headers.authorization;

  if (header && header.startsWith('Bearer ')) {
    token = header.slice(7).trim();
  } else if (req.query.token) {
    token = String(req.query.token);
  }

  if (token) {
    try {
      jwt.verify(token, jwtSecret);
      const session = await Session.findOne({ tokenHash: hashToken(token) });
      if (session) {
        // Los documentos de un negocio exigen pertenecer a ese negocio. El
        // resto de archivos (fotos de propiedades, avatares) sigue disponible
        // para cualquier sesión válida.
        const businessId = fileName ? await businessIdForFile(fileName) : null;
        if (!businessId || (await canAccessBusinessDocument(session.user, businessId))) {
          return next();
        }
        return res.status(403).json({
          success: false,
          message: 'No tienes acceso a los documentos de este negocio.',
        });
      }
    } catch (error) {
      // Token inválido/expirado → continúa a la verificación pública.
    }
  }

  if (fileName && (await isPubliclyShared(fileName))) {
    return next();
  }
  if (fileName && (await isPublicUserPhoto(fileName))) {
    return next();
  }

  return res.status(401).json({ success: false, message: 'No autorizado para ver este archivo.' });
});

module.exports = { fileAuth };
