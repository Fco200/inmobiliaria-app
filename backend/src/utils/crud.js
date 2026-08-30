'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const { isBoss, scopeCondition } = require('./scope');

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
 */
function buildCrud(model, {
  populate = [],
  searchFields = [],
  beforeCreate,
  beforeUpdate,
  ownerField = null,
  ownerMatch = null,
} = {}) {
  function assertOwnership(req, doc) {
    if (isBoss(req)) return true;
    return ownerIdOf(doc, ownerField) === String(req.user._id);
  }

  function forceOwner(req, body) {
    if (!ownerField) return body;
    const assigned = body[ownerField];
    if (isBoss(req)) {
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

      if (req.query.q && searchFields.length) {
        filter.$or = searchFields.map((field) => ({
          [field]: { $regex: req.query.q, $options: 'i' },
        }));
      }

      if (req.query.status) filter.status = req.query.status;

      // Filtro por usuario:
      //  - jefe   → opcional vía ?user=
      //  - asesor → SIEMPRE forzado a su propio usuario.
      if (!isBoss(req)) {
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
      let body = { ...req.body };
      forceOwner(req, body);
      if (beforeUpdate) body = (await beforeUpdate(body, req)) || body;
      Object.assign(doc, body);
      await doc.save();
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
      res.json({ success: true, message: 'Registro eliminado' });
    }),
  };
}

module.exports = buildCrud;
