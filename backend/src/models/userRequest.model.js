'use strict';

const mongoose = require('mongoose');
const { PUBLIC_ROLE_CODES } = require('../constants/roles');

const userRequestSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'El nombre es obligatorio'],
      trim: true,
    },
    phone: { type: String, trim: true, default: '' },
    email: {
      type: String,
      required: [true, 'El correo es obligatorio'],
      trim: true,
      lowercase: true,
      match: [/^[\w.+-]+@[\w-]+\.[\w.-]+$/, 'Correo inválido'],
    },
    role: {
      type: String,
      // Los seis roles oficiales. Se guarda el código interno (`admin` para
      // Administración) y se muestra la etiqueta oficial en la interfaz.
      enum: [...PUBLIC_ROLE_CODES],
      default: 'asesor',
    },
    message: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['pendiente', 'aprobada', 'rechazada'],
      default: 'pendiente',
    },
    // Cómo fue atendida (lo escribe administrador/soporte).
    comment: { type: String, trim: true, default: '' },
    handledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    handledAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

userRequestSchema.index({ status: 1 });
userRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model('UserRequest', userRequestSchema);
