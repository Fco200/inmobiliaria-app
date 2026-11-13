'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const buildCrud = require('../utils/crud');
const {
  isBoss,
  isBusinessStaff,
  hasRole,
  roleCode,
  isCustomRole,
  hasPermission,
  canAssignAdvisors,
  soloCampos,
} = require('../utils/scope');

// Campos de asesores que pueden reasignar Asistencia y Escrituración sin tener
// permiso de edición completa del negocio.
const CAMPOS_ASIGNACION_NEGOCIO = [
  'asesor_captador_id', 'mainAdvisor', 'captadorExternalName', 'captadorExternalPhone', 'captadorExternalEmail',
  'asesor_cliente_id', 'partnerAdvisor', 'partnerAdvisorName', 'partnerAdvisorPhone', 'partnerAdvisorEmail',
];
const {
  Business,
  BusinessStage,
  BusinessNote,
  Client,
  Property,
  Document,
  Ticket,
} = require('../models');
const { logActivity, logAudit } = require('../services/log.service');
const { ensure, emitToUsers } = require('../services/notification.service');
const {
  STAGE_ORDER,
  STAGE_LABELS,
  STAGE_ALIASES,
  normalizeStage,
  stageLabel,
  stageOrder,
} = require('../constants/business-stages');
const processFlow = require('../services/process.service');
const { updateGoalsAuto } = require('../services/goal-auto.service');
const { BUSINESS_CREATOR_ROLES } = require('../constants/roles');
const { CHECKLIST_TEMPLATE, CHECKLIST_TEMPLATE_VERSION } = require('../constants/business-checklist');

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
  return isBoss(req)
    || BUSINESS_CREATOR_ROLES.includes(roleCode(req))
    || (isCustomRole(req) && hasPermission(req, 'businesses_manage'));
}

// Escrituración cambia etapas, concluye negocios, agrega notas/checklist y
// sube documentos. Gerencia (jefe) también puede cancelar/concluir.
// Dirección, administración y soporte pueden saltarse las reglas del flujo.
function canOverrideFlow(req) {
  return ['direccion', 'admin', 'superadmin'].includes(roleCode(req));
}

function canChangeStage(req) {
  return isBoss(req)
    || hasRole(req, ['escrituracion'])
    || (isCustomRole(req) && hasPermission(req, 'businesses_manage'));
}

function canManageChecklist(req) {
  return isBoss(req)
    || hasRole(req, ['escrituracion', 'asistencia'])
    || (isCustomRole(req) && hasPermission(req, 'businesses_manage'));
}

// Expone las etapas disponibles por tipo de proceso junto con sus etiquetas y
// el orden global. Lo usa el frontend para renderizar el embudo sin duplicar
// la lógica.
const stages = asyncHandler(async (req, res) => {
  await processFlow.flow();
  res.json({ success: true, data: processFlow.describe() });
});

// GET /api/businesses/flow — configuración completa (para la pantalla de administración).
const getFlow = asyncHandler(async (req, res) => {
  await processFlow.flow();
  res.json({ success: true, data: processFlow.describe() });
});

// PUT /api/businesses/flow — solo dirección, administración y soporte.
const saveFlow = asyncHandler(async (req, res) => {
  const stagesInput = req.body && req.body.stages;
  try {
    await processFlow.saveFlow(stagesInput);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
  res.json({ success: true, message: 'Flujo de negocio guardado.', data: processFlow.describe() });
});

const businessCrud = buildCrud(Business, {
  populate: ['buyerClient', 'sellerClient', 'property', 'mainAdvisor', 'partnerAdvisor', 'asesor_captador_id', 'asesor_cliente_id', 'cliente_id', 'ticket'],
  searchFields: ['name'],
  // Filtros por etapa, tipo de proceso, cliente y propiedad.
  extraFilters: {
    currentStage: 'currentStage',
    processType: 'processType',
    buyerClient: 'buyerClient',
    sellerClient: 'sellerClient',
    property: 'property',
    // Asesor captador (interno) y asesor cerrador (interno).
    asesor: 'mainAdvisor',
    asesorCliente: 'asesor_cliente_id',
  },
  // ?externo=si|no: negocios donde participa un asesor externo (nombre libre).
  baseFilter: (req) => {
    const externo = String((req.query && req.query.externo) || '');
    if (externo === 'si') return { partnerAdvisorName: { $nin: ['', null] } };
    if (externo === 'no') return { partnerAdvisorName: { $in: ['', null] } };
    return null;
  },
  // Un negocio pertenece al asesor principal o al socio que participa (se
  // incluyen los alias explícitos por compatibilidad con datos históricos).
  ownerMatch: (userId) => ({
    $or: [
      { mainAdvisor: userId },
      { partnerAdvisor: userId },
      { asesor_captador_id: userId },
      { asesor_cliente_id: userId },
    ],
  }),
  // Asistencia y escrituración operan todos los negocios sin ser jefes.
  wideRoles: ['asistencia', 'escrituracion'],
  // Los roles personalizados con el módulo Negocios ven todos los negocios.
  widePermission: 'businesses_manage',
  // Filtro por fechas (?dateFrom / ?dateTo) sobre la fecha de alta del negocio.
  dateField: 'createdAt',
  // Los concluidos quedan al final: "activo" < "cancelado" < "concluido".
  sort: { status: 1, createdAt: -1 },
});

const list = businessCrud.list;
const get = businessCrud.get;

function assertOwnership(req, business) {
  if (isBusinessStaff(req)) return true;
  const uid = String(req.user._id);
  return ['mainAdvisor', 'partnerAdvisor', 'asesor_captador_id', 'asesor_cliente_id'].some((field) => {
    const value = business[field];
    const id = String((value && value._id) || value || '');
    return id === uid;
  });
}

// Los negocios se crean SIEMPRE a mano desde este módulo (ya no hay ningún
// trigger por etapa del cliente). Estas funciones mantienen el vínculo
// Cliente.negocioId al día para que la tarjeta del cliente muestre la insignia
// "Negocio vinculado" y el botón para abrirlo.
const idOf = (v) => (v && typeof v === 'object' ? v._id : v) || null;

// Personas involucradas en el negocio: captador, cerrador y socios asignados.
// Los avisos del negocio solo llegan a ellas, nunca a todo el equipo.
function participantesDelNegocio(business) {
  const ids = [business.mainAdvisor, business.partnerAdvisor, business.asesor_captador_id, business.asesor_cliente_id]
    .map(idOf)
    .filter(Boolean)
    .map(String);
  return Array.from(new Set(ids));
}

async function avisarParticipantes(business, actorId, { type, key, title, message }, userIds = null) {
  const ids = (userIds || participantesDelNegocio(business)).filter((id) => id !== String(actorId || ''));
  await Promise.all(ids.map((userId) => ensure({
    type,
    key,
    title,
    message,
    userId,
    data: { entityId: business._id },
  }).catch(() => {})));
}

// Sincroniza los alias solicitados por la inmobiliaria con los campos
// canónicos. El formulario puede enviar cualquiera de los dos nombres; la base
// guarda ambos para no romper listados, permisos ni datos históricos:
//   asesor_captador_id → mainAdvisor
//   asesor_cliente_id  → partnerAdvisor
//   cliente_id         → buyerClient
function syncBusinessAliases(body) {
  if (!body || typeof body !== 'object') return body;

  if (body.asesor_captador_id !== undefined) {
    body.mainAdvisor = body.asesor_captador_id || undefined;
  }
  if (body.asesor_cliente_id !== undefined) {
    body.partnerAdvisor = body.asesor_cliente_id || null;
  }
  if (body.cliente_id !== undefined) {
    body.buyerClient = body.cliente_id || null;
  }

  if (body.mainAdvisor !== undefined) body.asesor_captador_id = body.mainAdvisor || null;
  if (body.partnerAdvisor !== undefined) body.asesor_cliente_id = body.partnerAdvisor || null;
  if (body.buyerClient !== undefined) body.cliente_id = body.buyerClient || null;

  return body;
}

// `fecha_cierre` es la fecha estimada/proyectada de conclusión (firma de
// escrituras o contratos). Se mapea a `closing.closingDate` para no duplicar
// datos y conservar los reportes existentes.
function applyFechaCierre(body) {
  if (!body || body.fecha_cierre === undefined) return body;
  const value = body.fecha_cierre;
  body.closing = {
    ...(body.closing && typeof body.closing === 'object' ? body.closing : {}),
    closingDate: value ? new Date(value) : null,
  };
  delete body.fecha_cierre;
  return body;
}

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
    readBy: [req.user._id],
  });
  await note.populate('createdBy', 'name username');
  // Aviso en vivo a los participantes del negocio (sin el autor de la nota).
  emitToUsers(
    participantesDelNegocio(business).filter((id) => id !== String(req.user._id)),
    'business-note',
    { businessId: String(business._id), noteId: String(note._id), by: (note.createdBy && note.createdBy.name) || '', createdAt: note.createdAt }
  );
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

// ─────────────────────────────────────────────────────────────────────────────
// Ticket: reparto entre asesores internos y flujo financiero
// ─────────────────────────────────────────────────────────────────────────────
//  · 2 asesores internos        → 50% / 50%
//  · 1 asesor interno (sin externo) o interviene un externo → 100% al interno
//  · La comisión del negocio es el valor ticket (ya no se captura por separado).
//  · Cada asesor con parte del ticket tiene un registro Ticket:
//      activo     → "en negociación" (generatedAmount, sin cobrar)
//      concluido  → "cobrado" (collectedAmount)
//      cancelado  → sin monto
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function calcularReparto({
  mainAdvisor, partnerAdvisor, captadorExternalName, partnerAdvisorName,
}) {
  const captadorExterno = Boolean(String(captadorExternalName || '').trim()) || !mainAdvisor;
  const partnerExterno = Boolean(String(partnerAdvisorName || '').trim()) && !partnerAdvisor;
  const ids = [];
  if (!captadorExterno) ids.push(String(idOf(mainAdvisor)));
  if (partnerAdvisor) {
    const partnerId = String(idOf(partnerAdvisor));
    if (!ids.includes(partnerId)) ids.push(partnerId);
  }
  if (!ids.length) return [];
  const share = ids.length === 2 && !captadorExterno && !partnerExterno ? 50 : 100;
  return ids.map((user) => ({ user, share }));
}

// Aplica el reparto y la comisión (= valor ticket) sobre el bloque `closing`.
function aplicarRepartoTicket(target) {
  const valor = round2(target.ticketValue);
  const participants = calcularReparto(target);
  if (!target.closing || typeof target.closing !== 'object') target.closing = {};
  target.closing.participants = participants;
  target.closing.commission = valor;
  return target;
}

// Mantiene un registro Ticket por asesor participante, acorde al estado del negocio.
async function sincronizarTickets(business) {
  const valor = round2(business.ticketValue);
  const participants = (business.closing && business.closing.participants) || [];
  const cancelado = business.status === 'cancelado';
  const concluido = business.status === 'concluido';
  const status = cancelado ? 'cancelado' : (concluido ? 'cobrado' : 'generado');
  const userIds = [];

  for (const p of participants) {
    const userId = idOf(p.user);
    if (!userId) continue;
    userIds.push(String(userId));
    const monto = round2((valor * (Number(p.share) || 0)) / 100);
    const existente = await Ticket.findOne({ business: business._id, user: userId }).select('generatedAt').lean();
    await Ticket.updateOne(
      { business: business._id, user: userId },
      {
        $set: {
          value: monto,
          generatedAmount: cancelado ? 0 : monto,
          collectedAmount: concluido ? monto : 0,
          status,
          generatedAt: cancelado ? null : ((existente && existente.generatedAt) || new Date()),
          collectedAt: concluido ? (business.finishedAt || new Date()) : null,
        },
      },
      { upsert: true }
    );
  }

  await Ticket.deleteMany({ business: business._id, user: { $nin: userIds } });
  const primero = await Ticket.findOne({ business: business._id }).sort({ createdAt: 1 }).select('_id').lean();
  const ticketId = primero ? primero._id : null;
  await Business.updateOne({ _id: business._id }, { $set: { ticket: ticketId } });
  business.ticket = ticketId;

  await updateGoalsAuto().catch(() => {});
}

const create = asyncHandler(async (req, res) => {
  if (!canManageBusiness(req)) {
    return res.status(403).json({
      success: false,
      message: 'Solo Dirección, Administración, Gerencia o Asistencia pueden crear negocios.',
    });
  }

  const body = { ...req.body };
  applyFechaCierre(body);
  syncBusinessAliases(body);

  await processFlow.flow();
  if (body.currentStage) body.currentStage = normalizeStage(body.currentStage);
  if (body.currentStage && !processFlow.isUsable(body.currentStage)) {
    return res.status(400).json({ success: false, message: `La etapa "${req.body.currentStage}" no está disponible en el flujo de negocio.` });
  }

  // Nunca se asigna automáticamente al usuario que crea (p. ej. la cuenta de
  // Administración) como asesor del negocio: el captador debe elegirse de forma
  // explícita en el formulario. El esquema exige asesor principal.
  const captadorExterno = String(body.captadorExternalName || '').trim();
  if (!body.mainAdvisor && !captadorExterno) {
    return res.status(400).json({
      success: false,
      message: 'Selecciona el asesor captador (asesor_captador_id) del negocio.',
    });
  }
  if (captadorExterno) {
    body.captadorExternalName = captadorExterno;
    body.mainAdvisor = body.mainAdvisor || null;
  }
  if (body.partnerAdvisor && String(body.partnerAdvisor) === String(req.user._id)) {
    body.partnerAdvisor = null;
  }
  syncBusinessAliases(body);

  // El vendedor sale del propietario de la propiedad si no se eligió uno.
  await completarVendedorDesdePropiedad(body);

  // Reparto del ticket entre asesores internos y comisión = valor ticket.
  aplicarRepartoTicket(body);

  // Plantilla base de escrituración: cada negocio nuevo nace con sus pendientes.
  body.checklist = CHECKLIST_TEMPLATE.map((item) => ({ ...item }));
  body.checklistTemplateVersion = CHECKLIST_TEMPLATE_VERSION;

  const initialStage = normalizeStage(body.currentStage) || 'PROMESA';
  if (!body.currentStage) body.currentStage = initialStage;
  aplicarCicloDeVida(body, initialStage, { finished: false });

  const business = await Business.create(body);

  await registrarEtapa(business, business.currentStage, {
    user: req.user._id,
    status: business.status === 'activo' ? 'en_proceso' : 'completada',
  });

  // Vínculo con el cliente y estado de la propiedad (no bloquean la creación).
  await sincronizarClientes(business).catch(() => {});
  await sincronizarPropiedad(business).catch(() => {});
  await sincronizarTickets(business).catch(() => {});

  await logActivity({
    entityType: 'Business',
    entityId: business._id,
    user: req.user._id,
    action: 'creacion',
    message: `Se creó el negocio ${business.name}`,
  });

  await business.populate(['buyerClient', 'sellerClient', 'property', 'mainAdvisor', 'partnerAdvisor', 'asesor_captador_id', 'asesor_cliente_id', 'cliente_id']);

  // Aviso solo para los asesores involucrados (no para todo el equipo).
  avisarParticipantes(business, req.user._id, {
    type: 'nuevo_negocio',
    key: `business-${business._id}`,
    title: 'Nuevo negocio',
    message: `Se creó el negocio "${business.name}".`,
  }).catch(() => {});

  res.status(201).json({ success: true, data: business });
});

const update = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id);
  if (!business) return res.status(404).json({ success: false, message: 'Negocio no encontrado' });
  if (!assertOwnership(req, business)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este negocio.' });
  }
  const reasignaAsesores = canAssignAdvisors(req) && soloCampos(req.body, CAMPOS_ASIGNACION_NEGOCIO);
  if (!canManageBusiness(req) && !reasignaAsesores) {
    return res.status(403).json({
      success: false,
      message: 'Solo Dirección, Administración, Gerencia o Asistencia pueden editar los datos del negocio.',
    });
  }

  const previousStatus = business.status;
  const previousStage = normalizeStage(business.currentStage);
  const body = { ...req.body };
  applyFechaCierre(body);
  syncBusinessAliases(body);

  if (body.partnerAdvisor && String(body.partnerAdvisor) === String(req.user._id)) {
    body.partnerAdvisor = null;
  }
  syncBusinessAliases(body);

  if (body.currentStage !== undefined) {
    body.currentStage = normalizeStage(body.currentStage);
    if (body.currentStage !== previousStage) {
      await processFlow.flow();
      if (!processFlow.isUsable(body.currentStage)) {
        return res.status(400).json({ success: false, message: 'Esa etapa no está disponible en el flujo de negocio.' });
      }
      if (!processFlow.allowedNext(previousStage, body.currentStage) && !canOverrideFlow(req)) {
        const opciones = processFlow.nextLabels(previousStage).join(', ');
        return res.status(400).json({ success: false, message: `Según el flujo, desde esta etapa solo se puede pasar a: ${opciones}.` });
      }
    }
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

  const asesoresPrevios = participantesDelNegocio(business);
  Object.assign(business, body);

  // Reparto del ticket con los asesores ya actualizados (la comisión sigue al valor ticket).
  aplicarRepartoTicket(business);

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

  await business.save();

  if (normalizeStage(business.currentStage) !== previousStage) {
    await registrarEtapa(business, business.currentStage, {
      user: req.user._id,
      status: business.status === 'activo' ? 'en_proceso' : 'completada',
    }).catch(() => {});
  }

  await sincronizarClientes(business, clientesPrevios).catch(() => {});
  await sincronizarPropiedad(business, previousStatus).catch(() => {});
  await sincronizarTickets(business).catch(() => {});

  const asesoresNuevos = participantesDelNegocio(business).filter((id) => !asesoresPrevios.includes(id));
  if (asesoresNuevos.length) {
    avisarParticipantes(business, req.user._id, {
      type: 'negocio_asignado',
      key: `business-assign-${business._id}-${Date.now()}`,
      title: 'Negocio asignado',
      message: `Te asignaron al negocio "${business.name}".`,
    }, asesoresNuevos).catch(() => {});
  }

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

  await business.populate(['buyerClient', 'sellerClient', 'property', 'mainAdvisor', 'partnerAdvisor', 'asesor_captador_id', 'asesor_cliente_id', 'cliente_id', 'ticket']);

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
      message: 'Solo Dirección, Administración, Gerencia o Asistencia pueden eliminar negocios.',
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
  await Ticket.deleteMany({ business: business._id });
  await business.deleteOne();
  await updateGoalsAuto().catch(() => {});

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

  await processFlow.flow();
  if (!stage || !processFlow.isUsable(stage)) {
    return res.status(400).json({
      success: false,
      message: `La etapa "${req.body.stage}" no es válida.`,
    });
  }

  const previousStatus = business.status;
  const previousStage = normalizeStage(business.currentStage);
  if (previousStage !== stage && !processFlow.allowedNext(previousStage, stage) && !canOverrideFlow(req)) {
    const opciones = processFlow.nextLabels(previousStage).join(', ');
    return res.status(400).json({ success: false, message: `Según el flujo, desde esta etapa solo se puede pasar a: ${opciones}.` });
  }
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
  await sincronizarTickets(business).catch(() => {});

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

  avisarParticipantes(business, req.user._id, {
    type: 'cambio_etapa',
    key: `stage-${business._id}-${stage}`,
    title: 'Cambio de etapa',
    message: `El negocio "${business.name}" cambió a ${stageLabel(stage)}.`,
  }).catch(() => {});

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
  const business = await Business.findById(req.params.id).select('mainAdvisor partnerAdvisor asesor_captador_id asesor_cliente_id name');
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

const updateNote = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id).select('mainAdvisor partnerAdvisor asesor_captador_id asesor_cliente_id name');
  if (!business) return res.status(404).json({ success: false, message: 'Negocio no encontrado' });
  if (!assertOwnership(req, business)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este negocio.' });
  }
  const note = await BusinessNote.findOne({ _id: req.params.noteId, business: business._id });
  if (!note) return res.status(404).json({ success: false, message: 'Nota no encontrada' });
  const isAuthor = String(note.createdBy) === String(req.user._id);
  if (!isAuthor && !canManageChecklist(req)) {
    return res.status(403).json({ success: false, message: 'No puedes editar esta nota.' });
  }
  const text = String(req.body.text || req.body.note || req.body.nota || '').trim();
  if (!text) {
    return res.status(400).json({ success: false, message: 'La nota es obligatoria' });
  }
  note.text = text;
  await note.save();
  await note.populate('createdBy', 'name username');
  emitToUsers(
    participantesDelNegocio(business).filter((id) => id !== String(req.user._id)),
    'business-note-changed',
    { businessId: String(business._id), noteId: String(note._id), action: 'updated' }
  );
  await logActivity({
    entityType: 'Business',
    entityId: business._id,
    user: req.user._id,
    action: 'nota',
    message: `Se editó una nota del negocio ${business.name}`,
  });
  res.json({ success: true, data: note });
});

const removeNote = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id).select('mainAdvisor partnerAdvisor asesor_captador_id asesor_cliente_id name');
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
  emitToUsers(
    participantesDelNegocio(business).filter((id) => id !== String(req.user._id)),
    'business-note-changed',
    { businessId: String(business._id), noteId: String(note._id), action: 'deleted' }
  );
  await logActivity({
    entityType: 'Business',
    entityId: business._id,
    user: req.user._id,
    action: 'nota',
    message: `Se eliminó una nota del negocio ${business.name}`,
  });
  res.json({ success: true, message: 'Nota eliminada' });
});

// ─────────────────────────────────────────────────────────────────────────────
// Checklist del negocio
// ─────────────────────────────────────────────────────────────────────────────

// Negocios creados antes de la plantilla reciben los pendientes que les falten
// la primera vez que se consulta su checklist. Nunca se repite un pendiente que
// ya exista con el mismo texto, y los eliminados a mano no se vuelven a crear
// (la versión queda registrada en el negocio).
async function asegurarPlantillaChecklist(business) {
  const version = business.checklistTemplateVersion || 0;
  if (version >= CHECKLIST_TEMPLATE_VERSION) return business;
  // Foto de los pendientes que ya existían: los agregados en este mismo ciclo
  // no deben volver a emparejarse con entradas de la plantilla.
  const previos = [...(business.checklist || [])];
  const emparejados = new Set();
  CHECKLIST_TEMPLATE.forEach((plantilla) => {
    // Cada entrada de la plantilla casa con UN pendiente distinto (la plantilla
    // repite textos como "Comprobante de Domicilio" en dos secciones).
    const existente = previos.find((item) => item.text === plantilla.text && !emparejados.has(item));
    if (existente) {
      emparejados.add(existente);
      // Se actualizan sección y subtítulo (incluye renombres de versiones anteriores).
      existente.section = plantilla.section;
      existente.group = plantilla.group;
    } else if (version === 0) {
      // Negocio sin plantilla: se aplica completa. Los que luego se eliminen a
      // mano no se reponen, porque la versión ya queda registrada.
      business.checklist.push({ ...plantilla });
    }
  });
  business.checklistTemplateVersion = CHECKLIST_TEMPLATE_VERSION;
  await business.save();
  return business;
}

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
  await asegurarPlantillaChecklist(business).catch(() => {});
  return business;
}

// Lectura del checklist: disponible para cualquier usuario con acceso al
// negocio, incluido el asesor (solo lectura). Las mutaciones siguen reservadas
// a dirección/gerencia/asistencia/escrituración.
const getChecklist = asyncHandler(async (req, res) => {
  const business = await findBusinessForChecklist(req, res);
  if (!business) return undefined;
  res.json({ success: true, data: business.checklist || [] });
});

const addChecklistItem = asyncHandler(async (req, res) => {
  const business = await findBusinessForChecklist(req, res);
  if (!business) return undefined;
  if (!canManageChecklist(req)) {
    return res.status(403).json({
      success: false,
      message: 'Solo dirección, gerencia, asistencia o escrituración pueden editar el checklist.',
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
      message: 'Solo dirección, gerencia, asistencia o escrituración pueden editar el checklist.',
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
      message: 'Solo dirección, gerencia, asistencia o escrituración pueden editar el checklist.',
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

// Cuántas notas de la bitácora no ha visto el usuario, por negocio (las propias
// no cuentan). Solo considera negocios a los que el usuario tiene acceso.
const unseenNotes = asyncHandler(async (req, res) => {
  const uid = String(req.user._id);
  const notes = await BusinessNote.find({
    readBy: { $ne: req.user._id },
    createdBy: { $ne: req.user._id },
  }).select('business').lean();

  let allowed = null;
  if (!isBusinessStaff(req)) {
    const own = await Business.find({
      $or: [
        { mainAdvisor: uid },
        { partnerAdvisor: uid },
        { asesor_captador_id: uid },
        { asesor_cliente_id: uid },
      ],
    }).select('_id').lean();
    allowed = new Set(own.map((b) => String(b._id)));
  }

  const data = {};
  notes.forEach((note) => {
    const id = String(note.business);
    if (allowed && !allowed.has(id)) return;
    data[id] = (data[id] || 0) + 1;
  });
  res.json({ success: true, data });
});

// Marca como vistas todas las notas de la bitácora del negocio para el usuario.
const markNotesSeen = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id).select('mainAdvisor partnerAdvisor asesor_captador_id asesor_cliente_id');
  if (!business) return res.status(404).json({ success: false, message: 'Negocio no encontrado' });
  if (!assertOwnership(req, business)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este negocio.' });
  }
  await BusinessNote.updateMany(
    { business: business._id, readBy: { $ne: req.user._id } },
    { $addToSet: { readBy: req.user._id } }
  );
  res.json({ success: true });
});

module.exports = {
  list,
  get,
  options,
  unseenNotes,
  markNotesSeen,
  create,
  update,
  remove,
  changeStage,
  history,
  listNotes,
  addNote,
  updateNote,
  removeNote,
  getChecklist,
  addChecklistItem,
  updateChecklistItem,
  removeChecklistItem,
  listDocuments,
  uploadDocument,
  removeDocument,
  propertyBusinesses,
  stages,
  getFlow,
  saveFlow,
  stagesFor,
  STAGE_ORDER,
  STAGE_LABELS,
  STAGES_BY_PROCESS,
};
