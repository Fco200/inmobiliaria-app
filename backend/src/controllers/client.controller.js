'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const buildCrud = require('../utils/crud');
const { isBoss } = require('../utils/scope');
const { Client } = require('../models');
const { logActivity } = require('../services/log.service');

const clientCrud = buildCrud(Client, {
  populate: ['responsibleUser'],
  searchFields: ['name', 'phone', 'email'],
  ownerField: 'responsibleUser',
});

const list = clientCrud.list;
const get = clientCrud.get;

function assertOwnership(req, client) {
  if (isBoss(req)) return true;
  const ownerId = String((client.responsibleUser && client.responsibleUser._id) || client.responsibleUser || '');
  return ownerId === String(req.user._id);
}

const create = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  // Un asesor siempre es el responsable de sus clientes; el jefe puede asignar a cualquiera.
  if (!isBoss(req) || !body.responsibleUser) body.responsibleUser = req.user._id;
  const client = await Client.create(body);

  await logActivity({
    entityType: 'Client',
    entityId: client._id,
    user: req.user._id,
    action: 'creacion',
    message: `Se registró el cliente ${client.name}`,
  });

  res.status(201).json({ success: true, data: client });
});

const update = asyncHandler(async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
  if (!assertOwnership(req, client)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este cliente.' });
  }

  const previousStage = client.funnelStage;
  Object.assign(client, req.body);
  await client.save();

  if (req.body.funnelStage && req.body.funnelStage !== previousStage) {
    await logActivity({
      entityType: 'Client',
      entityId: client._id,
      user: req.user._id,
      action: 'cambio_embudo',
      message: `El prospecto pasó de "${previousStage}" a "${req.body.funnelStage}" en el embudo`,
    });
  }

  await logActivity({
    entityType: 'Client',
    entityId: client._id,
    user: req.user._id,
    action: 'actualizacion',
    message: `Se actualizó el cliente ${client.name}`,
  });

  res.json({ success: true, data: client });
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
    message: `Se eliminó el cliente ${client.name}`,
  });

  res.json({ success: true, message: 'Cliente eliminado' });
});

module.exports = { list, get, create, update, remove };
