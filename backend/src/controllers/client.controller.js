'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const buildCrud = require('../utils/crud');
const { isBoss } = require('../utils/scope');
const { Client, Business, BusinessStage } = require('../models');
const { STAGE_ORDER, STAGE_LABELS } = require('./business.controller');
const { logActivity } = require('../services/log.service');

const ETAPAS = ['PROSPECTO', 'PERFILADO', 'SEGUIMIENTO', 'CITA', 'NEGOCIACION_CIERRE', 'POSTVENTA', 'DESCARTADO'];

const STAGE_TO_FUNNEL = {
  PROSPECTO: 'prospecto',
  PERFILADO: 'perfilado',
  SEGUIMIENTO: 'contacto',
  CITA: 'cita',
  NEGOCIACION_CIERRE: 'negociacion',
  POSTVENTA: 'postventa',
  DESCARTADO: 'descartado',
};

const clientCrud = buildCrud(Client, {
  populate: ['asesorAsignado'],
  searchFields: ['nombre', 'telefono', 'email'],
  ownerField: 'asesorAsignado',
  extraFilters: { etapaActual: 'etapaActual' },
});

const list = clientCrud.list;
const get = clientCrud.get;

function assertOwnership(req, client) {
  if (isBoss(req)) return true;
  const ownerId = String((client.asesorAsignado && client.asesorAsignado._id) || client.asesorAsignado || '');
  return ownerId === String(req.user._id);
}

// Crea un negocio automáticamente cuando el cliente llega a etapa de cierre.
// Nunca lanza: si falla, el cliente sigue y el error queda en el log.
async function createAutoBusiness(client, user, nota) {
  try {
    const negocio = await Business.create({
      name: `${client.servicio || 'Operacion'} - ${client.nombre}`,
      buyerClient: client._id,
      mainAdvisor: user._id,
      processType: 'comprador',
      valueOperation: Number(client.capacidad) || 0,
      currentStage: 'negociacion',
      negotiation: {
        notes: `Generado automaticamente desde etapa de Cierre del Cliente: ${nota}`,
      },
      status: 'activo',
    });

    await BusinessStage.create({
      business: negocio._id,
      stageCode: 'negociacion',
      name: STAGE_LABELS.negociacion,
      order: STAGE_ORDER.indexOf('negociacion'),
      startedAt: new Date(),
      status: 'en_proceso',
      responsibleUser: user._id,
    });

    await logActivity({
      entityType: 'Business',
      entityId: negocio._id,
      user: user._id,
      action: 'creacion',
      message: `Se generó automáticamente el negocio ${negocio.name} desde el cierre del cliente ${client.nombre}`,
    });

    return negocio;
  } catch (error) {
    console.error('[client.controller] No se pudo generar el negocio automático:', error.message);
    return null;
  }
}

const create = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  // Un asesor siempre es el dueño de sus clientes; el jefe puede asignar a cualquiera.
  if (!isBoss(req) || !body.asesorAsignado) body.asesorAsignado = req.user._id;

  if (!body.etapaActual) body.etapaActual = 'PROSPECTO';
  body.funnelStage = STAGE_TO_FUNNEL[body.etapaActual] || 'prospecto';
  body.fechaRegistro = body.fechaRegistro || new Date();
  body.ultVez = new Date();
  body.historialEtapas = [
    {
      etapaAnterior: null,
      etapaNueva: body.etapaActual,
      nota: body.etapaActual === 'PROSPECTO'
        ? 'Cliente registrado como Prospecto inicial'
        : `Cliente registrado directamente en etapa ${body.etapaActual}`,
      usuario: req.user._id,
      fecha: new Date(),
    },
  ];

  const client = await Client.create(body);

  await logActivity({
    entityType: 'Client',
    entityId: client._id,
    user: req.user._id,
    action: 'creacion',
    message: `Se registró el cliente ${client.nombre}`,
  });

  await client.populate('asesorAsignado');

  res.status(201).json({ success: true, data: client });
});

const update = asyncHandler(async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
  if (!assertOwnership(req, client)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este cliente.' });
  }

  const body = { ...req.body };
  // Un asesor no puede reasignar el cliente; solo el jefe.
  if (!isBoss(req)) body.asesorAsignado = client.asesorAsignado || req.user._id;

  const previousEtapa = client.etapaActual;
  Object.assign(client, body);

  // Cambio de etapa desde la edición: sincroniza embudo y bitácora sin exigir nota.
  if (body.etapaActual && String(body.etapaActual) !== String(previousEtapa || '')) {
    client.funnelStage = STAGE_TO_FUNNEL[body.etapaActual] || client.funnelStage;
    client.ultVez = new Date();
    client.historialEtapas.push({
      etapaAnterior: previousEtapa || null,
      etapaNueva: body.etapaActual,
      nota: 'Etapa actualizada desde edicion',
      usuario: req.user._id,
      fecha: new Date(),
    });
  }

  await client.save();
  await client.populate('asesorAsignado');

  await logActivity({
    entityType: 'Client',
    entityId: client._id,
    user: req.user._id,
    action: 'actualizacion',
    message: `Se actualizó el cliente ${client.nombre}`,
  });

  res.json({ success: true, data: client });
});

const cambiarEtapa = asyncHandler(async (req, res) => {
  const { etapa, nota } = req.body || {};
  const cleanNota = String(nota || '').trim();
  if (!cleanNota) {
    return res.status(400).json({ success: false, message: 'La nota es obligatoria para mover de etapa.' });
  }
  if (!ETAPAS.includes(etapa)) {
    return res.status(400).json({ success: false, message: 'Etapa no válida.' });
  }

  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
  if (!assertOwnership(req, client)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este cliente.' });
  }

  const previousEtapa = client.etapaActual || 'PROSPECTO';
  if (String(previousEtapa) === String(etapa)) {
    return res.status(400).json({ success: false, message: 'El cliente ya esta en esa etapa.' });
  }

  client.etapaActual = etapa;
  client.funnelStage = STAGE_TO_FUNNEL[etapa] || client.funnelStage;
  client.ultVez = new Date();
  client.historialEtapas.push({
    etapaAnterior: previousEtapa,
    etapaNueva: etapa,
    nota: cleanNota,
    usuario: req.user._id,
    fecha: new Date(),
  });

  // Etapa de cierre sin negocio vinculado → se genera automáticamente.
  let nuevaNegocio = null;
  if (etapa === 'NEGOCIACION_CIERRE' && !client.negocioId) {
    nuevaNegocio = await createAutoBusiness(client, req.user, cleanNota);
    if (nuevaNegocio) client.negocioId = nuevaNegocio._id;
  }

  await client.save();
  await client.populate('asesorAsignado');

  await logActivity({
    entityType: 'Client',
    entityId: client._id,
    user: req.user._id,
    action: 'cambio_etapa',
    message: `El cliente pasó de "${previousEtapa}" a "${etapa}"`,
  });

  res.json({
    success: true,
    data: client,
    newNegocioId: nuevaNegocio ? nuevaNegocio._id : (client.negocioId || null),
  });
});

const registrarLlamada = asyncHandler(async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
  if (!assertOwnership(req, client)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este cliente.' });
  }

  client.totalLlamadas = (client.totalLlamadas || 0) + 1;
  client.ultVez = new Date();
  await client.save();
  await client.populate('asesorAsignado');

  await logActivity({
    entityType: 'Client',
    entityId: client._id,
    user: req.user._id,
    action: 'llamada',
    message: `Llamada registrada al cliente ${client.nombre} (#${client.totalLlamadas})`,
  });

  res.json({ success: true, data: client });
});

const historial = asyncHandler(async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
  if (!assertOwnership(req, client)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este cliente.' });
  }

  await client.populate('historialEtapas.usuario', 'name');

  const items = (client.historialEtapas || [])
    .slice()
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  res.json({ success: true, data: items });
});

const remove = asyncHandler(async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
  if (!assertOwnership(req, client)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este cliente.' });
  }

  await client.deleteOne();

  await logActivity({
    entityType: 'Client',
    entityId: client._id,
    user: req.user._id,
    action: 'eliminacion',
    message: `Se eliminó el cliente ${client.nombre}`,
  });

  res.json({ success: true, message: 'Cliente eliminado' });
});

module.exports = { list, get, create, update, remove, cambiarEtapa, registrarLlamada, historial };