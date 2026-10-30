'use strict';

const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'El negocio es obligatorio'],
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'El usuario es obligatorio'],
    },
    value: { type: Number, min: 0, default: 0 },
    generatedAmount: { type: Number, min: 0, default: 0 },
    collectedAmount: { type: Number, min: 0, default: 0 },
    generatedAt: { type: Date, default: null },
    collectedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['pendiente', 'generado', 'parcial', 'cobrado', 'cancelado'],
      default: 'pendiente',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

ticketSchema.index({ business: 1 });
ticketSchema.index({ user: 1, status: 1 });
ticketSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Ticket', ticketSchema);
