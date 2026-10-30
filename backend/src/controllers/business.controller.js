'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const buildCrud = require('../utils/crud');
const {
  isBoss,
  isBusinessStaff,
  hasRole,
} = require('../utils/scope');
const {
  Business,
  BusinessStage,
  BusinessNote,
  Client,
  Property,
  Document,
} = require('../models');
const { logActivity, logAudit } = require('../services/log.service');
const { ensure } = require('../services/notification.service');
const { getOrCreateGeneralChat, persistAndBroadcast } = require('./chat.controller');
const {
  STAGE_ORDER,
  STAGE_LABELS,
  STAGE_ALIASES,
  normalizeStage,
  stageLabel,
  stageOrder,
} = require('../constants/business-stages');

// Etapas del embudo "en curso". Las terminales (concluido/cancelado/pausa)
// se agregan aparte en el tablero y en los selectores.
const ACTIVE_STAGES = STAGE_ORDER.filter(
  (s) => !['concluido', 'cancelado', 'PAUSA'].includes(s)
);

// Se conservan ambos procesos (comprador/vendedor) apuntando al mismo flujo
// oficial: la etapa ya no cambia según el tipo de proceso.
const STAGES_BY_PROCESS = {
  comprador: ACTIVE_STAGES,
  vendedor: ACTIVE_STAGES,
};

function stagesFor(processType) {
  return STAGES_BY_PROCESS[processType] || ACTIVE_STAGES;
}

// Etapas válidas para el PATCH /stage (canónicas + alias heredados que el
// controlador normaliza antes de guardar).
const VALID_STAGE_CODES = new Set([
  ...STAGE_ORDER,
  ...Object.keys(STAGE_ALIASES),
]);

function canManageBusiness(req) {
  return isBoss(req) || hasRole(req, ['asistencia']);
}

// Escrituración cambia etapas, concluye negocios, agrega notas/checklist y
// sube documentos. Gerencia (jefe) también puede cancelar/concluir.
function canChangeStage(req) {
  return isBoss(req) || hasRole(req, ['escrituracion']);
}

function canManageChecklist(req) {
  return isBoss(req) || hasRole(req, ['escrituracion']);
}

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

// Expone las etapas disponibles por tipo de proceso junto con sus etiquetas y
// el orden global. Lo usa el frontend para renderizar el embudo sin duplicar
// la lógica.
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
  // Asistencia y escrituración operan todos los negocios sin ser jefes.
  wideRoles: ['asistencia', 'escrituracion'],
});

const list = businessCrud.list;
const get = businessCrud.get;

function assertOwnership(req, business) {
  if (isBusinessStaff(req)) return true;
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
  const etapa = stageLabel(encontrado.currentStage);

  return `${nombre} ya tiene el negocio activo "${encontrado.name}" como ${rol} (etapa: ${etapa}). `
    + 'Concluye o cancela ese negocio antes de abrir otro para el mismo cliente.';
}

// El índice único parcial puede dispararse entre la revisión previa y el INSERT
// (dos peticiones simultáneas). Se traduce a un 409 con el mismo mensaje.
function esErrorDuplicado(error) {
  return Boolean(error) && (error.code === 11000 || error.code === 11001);
}

// Completa el vendedor con el PROPIETARIO de la propiedad elegida. El
// propietario puede ser un cliente de la cartera (`owner`) o un nombre libre
// (`ownerName`); solo se rellena cuando el formulario no trajo vendedor.
async function completarVendedorDesdePropiedad(body) {
  if (!body || !body.property) return body;
  if (body.sellerClient || String(body.sellerExternalName || '').trim()) return body;
  const prop = await Property.findById(body.property)
    .select('owner ownerName')
    .lean()
    .catch(() => null);
  if (!prop) return body;
  if (prop.owner) {
    body.sellerClient = prop.owner;
  } else if (prop.ownerName) {
    body.sellerExternalName = prop.ownerName;
  }
  return body;
}

// Sincroniza el estado de la propiedad ligada con el ciclo de vida del negocio:
//  - negocio activo (incluida pausa) → propiedad APARTADA
//  - negocio concluido             → propiedad CONCLUIDA
//  - negocio cancelado             → propiedad DISPONIBLE (se libera)
async function sincronizarPropiedad(business, previousStatus = null) {
  const propertyId = idOf(business && business.property);
  if (!propertyId) return;
  const property = await Property.findById(propertyId);
  if (!property) return;

  let nextStatus = null;
  if (business.status === 'concluido') {
    nextStatus = 'concluida';
  } else if (business.status === 'cancelado') {
    nextStatus = 'disponible';
  } else if (business.status === 'activo') {
    // Al reabrir un negocio, la propiedad vuelve a quedar apartada.
    if (previousStatus !== 'activo' || property.status === 'disponible' || !property.status) {
      nextStatus = 'apartada';
    }
  }

  if (!nextStatus || property.status === nextStatus) return;
  property.status = nextStatus;
  await property.save();
  await logActivity({
    entityType: 'Property',
    entityId: property._id,
    user: business.mainAdvisor || null,
    action: 'cambio_estado',
    message: `El negocio "${business.name}" actualizó la propiedad a "${nextStatus}".`,
  });
}

// Registro de bitácora de etapas (BusinessStage). Se usa tanto al crear como
// al cambiar de etapa o al reabrir un negocio.
async function registrarEtapa(business, stage, { note = '', user = null, status = 'en_proceso' } = {}) {
  return BusinessStage.create({
    business: business._id,
    stageCode: stage,
    name: stageLabel(stage),
    order: stageOrder(stage),
    startedAt: new Date(),
    status,
    comments: note,
    responsibleUser: user,
  });
}

async function crearNota(business, req, text, stage) {
  const note = await BusinessNote.create({
    business: business._id,
    stage: stage || normalizeStage(business.currentStage),
    text,
    createdBy: req.user._id,
  });
  await note.populate('createdBy', 'name username');
  return note;
}

// Aplica la transición de ciclo de vida al negocio a partir de la etapa.
function aplicarCicloDeVida(business, stage, { finished = true } = {}) {
  const code = normalizeStage(stage);
  if (code === 'concluido') {
    business.status = 'concluido';
    business.finishedAt = finished ? new Date() : business.finishedAt;
  } else if (code === 'cancelado') {
    business.status = 'cancelado';
    business.finishedAt = finished ? new Date() : business.finishedAt;
  } else if (code === 'PAUSA') {
    business.status = 'activo';
    business.finishedAt = null;
  } else {
    business.status = 'activo';
    business.finishedAt = null;
  }
  business.currentStage = code;
}

const create = asyncHandler(async (req, res) => {
  if (!canManageBusiness(req)) {
    return res.status(403).json({
      success: false,
      message: 'Solo dirección, gerencia o asistencia pueden crear negocios.',
    });
  }

  const body = { ...req.body };
  if (body.currentStage) body.currentStage = normalizeStage(body.currentStage);
  // Asistencia puede asignar a cualquier asesor; el resto de quien crea queda
  // como asesor principal por defecto.
  if (!canManageBusiness(req) && !isBoss(req)) {
    body.mainAdvisor = req.user._id;
  }
  if (body.partnerAdvisor && String(body.partnerAdvisor) === String(req.user._id)) {
    body.partnerAdvisor = undefined;
  }
  // Los jefes/asistencia pueden crear negocios sin elegir asesor: se asigna por
  // defecto el usuario que los creó (el esquema exige mainAdvisor).
  if (!body.mainAdvisor) {
    body.mainAdvisor = req.user._id;
  }

  // El vendedor sale del propietario de la propiedad si no se eligió uno.
  await completarVendedorDesdePropiedad(body);

  const initialStage = normalizeStage(body.currentStage) || 'PROMESA';
  if (!body.currentStage) body.currentStage = initialStage;
  aplicarCicloDeVida(body, initialStage, { finished: false });

  // Solo se revisa el duplicado si el negocio va a quedar activo, que es lo que
  // cubre el índice único: uno creado ya cerrado no bloquea al cliente.
  if (body.status === 'activo') {
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

  await registrarEtapa(business, business.currentStage, {
    user: req.user._id,
    status: business.status === 'activo' ? 'en_proceso' : 'completada',
  });

  // Vínculo con el cliente y estado de la propiedad (no bloquean la creación).
  await sincronizarClientes(business).catch(() => {});
  await sincronizarPropiedad(business).catch(() => {});

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
  if (!canManageBusiness(req)) {
    return res.status(403).json({
      success: false,
      message: 'Solo dirección, gerencia o asistencia pueden editar los datos del negocio.',
    });
  }

  const previousStatus = business.status;
  const previousStage = normalizeStage(business.currentStage);
  const body = { ...req.body };

  if (body.currentStage !== undefined) {
    body.currentStage = normalizeStage(body.currentStage);
    if (body.currentStage !== previousStage && !canChangeStage(req)) {
      return res.status(403).json({
        success: false,
        message: 'Solo dirección, gerencia o escrituración pueden cambiar la etapa del negocio.',
      });
    }
  }
  if (body.status !== undefined && body.status !== previousStatus && !canChangeStage(req)) {
    return res.status(403).json({
      success: false,
      message: 'Solo dirección, gerencia o escrituración pueden concluir o cancelar negocios.',
    });
  }

  const changed = {};
  Object.keys(body).forEach((key) => {
    if (JSON.stringify(body[key]) !== JSON.stringify(business[key])) {
      changed[key] = { previous: business[key], current: body[key] };
    }
  });

  // Clientes vinculados antes del guardado: por si el formulario cambió el
  // comprador o el vendedor hay que soltar el vínculo del que quedó fuera.
  const clientesPrevios = [idOf(business.buyerClient), idOf(business.sellerClient)].filter(Boolean);

  // Si se cambió la propiedad y no hay vendedor, se toma el propietario de la
  // nueva propiedad.
  if (body.property && String(body.property) !== String(idOf(business.property) || '')) {
    await completarVendedorDesdePropiedad(body);
  }

  // Si el formulario mueve el negocio a otro cliente, ese cliente tampoco puede
  // tener ya otro negocio activo (el negocio actual se excluye del chequeo).
  if (business.status === 'activo'
    && (body.buyerClient !== undefined || body.sellerClient !== undefined)) {
    const conflicto = await conflictoNegocioActivo({
      buyerClient: body.buyerClient !== undefined ? body.buyerClient : idOf(business.buyerClient),
      sellerClient: body.sellerClient !== undefined ? body.sellerClient : idOf(business.sellerClient),
      excludeId: business._id,
    });
    if (conflicto) {
      return res.status(409).json({ success: false, message: conflicto });
    }
  }

  Object.assign(business, body);

  // Si la etapa o el estado cambiaron, se aplica el ciclo de vida completo.
  if (body.currentStage !== undefined || body.status !== undefined) {
    const targetStage = body.currentStage !== undefined
      ? normalizeStage(body.currentStage)
      : normalizeStage(business.currentStage);

    if (body.status === 'concluido' && targetStage !== 'concluido') {
      aplicarCicloDeVida(business, 'concluido');
    } else if (body.status === 'cancelado' && targetStage !== 'cancelado') {
      aplicarCicloDeVida(business, 'cancelado');
    } else if (body.status === 'activo' && ['concluido', 'cancelado'].includes(targetStage)) {
      // Reapertura: vuelve al inicio del embudo y libera la fecha de cierre.
      aplicarCicloDeVida(business, 'PROMESA', { finished: false });
      if (body.currentStage === undefined) business.currentStage = 'PROMESA';
    } else {
      aplicarCicloDeVida(business, targetStage);
    }
  }

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

  if (normalizeStage(business.currentStage) !== previousStage) {
    await registrarEtapa(business, business.currentStage, {
      user: req.user._id,
      status: business.status === 'activo' ? 'en_proceso' : 'completada',
    }).catch(() => {});
  }

  await sincronizarClientes(business, clientesPrevios).catch(() => {});
  await sincronizarPropiedad(business, previousStatus).catch(() => {});

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
// comprobación y el botón "Eliminar" siempre respondía 403.
const remove = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id);
  if (!business) return res.status(404).json({ success: false, message: 'Negocio no encontrado' });
  if (!assertOwnership(req, business)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este negocio.' });
  }
  if (!canManageBusiness(req)) {
    return res.status(403).json({
      success: false,
      message: 'Solo dirección, gerencia o asistencia pueden eliminar negocios.',
    });
  }

  const clientes = [idOf(business.buyerClient), idOf(business.sellerClient)].filter(Boolean);
  if (clientes.length) {
    await Client.updateMany(
      { _id: { $in: clientes.map(String) }, negocioId: business._id },
      { $set: { negocioId: null } }
    ).catch(() => {});
  }

  // La propiedad se libera si seguía apartada por este negocio.
  const propertyId = idOf(business.property);
  if (propertyId) {
    await Property.updateOne(
      { _id: propertyId, status: 'apartada' },
      { $set: { status: 'disponible' } }
    ).catch(() => {});
  }

  await BusinessStage.deleteMany({ business: business._id });
  await BusinessNote.deleteMany({ business: business._id });
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
  const stage = normalizeStage(req.body.stage);
  const note = String((req.body.nota || req.body.comments || req.body.note || '')).trim();
  const business = await Business.findById(req.params.id);
  if (!business) return res.status(404).json({ success: false, message: 'Negocio no encontrado' });
  if (!assertOwnership(req, business)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este negocio.' });
  }
  if (!canChangeStage(req)) {
    return res.status(403).json({
      success: false,
      message: 'Solo dirección, gerencia o escrituración pueden cambiar la etapa del negocio.',
    });
  }

  if (!note) {
    return res.status(400).json({ success: false, message: 'La nota es obligatoria para cambiar de etapa' });
  }

  if (!stage || !VALID_STAGE_CODES.has(stage) || !STAGE_ORDER.includes(stage)) {
    return res.status(400).json({
      success: false,
      message: `La etapa "${req.body.stage}" no es válida.`,
    });
  }

  const previousStatus = business.status;
  const previousStage = normalizeStage(business.currentStage);
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

  aplicarCicloDeVida(business, stage);
  await business.save();

  await registrarEtapa(business, stage, {
    note,
    user: req.user._id,
    status: business.status === 'activo' ? 'en_proceso' : 'completada',
  });

  // La nota del cambio de etapa también queda en la bitácora visible.
  await crearNota(business, req, note, stage).catch(() => {});

  await sincronizarPropiedad(business, previousStatus).catch(() => {});

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
    message: `Cambió de ${stageLabel(previousStage)} a ${stageLabel(stage)}`,
  });

  const stageAdvisorId = idOf(business.mainAdvisor);
  if (stageAdvisorId) {
    ensure({
      type: 'cambio_etapa',
      key: `stage-${business._id}-${stage}`,
      title: 'Cambio de etapa',
      message: `El negocio "${business.name}" cambió a ${stageLabel(stage)}.`,
      userId: stageAdvisorId,
      data: { entityId: business._id },
    }).catch(() => {});
  }

  res.json({
    success: true,
    message: `Etapa actualizada a ${stageLabel(stage)}`,
    data: business,
  });
});

const history = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id).select('mainAdvisor partnerAdvisor');
  if (!business) return res.status(404).json({ success: false, message: 'Negocio no encontrado' });
  if (!assertOwnership(req, business)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este negocio.' });
  }
  const stages = await BusinessStage.find({ business: req.params.id })
    .populate('responsibleUser')
    .sort({ order: 1, startedAt: 1 });
  res.json({ success: true, data: stages });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bitácora / notas del negocio
// ─────────────────────────────────────────────────────────────────────────────

const listNotes = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id).select('mainAdvisor partnerAdvisor name');
  if (!business) return res.status(404).json({ success: false, message: 'Negocio no encontrado' });
  if (!assertOwnership(req, business)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este negocio.' });
  }
  const notes = await BusinessNote.find({ business: business._id })
    .populate('createdBy', 'name username')
    .sort({ createdAt: -1 });
  res.json({ success: true, data: notes });
});

const addNote = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id);
  if (!business) return res.status(404).json({ success: false, message: 'Negocio no encontrado' });
  if (!assertOwnership(req, business)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este negocio.' });
  }
  const text = String(req.body.text || req.body.note || req.body.nota || '').trim();
  if (!text) {
    return res.status(400).json({ success: false, message: 'La nota es obligatoria' });
  }
  const note = await crearNota(business, req, text, normalizeStage(business.currentStage));
  await logActivity({
    entityType: 'Business',
    entityId: business._id,
    user: req.user._id,
    action: 'nota',
    message: `Se agregó una nota al negocio ${business.name}`,
  });
  res.status(201).json({ success: true, data: note });
});

const removeNote = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id).select('mainAdvisor partnerAdvisor');
  if (!business) return res.status(404).json({ success: false, message: 'Negocio no encontrado' });
  if (!assertOwnership(req, business)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este negocio.' });
  }
  const note = await BusinessNote.findOne({ _id: req.params.noteId, business: business._id });
  if (!note) return res.status(404).json({ success: false, message: 'Nota no encontrada' });
  const isAuthor = String(note.createdBy) === String(req.user._id);
  if (!isAuthor && !canManageChecklist(req)) {
    return res.status(403).json({ success: false, message: 'No puedes eliminar esta nota.' });
  }
  await note.deleteOne();
  res.json({ success: true, message: 'Nota eliminada' });
});

// ─────────────────────────────────────────────────────────────────────────────
// Checklist del negocio
// ─────────────────────────────────────────────────────────────────────────────

async function findBusinessForChecklist(req, res) {
  const business = await Business.findById(req.params.id);
  if (!business) {
    res.status(404).json({ success: false, message: 'Negocio no encontrado' });
    return null;
  }
  if (!assertOwnership(req, business)) {
    res.status(403).json({ success: false, message: 'No tienes acceso a este negocio.' });
    return null;
  }
  return business;
}

const addChecklistItem = asyncHandler(async (req, res) => {
  const business = await findBusinessForChecklist(req, res);
  if (!business) return undefined;
  if (!canManageChecklist(req)) {
    return res.status(403).json({
      success: false,
      message: 'Solo dirección, gerencia o escrituración pueden editar el checklist.',
    });
  }
  const text = String(req.body.text || req.body.otro || '').trim();
  if (!text) {
    return res.status(400).json({ success: false, message: 'Escribe el pendiente del checklist' });
  }
  business.checklist.push({ text, createdBy: req.user._id });
  await business.save();
  await logActivity({
    entityType: 'Business',
    entityId: business._id,
    user: req.user._id,
    action: 'checklist',
    message: `Se agregó un pendiente al checklist de ${business.name}`,
  });
  res.status(201).json({ success: true, data: business.checklist });
});

const updateChecklistItem = asyncHandler(async (req, res) => {
  const business = await findBusinessForChecklist(req, res);
  if (!business) return undefined;
  if (!canManageChecklist(req)) {
    return res.status(403).json({
      success: false,
      message: 'Solo dirección, gerencia o escrituración pueden editar el checklist.',
    });
  }
  const item = business.checklist.id(req.params.itemId);
  if (!item) return res.status(404).json({ success: false, message: 'Pendiente no encontrado' });

  if (req.body.text !== undefined) {
    const text = String(req.body.text || '').trim();
    if (!text) return res.status(400).json({ success: false, message: 'El texto no puede estar vacío' });
    item.text = text;
  }
  if (req.body.done !== undefined) {
    item.done = Boolean(req.body.done);
    item.completedAt = item.done ? new Date() : null;
    item.completedBy = item.done ? req.user._id : null;
  }
  await business.save();
  res.json({ success: true, data: business.checklist });
});

const removeChecklistItem = asyncHandler(async (req, res) => {
  const business = await findBusinessForChecklist(req, res);
  if (!business) return undefined;
  if (!canManageChecklist(req)) {
    return res.status(403).json({
      success: false,
      message: 'Solo dirección, gerencia o escrituración pueden editar el checklist.',
    });
  }
  const item = business.checklist.id(req.params.itemId);
  if (!item) return res.status(404).json({ success: false, message: 'Pendiente no encontrado' });
  item.deleteOne();
  await business.save();
  res.json({ success: true, data: business.checklist });
});

// ─────────────────────────────────────────────────────────────────────────────
// Documentos / fotos ligeras del negocio
// ─────────────────────────────────────────────────────────────────────────────

async function findBusinessForDocuments(req, res) {
  const business = await Business.findById(req.params.id);
  if (!business) {
    res.status(404).json({ success: false, message: 'Negocio no encontrado' });
    return null;
  }
  if (!assertOwnership(req, business)) {
    res.status(403).json({ success: false, message: 'No tienes acceso a este negocio.' });
    return null;
  }
  return business;
}

const listDocuments = asyncHandler(async (req, res) => {
  const business = await findBusinessForDocuments(req, res);
  if (!business) return undefined;
  const documents = await Document.find({ business: business._id })
    .populate('uploadedBy', 'name username')
    .sort({ createdAt: -1 });
  res.json({ success: true, data: documents });
});

const uploadDocument = asyncHandler(async (req, res) => {
  const business = await findBusinessForDocuments(req, res);
  if (!business) return undefined;
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No se recibió ningún archivo' });
  }

  await require('../services/storage.service').persistFile(req.file);

  const name = String(req.body.name || '').trim() || req.file.originalname || 'Documento';
  const doc = await Document.create({
    name,
    type: req.body.type || 'otros',
    status: 'recibido',
    date: new Date(),
    uploadedBy: req.user._id,
    business: business._id,
    observations: req.body.observations || '',
    fileName: req.file.filename,
    fileUrl: `/uploads/${req.file.filename}`,
  });

  if (!Array.isArray(business.documents)) business.documents = [];
  business.documents.push(doc._id);
  await business.save();

  await logActivity({
    entityType: 'Business',
    entityId: business._id,
    user: req.user._id,
    action: 'documento',
    message: `Se subió el documento "${doc.name}" al negocio ${business.name}`,
  });

  await doc.populate('uploadedBy', 'name username');
  res.status(201).json({ success: true, data: doc });
});

const removeDocument = asyncHandler(async (req, res) => {
  const business = await findBusinessForDocuments(req, res);
  if (!business) return undefined;
  const doc = await Document.findOne({ _id: req.params.docId, business: business._id });
  if (!doc) return res.status(404).json({ success: false, message: 'Documento no encontrado' });

  const isAuthor = String(doc.uploadedBy) === String(req.user._id);
  if (!isAuthor && !canManageChecklist(req)) {
    return res.status(403).json({ success: false, message: 'No puedes eliminar este documento.' });
  }

  const fileUrl = doc.fileUrl;
  await Document.deleteOne({ _id: doc._id });
  business.documents = (business.documents || []).filter((id) => String(id) !== String(doc._id));
  await business.save();

  try {
    await require('../services/storage.service').deleteFileIfUnused(fileUrl);
  } catch (error) {
    console.warn('[Storage] No se pudo eliminar el archivo del negocio:', error.message);
  }

  res.json({ success: true, message: 'Documento eliminado' });
});

// Catálogo LIGERO de negocios para selects con búsqueda (cita/prospecto/
// inventario/egresos). Devuelve solo _id, nombre y etapa para no arrastrar el
// documento completo, y acepta ?q para filtrar en el servidor (escalable:
// el select nunca despliega toda la lista).
const options = asyncHandler(async (req, res) => {
  const filter = {};
  // Un asesor solo ve los negocios de los que es principal o socio; staff de
  // negocios ve todos (y puede acotar con ?asesor=).
  if (!isBusinessStaff(req)) {
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
    subtitle: stageLabel(b.currentStage),
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

module.exports = {
  list,
  get,
  options,
  create,
  update,
  remove,
  changeStage,
  history,
  listNotes,
  addNote,
  removeNote,
  addChecklistItem,
  updateChecklistItem,
  removeChecklistItem,
  listDocuments,
  uploadDocument,
  removeDocument,
  propertyBusinesses,
  stages,
  stagesFor,
  STAGE_ORDER,
  STAGE_LABELS,
  STAGES_BY_PROCESS,
};
