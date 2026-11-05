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
    // Cuenta del CRM que se suscribió desde Bienvenida o Mi perfil (null si fue el sitio público).
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    source: { type: String, trim: true, default: 'landing' },
    // Cómo fue atendida la promoción (lo escribe administrador/soporte).
    status: {
      type: String,
      enum: ['suscrito', 'dado_baja'],
      default: 'suscrito',
    },
    // Correo de bienvenida. Se envía en segundo plano y se reintenta si el
    // proveedor falla o todavía no está configurado, para que una suscripción
    // no pierda su correo de confirmación por un fallo temporal.
    welcomeStatus: {
      type: String,
      enum: ['pendiente', 'enviado', 'fallido'],
      default: 'pendiente',
    },
    welcomeAttempts: { type: Number, default: 0 },
    welcomeLastAttemptAt: { type: Date, default: null },
    welcomeSentAt: { type: Date, default: null },
    welcomeLastError: { type: String, trim: true, default: '' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

newsletterSchema.index({ createdAt: -1 });
newsletterSchema.index({ welcomeStatus: 1, welcomeLastAttemptAt: 1 });

module.exports = mongoose.model('Newsletter', newsletterSchema);