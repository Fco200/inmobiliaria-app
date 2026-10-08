'use strict';

const mongoose = require('mongoose');

/**
 * Suscripción Web Push de un navegador/dispositivo.
 *
 * Se genera en el navegador con pushManager.subscribe() y se guarda en este
 * documento para que el backend pueda enviarle notificaciones con web-push
 * cuando ocurran eventos internos (avisos, citas, tareas, chats...).
 *
 * `endpoint` es la URL única del servicio de push (FCM de Google, Apple,
 * Mozilla...) y `keys` contiene las llaves criptográficas del navegador:
 *   - p256dh: llave pública P-256 del navegador (para cifrar el mensaje)
 *   - auth:   secreto de autenticación de 16 bytes
 */
const pushSubscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'El usuario es obligatorio'],
    },
    endpoint: {
      type: String,
      required: [true, 'El endpoint es obligatorio'],
      trim: true,
    },
    keys: {
      p256dh: { type: String, required: [true, 'La llave p256dh es obligatoria'], trim: true },
      auth: { type: String, required: [true, 'La llave auth es obligatoria'], trim: true },
    },
    userAgent: { type: String, default: '' },
    lastUsedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

// Un mismo dispositivo puede re-suscribirse: se actualiza en lugar de duplicar.
pushSubscriptionSchema.index({ user: 1, endpoint: 1 }, { unique: true });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
