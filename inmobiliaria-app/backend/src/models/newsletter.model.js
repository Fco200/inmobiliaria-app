'use strict';

const mongoose = require('mongoose');

const newsletterSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'El correo es obligatorio'],
      trim: true,
      lowercase: true,
      index: true,
      match: [/^[\w.+-]+@[\w-]+\.[\w.-]+$/, 'Correo inválido'],
    },
    name: { type: String, trim: true, default: '' },
    source: { type: String, trim: true, default: 'landing' },
    // Cómo fue atendida la promoción (lo escribe administrador/soporte).
    status: {
      type: String,
      enum: ['suscrito', 'dado_baja'],
      default: 'suscrito',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

newsletterSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Newsletter', newsletterSchema);