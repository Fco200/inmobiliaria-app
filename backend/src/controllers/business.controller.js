'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const buildCrud = require('../utils/crud');
const { isBoss } = require('../utils/scope');
const { Business, BusinessStage, Client } = require('../models');
const { logActivity, logAudit } = require('../services/log.service');
const { ensure } = require('../services/notification.service');
const { getOrCreateGeneralChat, persistAndBroadcast } = require('./chat.controller');

// Cuando se abre un negocio con una propiedad, el resto del equipo debe saberlo
// para no duplicar trabajo. Se deja una nota automática en el chat interno
// general; además, ese canal dispara el push nativo a los demás participantes.
// El aviso es informativo: nunca debe impedir que el negocio se cree.
async function notifyTeamPropertyBusiness(req, business) {
  try {
    const prop = business && business.property;
    if (!prop || !prop._id) return;
    const place = [prop.zone, prop.city].filter(Boolean).join(' ')
      || prop.address
      || String(prop.type || '').replace(/_/g, ' ')
      || 'una propiedad';
    const actorName = (req.user && (req.user.name || req.user.username)) || 'Un asesor';
    const text = `🏠 ${actorName} creó el negocio "${business.name}" con la propiedad ${place}.`;
    const io = req.app && typeof req.app.get === 'function' ? req.app.get('io') : null;
    const chat = await getOrCreateGeneralChat();
    await persistAndBroadcast(io, chat._id, req.user._id, actorName, text);
  } catch (error) {
    // Silencioso a propósito: la nota es un extra, no parte de la operación.
  }
}

// Proceso de ventas para un comprador: captación del prospecto hasta la entrega del inmueble.
const BUYER_STAGES = [
  'nuevo',
  'prospecto',
  'contactado',
  'seguimiento',
  'cita',
  'negociacion',
  'contrato',
  'INTEGRACION',
  'AVALUO',
  'REVISION_AVALUO',
  'INSCRIPCION',
  'DICTAMEN',
  'FIRMA',
  'PAGO',
  'ENTREGA',
  'integracion',
  'avaluo',
  'revision',
  'notarias',
  'firma',
  'pago',
  'entrega',
  'postventa',
  'concluido',
];

// Proceso de ventas para un vendedor: captación del inmueble hasta integrarse al proceso del comprador.
// Se mantiene el orden que ya usaba el módulo (incluida "revision", que aquí es
// la revisión de la valuación, no la del embudo de clientes) y se le suma
// "seguimiento" para hablar el mismo idioma que el resto del CRM.
const SELLER_STAGES = [
  'nuevo',
  'prospecto',
  'contactado',
  'seguimiento',
  'revision',
  'cita',
  'captacion',
  'integracion_expedientes',
  'negociacion',
  'promesa',
  'avaluo',
  'concluido',
];

const STAGE_ORDER = Array.from(new Set([...BUYER_STAGES, ...SELLER_STAGES, 'negociacion', 'cancelado']));

const STAGE_LABELS = {
  nuevo: 'Nuevo',
  prospecto: 'Prospecto',
  contactado: 'Contactado',
  seguimiento: 'Seguimiento',
  cita: 'Cita',
  contrato: 'Contrato',
  INTEGRACION: 'INTEGRACION',
  AVALUO: 'AVALUO',
  REVISION_AVALUO: 'REVISION AVALUO',
  INSCRIPCION: 'INSCRIPCION',
  DICTAMEN: 'DICTAMEN',
  FIRMA: 'FIRMA',
  PAGO: 'PAGO',
  ENTREGA: 'ENTREGA',
  integracion: 'Integración',
  avaluo: 'Avalúo',
  revision: 'Revisión',
  notarias: 'Notarías',
  firma: 'Firma',
  pago: 'Pago',
  entrega: 'Entrega',
  postventa: 'Postventa',
  captacion: 'Captación',
  integracion_expedientes: 'Integración de expedientes',
  promesa: 'Promesa',
  negociacion: 'Negociación',
  concluido: 'Concluido',
  cancelado: 'Cancelar',
  PAUSA: 'Pausa',
  CANCELADO_DEFINITIVO: 'Cancelado definitivo',
};

// El embudo de negocios antes usaba "perfilado"; ahora habla el mismo idioma que
// el embudo de clientes (Seguimiento, la etapa que sigue a la cita). Los datos
// viejos se corrigen con `npm run migrate:negocios`, pero esta tabla evita que
// un negocio guardado antes de la migración quede fuera de las etapas válidas.
const STAGE_LEGACY = {
  perfilado: 'seguimiento',
};

function normalizarEtapa(stage) {
  return STAGE_LEGACY[stage] || stage;
}

const STAGES_BY_PROCESS = {
  comprador: BUYER_STAGES,
  vendedor: SELLER_STAGES,
};

function stagesFor(processType) {
  return STAGES_BY_PROCESS[processType] || BUYER_STAGES;
}

// Expone las etapas disponibles por tipo de proceso (comprador/vendedor) junto
// con sus etiquetas y el orden global. Lo usa el frontend para renderizar el
// embudo sin duplicar la lógica.
const stages = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      byProcess: STAGES_BY_PROCESS,
      order: STAGE_ORDER,
      labels: STAGE_LABELS,
    },
  });
});

const businessCrud = buildCrud(Business, {
  populate: ['buyerClient', 'sellerClient', 'property', 'mainAdvisor', 'partnerAdvisor', 'ticket'],
  searchFields: ['name'],
  // Filtros por etapa, tipo de proceso, cliente y propiedad.
  extraFilters: { currentStage: 'currentStage', processType: 'processType', buyerClient: 'buyerClient', sellerClient: 'sellerClient', property: 'property' },
  // Un negocio pertenece al asesor principal o al socio que participa.
  ownerMatch: (userId) => ({ $or: [{ mainAdvisor: userId }, { partnerAdvisor: userId }] }),
});

const list = businessCrud.list;
const get = businessCrud.get;

function assertOwnership(req, business) {
  if (isBoss(req)) return true;
  const uid = String(req.user._id);
  const main = String((business.mainAdvisor && business.mainAdvisor._id) || business.mainAdvisor || '');
  const partner = String((business.partnerAdvisor && business.partnerAdvisor._id) || business.partnerAdvisor || '');
  return main === uid || partner === uid;
}

// Los negocios se crean SIEMPRE a mano desde este módulo (ya no hay ningún
// trigger por etapa del cliente). Estas funciones mantienen el vínculo
// Cliente.negocioId al día para que la tarjeta del cliente muestre la insignia
// "Negocio vinculado" y el botón para abrirlo.
const idOf = (v) => (v && typeof v === 'object' ? v._id : v) || null;

// Punto los clientes indicados hacia este negocio y libero los que dejaron de
// estar en él (para no dejar insignias apuntando a un negocio equivocado).
async function sincronizarClientes(business, anteriores = []) {
  const nuevos = [idOf(business.buyerClient), idOf(business.sellerClient)].filter(Boolean);
  const ids = Array.from(new Set([...anteriores, ...nuevos].map(String)));
  if (!ids.length) return;
  await Client.updateMany(
    { _id: { $in: ids }, negocioId: business._id },
    { $set: { negocioId: null } }
  );
  if (nuevos.length) {
    await Client.updateMany(
      { _id: { $in: nuevos.map(String) } },
      { $set: { negocioId: business._id } }
    );
  }
}

// Un cliente no puede tener dos negocios activos a la vez, ni como comprador ni
// como vendedor: `Cliente.negocioId` es una referencia única, así que un segundo
// negocio activo dejaría la insignia del cliente apuntando solo al último.
//
// El índice único parcial del esquema es el seguro definitivo (protege contra
// dos clics simultáneos), pero aquí se revisa antes de insertar para poder
// devolver un mensaje útil en lugar de un error de clave duplicada.
async function conflictoNegocioActivo({ buyerClient, sellerClient, excludeId }) {
  const condiciones = [];
  if (buyerClient) condiciones.push({ buyerClient });
  if (sellerClient) condiciones.push({ sellerClient });
  if (!condiciones.length) return null;

  const filtro = { status: 'activo', $or: condiciones };
  if (excludeId) filtro._id = { $ne: excludeId };

  const encontrado = await Business.findOne(filtro)
    .select('name processType currentStage buyerClient sellerClient')
    .populate('buyerClient', 'nombre')
    .populate('sellerClient', 'nombre')
    .lean();
  if (!encontrado) return null;

  // El cliente se elige como "el que ya tiene negocio": el comprador si coincide
  // con el comprador del negocio encontrado; si no, es el vendedor.
  const ref = encontrado.buyerClient;
  const coincideComprador = buyerClient && ref && String(ref._id || ref) === String(buyerClient);
  const cliente = encontrado[coincideComprador ? 'buyerClient' : 'sellerClient'];
  const nombre = (cliente && (cliente.nombre || cliente.name)) || 'ese cliente';
  const rol = coincideComprador ? 'comprador' : 'vendedor';
  const etapa = STAGE_LABELS[encontrado.currentStage] || encontrado.currentStage;

  return `${nombre} ya tiene el negocio activo "${encontrado.name}" como ${rol} (etapa: ${etapa}). `
    + 'Concluye o cancela ese negocio antes de abrir otro para el mismo cliente.';
}

// El índice único parcial puede dispararse entre la revisión previa y el INSERT
// (dos peticiones simultáneas). Se traduce a un 409 con el mismo mensaje.
function esErrorDuplicado(error) {
  return Boolean(error) && (error.code === 11000 || error.code === 11001);
}

const create = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  if (body.currentStage) body.currentStage = normalizarEtapa(body.currentStage);
  if (!isBoss(req)) {
    body.mainAdvisor = req.user._id; // un asesor solo crea negocios propios
    if (body.partnerAdvisor && String(body.partnerAdvisor) === String(req.user._id)) {
      body.partnerAdvisor = undefined;
    }
  }
  // Los jefes pueden crear negocios sin elegir asesor: se asigna por defecto
  // el usuario que los creó (el esquema exige mainAdvisor).
  if (!body.mainAdvisor) {
    body.mainAdvisor = req.user._id;
  }

  // Solo se revisa el duplicado si el negocio va a quedar activo, que es lo que
  // cubre el índice único: uno creado ya cerrado no bloquea al cliente.
  if (body.status !== 'concluido' && body.status !== 'cancelado') {
    const conflicto = await conflictoNegocioActivo({
      buyerClient: body.buyerClient,
      sellerClient: body.sellerClient,
    });
    if (conflicto) {
      return res.status(409).json({ success: false, message: conflicto });
    }
  }

  let business;
  try {
    business = await Business.create(body);
  } catch (error) {
    if (esErrorDuplicado(error)) {
      const msg = await conflictoNegocioActivo({
        buyerClient: body.buyerClient,
        sellerClient: body.sellerClient,
      });
      return res.status(409).json({
        success: false,
        message: msg || 'Ese cliente ya tiene un negocio activo. No se puede crear otro.',
      });
    }
    throw error;
  }

  await BusinessStage.create({
    business: business._id,
    stageCode: business.currentStage,
    name: STAGE_LABELS[business.currentStage],
    order: STAGE_ORDER.indexOf(business.currentStage),
    startedAt: new Date(),
    status: 'en_proceso',
  });

  // Vínculo con el cliente (no bloquea la creación si el update falla).
  await sincronizarClientes(business).catch(() => {});

  await logActivity({
    entityType: 'Business',
    entityId: business._id,
    user: req.user._id,
    action: 'creacion',
    message: `Se creó el negocio ${business.name}`,
  });

  const advisorId = business.mainAdvisor && (business.mainAdvisor._id || business.mainAdvisor);
  if (advisorId) {
    ensure({
      type: 'nuevo_negocio',
      key: `business-${business._id}`,
      title: 'Nuevo negocio',
      message: `Se creó el negocio "${business.name}".`,
      userId: advisorId,
      data: { entityId: business._id },
    }).catch(() => {});
  }

  await business.populate(['buyerClient', 'sellerClient', 'property', 'mainAdvisor', 'partnerAdvisor']);

  // Nota en el chat interno + aviso al resto del equipo (solo si el negocio va
  // ligado a una propiedad). No bloquea ni condiciona la respuesta.
  if (business.property) {
    notifyTeamPropertyBusiness(req, business);
  }

  res.status(201).json({ success: true, data: business });
});

const update = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id);
  if (!business) return res.status(404).json({ success: false, message: 'Negocio no encontrado' });
  if (!assertOwnership(req, business)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este negocio.' });
  }

  const changed = {};
  Object.keys(req.body).forEach((key) => {
    if (JSON.stringify(req.body[key]) !== JSON.stringify(business[key])) {
      changed[key] = { previous: business[key], current: req.body[key] };
    }
  });

  // Clientes vinculados antes del guardado: por si el formulario cambió el
  // comprador o el vendedor hay que soltar el vínculo del que quedó fuera.
  const clientesPrevios = [idOf(business.buyerClient), idOf(business.sellerClient)].filter(Boolean);

  // Si el formulario mueve el negocio a otro cliente, ese cliente tampoco puede
  // tener ya otro negocio activo (el negocio actual se excluye del chequeo).
  // Solo se revisa si este negocio sigue activo, que es exactamente lo que
  // cubre el índice único parcial: un negocio ya cerrado puede vincularse con un
  // cliente que tenga otro negocio en curso sin problema.
  if (business.status === 'activo'
    && (req.body.buyerClient !== undefined || req.body.sellerClient !== undefined)) {
    const conflicto = await conflictoNegocioActivo({
      buyerClient: req.body.buyerClient !== undefined ? req.body.buyerClient : idOf(business.buyerClient),
      sellerClient: req.body.sellerClient !== undefined ? req.body.sellerClient : idOf(business.sellerClient),
      excludeId: business._id,
    });
    if (conflicto) {
      return res.status(409).json({ success: false, message: conflicto });
    }
  }

  Object.assign(business, req.body);
  try {
    await business.save();
  } catch (error) {
    if (esErrorDuplicado(error)) {
      const msg = await conflictoNegocioActivo({
        buyerClient: idOf(business.buyerClient),
        sellerClient: idOf(business.sellerClient),
        excludeId: business._id,
      });
      return res.status(409).json({
        success: false,
        message: msg || 'Ese cliente ya tiene un negocio activo. No se puede asignar dos veces.',
      });
    }
    throw error;
  }

  await sincronizarClientes(business, clientesPrevios).catch(() => {});

  Object.entries(changed).forEach(([field, values]) => {
    logAudit({
      user: req.user._id,
      action: 'actualizacion',
      entity: 'Business',
      entityId: business._id,
      field,
      previousValue: values.previous,
      newValue: values.current,
    });
  });

  await logActivity({
    entityType: 'Business',
    entityId: business._id,
    user: req.user._id,
    action: 'actualizacion',
    message: `Se actualizó el negocio ${business.name}`,
  });

  await business.populate(['buyerClient', 'sellerClient', 'property', 'mainAdvisor', 'partnerAdvisor', 'ticket']);

  res.json({ success: true, data: business });
});

// Borrado propio (NO se reutiliza businessCrud.remove): el CRUD genérico exige
// un `ownerField` y este modelo no lo tiene, así que un asesor nunca pasaba la
// comprobación y el botón "Eliminar" siempre respondía 403. Aquí se usa la
// misma regla que update/changeStage: jefe, asesor principal o partner.
const remove = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id);
  if (!business) return res.status(404).json({ success: false, message: 'Negocio no encontrado' });
  if (!assertOwnership(req, business)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este negocio.' });
  }

  const clientes = [idOf(business.buyerClient), idOf(business.sellerClient)].filter(Boolean);
  if (clientes.length) {
    await Client.updateMany(
      { _id: { $in: clientes.map(String) }, negocioId: business._id },
      { $set: { negocioId: null } }
    ).catch(() => {});
  }

  await BusinessStage.deleteMany({ business: business._id });
  await business.deleteOne();

  await logActivity({
    entityType: 'Business',
    entityId: business._id,
    user: req.user._id,
    action: 'eliminacion',
    message: `Se eliminó el negocio ${business.name}`,
  });

  res.json({ success: true, message: 'Registro eliminado' });
});

const changeStage = asyncHandler(async (req, res) => {
  const stage = normalizarEtapa(req.body.stage);
  const note = String((req.body.nota || req.body.comments || req.body.note || '')).trim();
  const business = await Business.findById(req.params.id);
  if (!business) return res.status(404).json({ success: false, message: 'Negocio no encontrado' });
  if (!assertOwnership(req, business)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este negocio.' });
  }

  if (!note) {
    return res.status(400).json({ success: false, message: 'La nota es obligatoria para cambiar de etapa' });
  }

  const allowed = [...stagesFor(business.processType), 'cancelado', 'PAUSA', 'CANCELADO_DEFINITIVO'];
  if (!allowed.includes(stage)) {
    return res.status(400).json({
      success: false,
      message: `La etapa "${stage}" no pertenece al proceso de ${business.processType === 'vendedor' ? 'vendedor' : 'comprador'}.`,
    });
  }

  const previousStage = normalizarEtapa(business.currentStage);
  if (previousStage === stage) {
    return res.status(400).json({ success: false, message: 'El negocio ya está en esa etapa' });
  }

  const previousStageRecord = await BusinessStage.findOne({
    business: business._id,
    stageCode: { $in: Array.from(new Set([previousStage, business.currentStage])) },
    status: 'en_proceso',
  });
  if (previousStageRecord) {
    previousStageRecord.finishedAt = new Date();
    previousStageRecord.status = 'completada';
    if (!previousStageRecord.comments && note) previousStageRecord.comments = note;
    await previousStageRecord.save();
  }

  business.currentStage = stage;
  if (stage === 'concluido') {
    business.status = 'concluido';
    business.finishedAt = new Date();
  } else if (stage === 'cancelado' || stage === 'CANCELADO_DEFINITIVO') {
    business.status = 'cancelado';
    business.finishedAt = new Date();
  } else if (stage === 'PAUSA') {
    business.status = 'cancelado';
  } else {
    business.status = 'activo';
  }
  await business.save();

  await BusinessStage.create({
    business: business._id,
    stageCode: stage,
    name: STAGE_LABELS[stage],
    order: STAGE_ORDER.indexOf(stage),
    startedAt: new Date(),
    status: 'en_proceso',
    comments: note,
    responsibleUser: req.user._id,
  });

  await logAudit({
    user: req.user._id,
    action: 'actualizacion',
    entity: 'Business',
    entityId: business._id,
    field: 'currentStage',
    previousValue: previousStage,
    newValue: stage,
  });

  await logActivity({
    entityType: 'Business',
    entityId: business._id,
    user: req.user._id,
    action: 'cambio_etapa',
    message: `Cambió de ${STAGE_LABELS[previousStage]} a ${STAGE_LABELS[stage]}`,
  });

  const stageAdvisorId = idOf(business.mainAdvisor);
  if (stageAdvisorId) {
    ensure({
      type: 'cambio_etapa',
      key: `stage-${business._id}-${stage}`,
      title: 'Cambio de etapa',
      message: `El negocio "${business.name}" cambió a ${STAGE_LABELS[stage]}.`,
      userId: stageAdvisorId,
      data: { entityId: business._id },
    }).catch(() => {});
  }

  res.json({
    success: true,
    message: `Etapa actualizada a ${STAGE_LABELS[stage]}`,
    data: business,
  });
});

const history = asyncHandler(async (req, res) => {
  const stages = await BusinessStage.find({ business: req.params.id })
    .populate('responsibleUser')
    .sort({ order: 1, startedAt: 1 });
  res.json({ success: true, data: stages });
});

// Catálogo LIGERO de negocios para selects con búsqueda (cita/prospecto/
// inventario/egresos). Devuelve solo _id, nombre y etapa para no arrastrar el
// documento completo, y acepta ?q para filtrar en el servidor (escalable:
// el select nunca despliega toda la lista).
const options = asyncHandler(async (req, res) => {
  const filter = {};
  // Un asesor solo ve los negocios de los que es principal o socio; un jefe ve
  // todos (y puede acotar con ?asesor=).
  if (!isBoss(req)) {
    filter.$or = [{ mainAdvisor: req.user._id }, { partnerAdvisor: req.user._id }];
  } else if (req.query.asesor) {
    filter.$or = [{ mainAdvisor: req.query.asesor }, { partnerAdvisor: req.query.asesor }];
  }
  if (req.query.processType) filter.processType = req.query.processType;

  const q = String(req.query.q || '').trim();
  if (q) {
    const term = String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.name = { $regex: term, $options: 'i' };
  }

  const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);
  const items = await Business.find(filter)
    .select('name currentStage processType')
    .sort({ name: 1 })
    .limit(limit)
    .lean();

  // `label`/`subtitle` ya armados para el select remoto.
  const data = items.map((b) => ({
    ...b,
    label: b.name || 'Negocio',
    subtitle: STAGE_LABELS[b.currentStage] || String(b.currentStage || '').replace(/_/g, ' '),
  }));

  res.json({ success: true, data });
});

// Negocios ABIERTOS ligados a una propiedad. Se consulta desde el inventario
// general para avisar, sin importar quién sea el dueño del negocio, que la
// propiedad ya está trabajada por un compañero.
const propertyBusinesses = asyncHandler(async (req, res) => {
  const propertyId = req.params.propertyId;
  if (!propertyId) {
    return res.status(400).json({ success: false, message: 'Se requiere la propiedad' });
  }
  const items = await Business.find({ property: propertyId, status: 'activo' })
    .select('name currentStage processType mainAdvisor createdAt')
    .populate('mainAdvisor', 'name')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ success: true, data: items });
});

module.exports = { list, get, options, create, update, remove, changeStage, history, propertyBusinesses, stages, stagesFor, STAGE_ORDER, STAGE_LABELS, STAGES_BY_PROCESS };
