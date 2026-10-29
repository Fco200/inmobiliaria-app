'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const { isBoss, hasRole, scopeCondition } = require('./scope');

function ownerIdOf(doc, ownerField) {
  if (!ownerField) return null;
  const value = doc[ownerField];
  if (!value) return null;
  return String(value._id || value);
}

/**
 * Fábrica genérica de CRUD paginado con AISLAMIENTO POR USUARIO:
 *  - admin/gerencia → ven y administran todo (pueden filtrar con ?user=).
 *  - asesor         → solo sus propios registros; no puede asignar registros
 *                     a otros usuarios ni tocar los de sus compañeros.
 *
 * Opciones:
 *  - ownerField: campo propietario simple (responsibleUser, user, uploadedBy…).
 *  - ownerMatch: fn(userId) => condición Mongo cuando la propiedad es compuesta.
 *  - beforeCreate/beforeUpdate: hooks existentes.
 *  - afterCreate/afterUpdate/afterRemove: hooks no bloqueantes post-operación.
 *    afterUpdate(doc, req, previous) recibe el documento previo (objeto plano)
 *    para comparar cambios; afterRemove(doc, req) recibe el documento eliminado.
 *  - extraFilters: { paramDeQuery => nombreDelCampo } filtros exactos adicionales.
 *    Si el parámetro llega separado por comas (?type=casa,local) se aplica $in,
 *    lo que permite filtrar por varios valores a la vez sin tocar el controlador.
 *  - publicationFilter: campo booleano de publicación. Acepta
 *    ?isPublished=true|false y, si se indica `publishedParam`, un atajo
 *    ?published=true|false.
 *  - textFilters: { paramDeQuery => nombreDelCampo } búsqueda parcial sin
 *    distinguir mayúsculas (se escapan los caracteres de regex).
 *  - rangeFilters: { paramMin => campo, paramMax => campo } rangos numéricos.
 *  - priceField: campo numérico para aplicar ?minPrice= y ?maxPrice= ($gte/$lte).
 */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Normaliza un parámetro de query que puede venir como valor único
// (?type=casa) o como lista separada por comas (?type=casa,local,bodega).
// Devuelve siempre un arreglo de strings no vacíos.
function toList(value) {
  return String(value == null ? '' : value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function buildCrud(model, {
  populate = [],
  searchFields = [],
  beforeCreate,
  beforeUpdate,
  afterCreate,
  afterUpdate,
  afterRemove,
  ownerField = null,
  ownerMatch = null,
  extraFilters = null,
  textFilters = null,
  rangeFilters = null,
  priceField = null,
  baseFilter = null,
  publicationFilter = null,
  // Roles adicionales (además de los jefes) que ven/administran todos los
  // registros de este CRUD. Se usa en Negocios para asistencia/escrituración.
  wideRoles = [],
} = {}) {
  function hasWideAccess(req) {
    return isBoss(req) || hasRole(req, wideRoles);
  }

  function assertOwnership(req, doc) {
    if (hasWideAccess(req)) return true;
    return ownerIdOf(doc, ownerField) === String(req.user._id);
  }

  function forceOwner(req, body) {
    if (!ownerField) return body;
    const assigned = body[ownerField];
    if (hasWideAccess(req)) {
      if (assigned === '' || assigned === undefined) delete body[ownerField];
      return body;
    }
    // Un asesor siempre es dueño de lo que crea.
    body[ownerField] = req.user._id;
    return body;
  }

  return {
    list: asyncHandler(async (req, res) => {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, parseInt(req.query.limit, 10) || 25);
      const filter = {};

      // Filtro base fijo, independiente de la query, para acotar el listado
      // (p.ej. ocultar ciertos roles del directorio general de usuarios).
      // Puede ser un objeto o una función async (req) => objeto.
      const staticFilter = typeof baseFilter === 'function' ? await baseFilter(req) : baseFilter;
      if (staticFilter) Object.assign(filter, staticFilter);

      // Búsqueda libre. Se escapan los caracteres de regex para evitar
      // patrones costosos o inválidos (ReDoS) que saturen MongoDB bajo carga.
      if (req.query.q && searchFields.length) {
        const term = escapeRegex(String(req.query.q).trim());
        if (term) {
          filter.$or = searchFields.map((field) => ({
            [field]: { $regex: term, $options: 'i' },
          }));
        }
      }

      if (req.query.status) {
        const statuses = toList(req.query.status);
        if (statuses.length > 1) filter.status = { $in: statuses };
        else if (statuses.length === 1) filter.status = statuses[0];
      }

      // Filtros exactos adicionales configurables (?param => campo). Admite
      // varios valores separados por comas (?type=casa,local → { $in: [...] }).
      if (extraFilters) {
        for (const [queryParam, field] of Object.entries(extraFilters)) {
          if (req.query[queryParam] === undefined) continue;
          const values = toList(req.query[queryParam]);
          if (!values.length) continue;
          filter[field] = values.length > 1 ? { $in: values } : values[0];
        }
      }

      // Estado de publicación (?isPublished=true|false o ?published=true|false).
      if (publicationFilter) {
        const raw = req.query.isPublished !== undefined
          ? req.query.isPublished
          : (req.query.published !== undefined ? req.query.published : undefined);
        if (raw !== undefined && raw !== '') {
          filter[publicationFilter] = raw === 'true' || raw === true;
        }
      }

      // Filtros de texto parcial (?param => campo), insensibles a mayúsculas.
      if (textFilters) {
        for (const [queryParam, field] of Object.entries(textFilters)) {
          const value = String(req.query[queryParam] || '').trim();
          if (value) filter[field] = { $regex: escapeRegex(value), $options: 'i' };
        }
      }

      // Rangos numéricos genéricos (?paramMin / ?paramMax => campo).
      if (rangeFilters) {
        for (const [queryParam, field] of Object.entries(rangeFilters)) {
          const isMin = /min/i.test(queryParam);
          const raw = parseFloat(req.query[queryParam]);
          if (!Number.isFinite(raw)) continue;
          const current = filter[field];
          if (!current || typeof current !== 'object' || Array.isArray(current)) {
            // Un filtro exacto previo se conserva dentro del mismo operador.
            filter[field] = (current === undefined || current === '') ? {} : { $eq: current };
          }
          filter[field][isMin ? '$gte' : '$lte'] = raw;
        }
      }

      // Rango de precio (?minPrice / ?maxPrice) sobre el campo numérico.
      if (priceField) {
        const priceFilter = {};
        const min = parseFloat(req.query.minPrice);
        const max = parseFloat(req.query.maxPrice);
        if (Number.isFinite(min)) priceFilter.$gte = min;
        if (Number.isFinite(max)) priceFilter.$lte = max;
        if (Object.keys(priceFilter).length) filter[priceField] = priceFilter;
      }

      // Filtro por usuario:
      //  - jefe / rol ampliado → opcional vía ?user=
      //  - asesor              → SIEMPRE forzado a su propio usuario.
      if (!hasWideAccess(req)) {
        Object.assign(filter, scopeCondition(ownerField, ownerMatch, req.user._id));
      } else if (req.query.user) {
        Object.assign(filter, scopeCondition(ownerField, ownerMatch, req.query.user));
      }
      if (req.query.business && !filter.$or) filter.business = req.query.business;

      const query = model.find(filter);
      if (populate.length) query.populate(populate);

      const [total, items] = await Promise.all([
        model.countDocuments(filter),
        query
          .skip((page - 1) * limit)
          .limit(limit)
          .sort({ createdAt: -1 }),
      ]);

      res.json({
        success: true,
        data: items,
        meta: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    }),

    get: asyncHandler(async (req, res) => {
      const query = model.findById(req.params.id);
      if (populate.length) query.populate(populate);
      const doc = await query;
      if (!doc) {
        return res.status(404).json({ success: false, message: 'Registro no encontrado' });
      }
      if (!assertOwnership(req, doc)) {
        return res.status(403).json({ success: false, message: 'No tienes acceso a este registro.' });
      }
      res.json({ success: true, data: doc });
    }),

    create: asyncHandler(async (req, res) => {
      let body = { ...req.body };
      forceOwner(req, body);
      if (beforeCreate) body = (await beforeCreate(body, req)) || body;
      const doc = await model.create(body);
      if (afterCreate) {
        // Hook no bloqueante: nunca debe impedir la creación ni romper la petición.
        Promise.resolve(afterCreate(doc, req)).catch(() => {});
      }
      res.status(201).json({ success: true, data: doc });
    }),

    update: asyncHandler(async (req, res) => {
      const doc = await model.findById(req.params.id);
      if (!doc) {
        return res.status(404).json({ success: false, message: 'Registro no encontrado' });
      }
      if (!assertOwnership(req, doc)) {
        return res.status(403).json({ success: false, message: 'No tienes acceso a este registro.' });
      }
      const previous = doc.toObject({ versionKey: false });
      let body = { ...req.body };
      forceOwner(req, body);
      if (beforeUpdate) body = (await beforeUpdate(body, req)) || body;
      Object.assign(doc, body);
      await doc.save();
      if (afterUpdate) {
        // Hook no bloqueante: nunca debe romper la actualización ni la petición.
        Promise.resolve(afterUpdate(doc, req, previous)).catch(() => {});
      }
      if (populate.length) await doc.populate(populate);
      res.json({ success: true, data: doc });
    }),

    remove: asyncHandler(async (req, res) => {
      const doc = await model.findById(req.params.id);
      if (!doc) {
        return res.status(404).json({ success: false, message: 'Registro no encontrado' });
      }
      if (!assertOwnership(req, doc)) {
        return res.status(403).json({ success: false, message: 'No tienes acceso a este registro.' });
      }
      await doc.deleteOne();
      if (afterRemove) {
        // Hook no bloqueante: nunca debe romper el borrado ni la petición.
        Promise.resolve(afterRemove(doc, req)).catch(() => {});
      }
      res.json({ success: true, message: 'Registro eliminado' });
    }),
  };
}

module.exports = buildCrud;
