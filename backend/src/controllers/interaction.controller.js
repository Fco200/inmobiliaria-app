'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const { Interaction, Client } = require('../models');
const { isBoss } = require('../utils/scope');

// Lista de interacciones (llamadas/WhatsApp/notas).
//  - admin/gerencia → todas (filtro opcional ?user=)
//  - asesor         → solo las propias (filtro ?client= disponible para todos)
const list = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
  const filter = {};

  if (!isBoss(req)) {
    filter.user = req.user._id;
  } else if (req.query.user) {
    filter.user = req.query.user;
  }
  if (req.query.client) filter.client = req.query.client;
  if (req.query.channel) filter.channel = req.query.channel;

  const [total, items] = await Promise.all([
    Interaction.countDocuments(filter),
    Interaction.find(filter)
      .populate('user', 'name photo')
      .populate('client', 'name')
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 }),
  ]);

  res.json({
    success: true,
    data: items,
    meta: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

const create = asyncHandler(async (req, res) => {
  const { client, channel, notes, outcome } = req.body;

  if (!client) {
    return res.status(400).json({ success: false, message: 'Se requiere el cliente' });
  }

  // Un asesor solo registra interacciones de sus propios clientes.
  const clientDoc = await Client.findById(client);
  if (!clientDoc) {
    return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
  }
  if (!isBoss(req)) {
    const ownerId = String((clientDoc.responsibleUser && clientDoc.responsibleUser._id) || clientDoc.responsibleUser || '');
    if (ownerId !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'No tienes acceso a este cliente.' });
    }
  }

  const interaction = await Interaction.create({
    user: req.user._id,
    client,
    channel: ['llamada', 'whatsapp', 'nota'].includes(channel) ? channel : 'llamada',
    notes: notes || '',
    outcome: outcome || null,
  });

  await interaction.populate('user', 'name photo');
  await interaction.populate('client', 'name');

  res.status(201).json({ success: true, data: interaction });
});

const remove = asyncHandler(async (req, res) => {
  const interaction = await Interaction.findById(req.params.id);
  if (!interaction) {
    return res.status(404).json({ success: false, message: 'Interacción no encontrada' });
  }
  if (!isBoss(req) && String(interaction.user) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este registro.' });
  }
  await interaction.deleteOne();
  res.json({ success: true, message: 'Interacción eliminada' });
});

module.exports = { list, create, remove };
