'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const { Property, Inventory, User, Role, Newsletter, Client, Appointment } = require('../models');
const { sendMail, mailWelcome } = require('../services/mail.service');

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

// Suscripción al newsletter desde la landing pública (sin autenticación).
const subscribeNewsletter = asyncHandler(async (req, res) => {
  const { email, name } = req.body || {};
  const clean = String(email || '').trim().toLowerCase();
  if (!clean || !/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(clean)) {
    return res.status(400).json({ success: false, message: 'Ingresa un correo electrónico válido.' });
  }

  const resume = async () => {
    const owner = await Newsletter.findOne({ email: clean });
    if (owner) {
      if (owner.status === 'dado_baja') {
        owner.status = 'suscrito';
        if (name) owner.name = String(name).trim();
        await owner.save();
      }
      return { created: false, owner };
    }
    const created = await Newsletter.create({ email: clean, name: String(name || '').trim(), source: 'landing' });
    return { created: true, owner: created };
  };

  const { created, owner } = await resume();

  // Correo de bienvenida (no bloquea la respuesta si falla).
  sendMail(mailWelcome(clean, owner && owner.name)).catch(() => {});

  if (!created) {
    // Ya estaba suscrito (o se reactivó): avisamos por si iban de nuevo.
    return res.json({ success: true, message: 'Ya estás suscrito a nuestras promociones. ¡Te enviamos un correo de bienvenida!' });
  }
  res.status(201).json({ success: true, message: '¡Suscripción exitosa! Te enviamos un correo de bienvenida.' });
});

// Lista de suscriptores (solo admin/gerencia/soporte) para el panel.
const listNewsletter = asyncHandler(async (req, res) => {
  const subs = await Newsletter.find().sort({ createdAt: -1 });
  res.json({ success: true, data: subs });
});

const normalize = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const hasWords = (text, ...words) => words.some((w) => text.includes(normalize(w)));

const money = (n) => (Number(n) || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

// Asistente IA de la página pública (sin autenticación): responde sobre
// propiedades, financiamiento y cómo contactar a la inmobiliaria.
const ask = asyncHandler(async (req, res) => {
  const { question } = req.body || {};
  const text = normalize(question);
  if (!text) {
    return res.json({ success: true, data: { answer: '¡Hola! Soy el asistente de INMOBLES. Pregúntame por propiedades disponibles, tipos de inmuebles, precios o cómo agendar una visita.' } });
  }

  if (hasWords(text, 'hola', 'buenos dias', 'buenas tardes', 'buenas noches', 'que tal')) {
    return res.json({ success: true, data: { answer: '¡Hola! Bienvenido a INMOBLES. Puedo ayudarte a encontrar propiedades, resolver dudas de financiamiento o indicarte cómo agendar una visita. ¿Qué buscas?' } });
  }

  if (hasWords(text, 'quien eres', 'que eres', 'como te llamas', 'asistente')) {
    return res.json({ success: true, data: { answer: 'Soy el asistente virtual de INMOBLES. Te ayudo a explorar el catálogo de inmuebles, entender opciones de crédito y contactar a nuestros asesores.' } });
  }

  if (hasWords(text, 'gracias')) {
    return res.json({ success: true, data: { answer: '¡Con gusto! Si necesitas ver las propiedades, abre el catálogo o escríbenos por WhatsApp.' } });
  }

  // Cuántas propiedades / catálogo general.
  if (hasWords(text, 'cuantas', 'cuantos', 'hay propiedades', 'disponibles', 'disponibilidad', 'catalogo', 'cuantas casas')) {
    const filter = { isPublished: true, status: { $ne: 'inactiva' }, price: { $gt: 0 } };
    const [total, cities] = await Promise.all([
      Property.countDocuments(filter),
      Property.distinct('city', filter),
    ]);
    const citiesText = cities.length ? ` Tenemos inmuebles en: ${cities.slice(0, 6).join(', ')}${cities.length > 6 ? ' y más' : ''}.` : '';
    return res.json({ success: true, data: { answer: `Actualmente tenemos ${total} propiedades publicadas en nuestro catálogo.${citiesText} ¿Buscas casa, departamento, local o terreno?` } });
  }

  if (hasWords(text, 'casa', 'departamento', 'local', 'terreno', 'bodega', 'oficina', 'rancho', 'playa', 'tipos', 'tipo')) {
    const filter = { isPublished: true, status: { $ne: 'inactiva' }, price: { $gt: 0 } };
    const counts = await Property.aggregate([
      { $match: filter },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]);
    const types = { casa: 'Casa', departamento: 'Departamento', local: 'Local', bodega: 'Bodega', oficina: 'Oficina', terreno: 'Terreno', rancho: 'Rancho', playa: 'Playa', otro: 'Otro' };
    const lines = counts
      .map((c) => (types[c._id] || c._id) + ': ' + c.count)
      .join('\n');
    return res.json({ success: true, data: { answer: `Tenemos disponibles:\n${lines || 'Por el momento no hay inmuebles publicados.'}\n\nPuedes filtrar por tipo y ciudad en el catálogo. Escríbenos por WhatsApp si quieres ver alguno.` } });
  }

  if (hasWords(text, 'precio', 'barato', 'economico', 'costo', 'cuanto cuesta', 'presupuesto', 'mas caro')) {
    const filter = { isPublished: true, status: { $ne: 'inactiva' }, price: { $gt: 0 } };
    const agg = await Property.aggregate([
      { $match: filter },
      { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } },
    ]);
    const r = agg[0];
    if (!r) return res.json({ success: true, data: { answer: 'Por el momento no tenemos inmuebles publicados.' } });
    return res.json({ success: true, data: { answer: `Nuestro rango de precios va de ${money(r.min)} a ${money(r.max)}. En el catálogo puedes ordenar y filtrar por tu presupuesto, o dime qué buscas y te orientamos.` } });
  }

  if (hasWords(text, 'horario', 'donde estan', 'ubicacion', 'direccion', 'oficina', 'en donde')) {
    return res.json({ success: true, data: { answer: 'Estamos en Hermosillo, Sonora, México. Visita inmobles.com para ver la dirección y los medios de contacto, o escríbenos por WhatsApp y un asesor te atiende.' } });
  }

  if (hasWords(text, 'agendar', 'visita', 'cita', 'ver una propiedad', 'visitas')) {
    return res.json({ success: true, data: { answer: 'Para agendar una visita: elige una propiedad del catálogo, pulsa "Agendar visita", escribe tu nombre, fecha y hora, y se abrirá WhatsApp para confirmar con tu asesor. ¡Sin compromiso!' } });
  }

  if (hasWords(text, 'credito', 'financiamiento', 'infonavit', 'fovissste', 'hipoteca', 'mensualidad', 'presupuesto')) {
    return res.json({ success: true, data: { answer: 'Trabajamos con créditos Infonavit, Fovissste y bancarios. En la ficha de cada propiedad hay una calculadora de mensualidades para estimar tu pago según enganche, tasa y plazo. ¿Te ayudo a calcular?' } });
  }

  if (hasWords(text, 'whatsapp', 'contacto', 'contactar', 'telefono', 'llamar', 'escribir')) {
    return res.json({ success: true, data: { answer: 'Puedes escribirnos directo por WhatsApp desde el botón flotante o en el footer de esta página, o llamar al número que aparece en el encabezado. ¡Te atendemos de inmediato!' } });
  }

  if (hasWords(text, 'venta', 'renta', 'operacion')) {
    return res.json({ success: true, data: { answer: 'Publicamos propiedades tanto en venta como en renta. En el catálogo puedes filtrar por operación para ver solo las que te interesan.' } });
  }

  return res.json({
    success: true,
    data: {
      answer: 'Aún no estoy seguro de cómo ayudarte. Prueba preguntando: "¿cuántas propiedades hay?", "¿qué tipos de inmuebles tienen?", "¿cómo agendo una visita?" o "¿qué opciones de crédito hay?".',
    },
  });
});

// Agendar una cita sobre una propiedad pública, SIN necesidad de iniciar sesión.
// Cualquier visitante puede pedir una visita: solo necesita nombre y fecha.
// El sistema asigna automáticamente al asesor responsable de la propiedad.
const createAppointment = asyncHandler(async (req, res) => {
  const { name, phone, date, type, notes, property } = req.body || {};

  const propId = String(property || '');
  const propertyRecord = propId
    ? await Property.findOne({ _id: propId, isPublished: true, status: { $ne: 'inactiva' } }).select('responsibleUser type zone city address')
    : null;
  if (!propertyRecord) {
    return res.status(400).json({ success: false, message: 'La propiedad no está disponible para agendar una visita.' });
  }

  const cleanName = String(name || '').trim();
  if (!cleanName) {
    return res.status(400).json({ success: false, message: 'Escribe tu nombre para agendar la cita.' });
  }
  if (!date || isNaN(new Date(date).getTime())) {
    return res.status(400).json({ success: false, message: 'Indica una fecha y hora válidas.' });
  }

  // Asesor responsable: el de la propiedad; si no hay, el primer asesor/gerencia activo.
  let responsibleUser = propertyRecord.responsibleUser || null;
  if (!responsibleUser) {
    const roles = await Role.find({ code: { $in: ['asesor', 'gerencia', 'admin'] }, status: 'activo' }).select('_id').lean();
    const roleIds = roles.map((r) => r._id);
    const fallback = await User.findOne({ role: { $in: roleIds }, status: 'activo' }).sort({ createdAt: 1 }).select('_id');
    responsibleUser = fallback ? fallback._id : null;
  }
  if (!responsibleUser) {
    return res.status(500).json({ success: false, message: 'No hay un asesor disponible para esta cita.' });
  }

  // Reutiliza o crea el cliente con los datos del interesado (sin entrar al CRM).
  const cleanPhone = String(phone || '').replace(/\D/g, '');
  let client = null;
  if (cleanName) {
    client = cleanPhone
      ? await Client.findOne({ name: cleanName, phone: cleanPhone, responsibleUser })
      : await Client.findOne({ name: cleanName, responsibleUser });
    if (!client) {
      client = await Client.create({
        type: 'comprar',
        name: cleanName,
        phone: cleanPhone,
        responsibleUser,
        contactMedium: 'sitio_web',
        funnelStage: 'cita',
      });
    }
  }

  const cleanType = ['visita_propiedad', 'oficina', 'firma', 'avaluo', 'seguimiento', 'otro'].includes(type)
    ? type
    : 'visita_propiedad';

  const appointment = await Appointment.create({
    client: client ? client._id : null,
    user: responsibleUser,
    property: propertyRecord._id,
    date: new Date(date),
    type: cleanType,
    notes: String(notes || '').trim(),
    status: 'pendiente',
  });

  res.status(201).json({
    success: true,
    message: 'Cita registrada. Un asesor te contactará para confirmarla.',
    data: { id: appointment._id },
  });
});

module.exports = { list, get, listAsesores, getAsesor, subscribeNewsletter, listNewsletter, ask, createAppointment };
