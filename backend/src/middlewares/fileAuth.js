'use strict';

const path = require('path');
const jwt = require('jsonwebtoken');
const asyncHandler = require('./asyncHandler');
const { Session, Property, User } = require('../models');
const { jwtSecret } = require('../config/env');
const { hashToken } = require('../services/session.service');

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

/**
 * Protege los archivos estáticos de /uploads:
 *  - Con token válido (header Bearer o ?token= para <img>/<a>) → acceso total.
 *  - Sin token → solo archivos que pertenecen a fotos de propiedades publicadas.
 */
const fileAuth = asyncHandler(async (req, res, next) => {
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
      if (session) return next();
    } catch (error) {
      // Token inválido/expirado → continúa a la verificación pública.
    }
  }

  const fileName = path.basename(req.path || '');
  if (fileName && (await isPubliclyShared(fileName))) {
    return next();
  }
  if (fileName && (await isPublicUserPhoto(fileName))) {
    return next();
  }

  return res.status(401).json({ success: false, message: 'No autorizado para ver este archivo.' });
});

module.exports = { fileAuth };
