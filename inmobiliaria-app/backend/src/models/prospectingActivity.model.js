'use strict';

const mongoose = require('mongoose');

const prospectingActivitySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'El usuario es obligatorio'],
    },
    type: {
      type: String,
      enum: ['lonas', 'tarjetas', 'volantes', 'cambaceo', 'publicidad', 'gasolina', 'imagen', 'otros'],
      required: [true, 'El tipo de actividad es obligatorio'],
    },
    date: { type: Date, required: [true, 'La fecha es obligatoria'] },
    quantity: { type: Number, min: 0, default: 0 },
    location: { type: String, trim: true, default: '' },
    timeSpent: { type: Number, min: 0, default: 0 },
    contacts: { type: Number, min: 0, default: 0 },
    prospectsObtained: { type: Number, min: 0, default: 0 },
    investment: { type: Number, min: 0, default: 0 },
    observations: { type: String, trim: true, default: '' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

prospectingActivitySchema.index({ user: 1, date: -1 });
prospectingActivitySchema.index({ type: 1 });

module.exports = mongoose.model('ProspectingActivity', prospectingActivitySchema);
