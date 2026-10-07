'use strict';

const mongoose = require('mongoose');

const { APPOINTMENT_TYPES } = require('../constants/appointment-types');

const appointmentSchema = new mongoose.Schema(
  {
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      default: null,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'El usuario es obligatorio'],
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      default: null,
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      default: null,
    },
    date: { type: Date, required: [true, 'La fecha es obligatoria'] },
    place: { type: String, trim: true, default: '' },
    type: {
      type: String,
      enum: APPOINTMENT_TYPES,
      default: 'visita_propiedad',
    },
    // Texto libre cuando el tipo es 'otro': "Otro (especificar)".
    typeOther: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    reminder: { type: Date, default: null },
    status: {
      type: String,
      enum: ['pendiente', 'confirmada', 'realizada', 'cancelada', 'no_asistio'],
      default: 'pendiente',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

appointmentSchema.index({ user: 1, date: 1 });
appointmentSchema.index({ client: 1 });
appointmentSchema.index({ business: 1, property: 1 });
appointmentSchema.index({ status: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema);
