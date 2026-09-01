'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const { Property, Inventory, User, Role } = require('../models');

const PUBLIC_FIELDS =
  '_id type operationType price ticketValue address zone city state description characteristics photos status createdAt';

// Roles del equipo que se muestran en el directorio público de asesores.
const TEAM_ROLE_CODES = ['asesor', 'admin', 'gerencia'];

// Código de rol robusto: puede venir como documento poblado u ObjectId.
function roleCode(user) {
  if (!user || !user.role) return '';
  if (typeof user.role === 'object' && user.role !== null) return user.role.code || '';
  return '';
}

// Ids de inventario publicados asignados a un asesor (para el catálogo por asesor).
async function publishedInventoryIds(asesorId) {
  return Inventory.find({ assignedAgent: asesorId, isPublished: true })
    .distinct('property');
}

const list = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(24, parseInt(req.query.limit, 10) || 12);

  const filter = {
    isPublished: true,
    status: { $ne: 'inactiva' },
    price: { $gt: 0 },
  };
  if (req.query.type) filter.type = req.query.type;
  if (req.query.operationType) filter.operationType = req.query.operationType;
  if (req.query.city) filter.city = req.query.city;
  if (req.query.zone) filter.zone = req.query.zone;
  if (req.query.minPrice) filter.price = { ...filter.price, $gte: Number(req.query.minPrice) };
  if (req.query.maxPrice) filter.price = { ...filter.price, $lte: Number(req.query.maxPrice) };
  if (req.query.q) {
    filter.$or = [
      { address: new RegExp(req.query.q, 'i') },
      { zone: new RegExp(req.query.q, 'i') },
      { city: new RegExp(req.query.q, 'i') },
      { state: new RegExp(req.query.q, 'i') },
      { description: new RegExp(req.query.q, 'i') },
    ];
  }

  // Catálogo de un asesor específico (?asesorId=id): propiedades responsables
  // del asesor + las asignadas a su inventario publicado.
  if (req.query.asesorId) {
    const invIds = await publishedInventoryIds(req.query.asesorId);
    if (!filter.$and) filter.$and = [];
    filter.$and.push({
      $or: [
        { responsibleUser: req.query.asesorId },
        { _id: invIds.length ? { $in: invIds } : { $in: [] } },
      ],
    });
  }

  const [total, items] = await Promise.all([
    Property.countDocuments(filter),
    Property.find(filter)
      .select(PUBLIC_FIELDS)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);

  const cities = await Property.distinct('city', { isPublished: true, city: { $ne: '' } });

  res.json({
    success: true,
    data: items,
    meta: { page, limit, total, pages: Math.ceil(total / limit), cities },
  });
});

const get = asyncHandler(async (req, res) => {
  const property = await Property.findOne({
    _id: req.params.id,
    isPublished: true,
    status: { $ne: 'inactiva' },
  })
    .select(`${PUBLIC_FIELDS} responsibleUser`)
    .populate('responsibleUser', 'name phone email photo position bio');
  if (!property) {
    return res.status(404).json({ success: false, message: 'Propiedad no disponible' });
  }
  res.json({ success: true, data: property });
});

// Ficha pública de un asesor (foto, contacto, semblanza).
function asesorSummary(user) {
  return {
    id: user._id,
    name: user.name,
    photo: user.photo || '',
    position: user.position || 'Asesor inmobiliario',
    bio: user.bio || '',
    email: user.email || '',
    phone: user.phone || '',
    facebook: user.facebook || '',
    instagram: user.instagram || '',
    // Relevantes para el catálogo: rol y estado del usuario.
    role: roleCode(user),
  };
}

// Directorio público del equipo (usuarios activos con rol de asesor/administración).
const listAsesores = asyncHandler(async (req, res) => {
  const roles = await Role.find({ code: { $in: TEAM_ROLE_CODES }, status: 'activo' }).select('_id').lean();
  if (!roles.length) {
    return res.json({ success: true, data: [], meta: { total: 0 } });
  }
  const roleIds = roles.map((r) => r._id);

  const users = await User.find({ role: { $in: roleIds }, status: 'activo' })
    .select('name photo position bio email phone facebook instagram role')
    .populate('role', 'code name')
    .sort({ name: 1 })
    .lean();

  if (!users.length) {
    return res.json({ success: true, data: [], meta: { total: 0 } });
  }
  const userIds = users.map((u) => u._id);

  // Conteo de propiedades publicadas activas por asesor (responsables + inventario
  // asignado). Se hace en SÓLO 2 consultas (una a Inventory y una a Property), no
  // 2 por asesor, para que el directorio del equipo escale sin bloquearse.
  const sets = new Map(userIds.map((id) => [String(id), new Set()]));

  const inventory = await Inventory.find({
    assignedAgent: { $in: userIds },
    isPublished: true,
  })
    .select('assignedAgent property')
    .lean();
  for (const inv of inventory) {
    const key = String(inv.assignedAgent);
    const bucket = sets.get(key);
    if (bucket && inv.property) bucket.add(String(inv.property));
  }

  const props = await Property.find({
    isPublished: true,
    status: { $ne: 'inactiva' },
    price: { $gt: 0 },
    responsibleUser: { $in: userIds },
  })
    .select('_id responsibleUser')
    .lean();
  for (const prop of props) {
    const key = String(prop.responsibleUser);
    const bucket = sets.get(key);
    if (bucket) bucket.add(String(prop._id));
  }

  const countOf = (id) => (sets.get(String(id)) || new Set()).size;
  const data = users.map((u) => ({ ...asesorSummary(u), propertyCount: countOf(u._id) }));
  res.json({ success: true, data, meta: { total: data.length } });
});

// Ficha de un solo asesor.
const getAsesor = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
    .select('status name photo position bio email phone facebook instagram role')
    .populate('role', 'code name')
    .lean();
  if (!user || user.status !== 'activo' || !TEAM_ROLE_CODES.includes(roleCode(user))) {
    return res.status(404).json({ success: false, message: 'Asesor no disponible' });
  }
  const invIds = await publishedInventoryIds(user._id);
  const propertyCount = await Property.countDocuments({
    isPublished: true,
    status: { $ne: 'inactiva' },
    price: { $gt: 0 },
    $or: [
      { responsibleUser: user._id },
      { _id: invIds.length ? { $in: invIds } : { $in: [] } },
    ],
  });
  res.json({ success: true, data: { ...asesorSummary(user), propertyCount } });
});

module.exports = { list, get, listAsesores, getAsesor };
