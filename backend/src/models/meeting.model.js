'use strict';

const mongoose = require('mongoose');

// Reunión publicada por administración/gerencia que se muestra en el
// calendario de TODOS los asesores (evento de equipo, no por usuario).
const meetingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'El título de la reunión es obligatorio'],
      trim: true,
    },
    description: { type: String, trim: true, default: '' },
    location: { type: String, trim: true, default: '' },
    start: { type: Date, required: [true, 'La fecha de inicio es obligatoria'] },
    end: { type: Date, required: [true, 'La fecha de fin es obligatoria'] },
    status: {
      type: String,
      enum: ['programada', 'realizada', 'cancelada'],
      default: 'programada',
    },
    // Quién publicó la reunión (admin/gerencia). Se conserva solo informativo.
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

meetingSchema.index({ start: 1 });
meetingSchema.index({ status: 1 });

module.exports = mongoose.model('Meeting', meetingSchema);
