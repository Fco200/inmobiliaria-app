'use strict';

const mongoose = require('mongoose');

// Registro de contactos con el cliente hechos desde el CRM:
// llamadas telefónicas y mensajes de WhatsApp (con notas del asesor).
const interactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'El usuario es obligatorio'],
    },
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: [true, 'El cliente es obligatorio'],
      index: true,
    },
    channel: {
      type: String,
      enum: ['llamada', 'whatsapp', 'nota'],
      default: 'llamada',
    },
    notes: { type: String, trim: true, default: '' },
    outcome: {
      type: String,
      enum: ['contestó', 'no contestó', 'buzón', 'número inválido', 'agendó cita', 'sin respuesta'],
      default: null,
    },
  },
  { timestamps: true, toJSON: { virtuals: false } }
);

interactionSchema.index({ user: 1, createdAt: -1 });
interactionSchema.index({ client: 1, createdAt: -1 });

module.exports = mongoose.model('Interaction', interactionSchema);
