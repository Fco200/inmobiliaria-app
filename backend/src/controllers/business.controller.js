'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const buildCrud = require('../utils/crud');
const { isBoss } = require('../utils/scope');
const { Business, BusinessStage } = require('../models');
const { logActivity, logAudit } = require('../services/log.service');

// Proceso de ventas para un comprador: captación del prospecto hasta la entrega del inmueble.
const BUYER_STAGES = [
  'nuevo',
  'prospecto',
  'contactado',
  'perfilado',
  'cita',
  'contrato',
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
const SELLER_STAGES = [
  'nuevo',
  'prospecto',
  'contactado',
  'revision',
  'cita',
  'captacion',
  'integracion_expedientes',
  'promesa',
  'avaluo',
  'concluido',
];

const STAGE_ORDER = Array.from(new Set([...BUYER_STAGES, ...SELLER_STAGES, 'negociacion', 'cancelado']));

const STAGE_LABELS = {
  nuevo: 'Nuevo',
  prospecto: 'Prospecto',
  contactado: 'Contactado',
  perfilado: 'Perfilado',
  cita: 'Cita',
  contrato: 'Contrato',
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
  cancelado: 'Cancelado',
};

const STAGES_BY_PROCESS = {
  comprador: BUYER_STAGES,
  vendedor: SELLER_STAGES,
};

function stagesFor(processType) {
  return STAGES_BY_PROCESS[processType] || BUYER_STAGES;
}

const businessCrud = buildCrud(Business, {
  populate: ['buyerClient', 'sellerClient', 'property', 'mainAdvisor', 'partnerAdvisor', 'ticket'],
  searchFields: ['name'],
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

const create = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  if (!isBoss(req)) {
    body.mainAdvisor = req.user._id; // un asesor solo crea negocios propios
    if (body.partnerAdvisor && String(body.partnerAdvisor) === String(req.user._id)) {
      body.partnerAdvisor = undefined;
    }
  }
  const business = await Business.create(body);

  await BusinessStage.create({
    business: business._id,
    stageCode: business.currentStage,
    name: STAGE_LABELS[business.currentStage],
    order: STAGE_ORDER.indexOf(business.currentStage),
    startedAt: new Date(),
    status: 'en_proceso',
  });

  await logActivity({
    entityType: 'Business',
    entityId: business._id,
    user: req.user._id,
    action: 'creacion',
    message: `Se creó el negocio ${business.name}`,
  });

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

  Object.assign(business, req.body);
  await business.save();

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

  res.json({ success: true, data: business });
});

const remove = businessCrud.remove;

const changeStage = asyncHandler(async (req, res) => {
  const { stage } = req.body;
  const business = await Business.findById(req.params.id);
  if (!business) return res.status(404).json({ success: false, message: 'Negocio no encontrado' });
  if (!assertOwnership(req, business)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este negocio.' });
  }

  const allowed = [...stagesFor(business.processType), 'cancelado'];
  if (!allowed.includes(stage)) {
    return res.status(400).json({
      success: false,
      message: `La etapa "${stage}" no pertenece al proceso de ${business.processType === 'vendedor' ? 'vendedor' : 'comprador'}.`,
    });
  }

  const previousStage = business.currentStage;
  if (previousStage === stage) {
    return res.status(400).json({ success: false, message: 'El negocio ya está en esa etapa' });
  }

  const previousStageRecord = await BusinessStage.findOne({
    business: business._id,
    stageCode: previousStage,
    status: 'en_proceso',
  });
  if (previousStageRecord) {
    previousStageRecord.finishedAt = new Date();
    previousStageRecord.status = 'completada';
    await previousStageRecord.save();
  }

  business.currentStage = stage;
  if (stage === 'concluido') {
    business.status = 'concluido';
    business.finishedAt = new Date();
  } else if (stage === 'cancelado') {
    business.status = 'cancelado';
    business.finishedAt = new Date();
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

module.exports = { list, get, create, update, remove, changeStage, history, stagesFor, STAGE_LABELS, STAGES_BY_PROCESS };
