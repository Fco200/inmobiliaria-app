'use strict';

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'El usuario es obligatorio'],
    },
    type: {
      type: String,
      enum: [
        'nueva_tarea',
        'tarea_vencida',
        'cita_proxima',
        'cita_recordatorio_24h',
        'cita_recordatorio_1h',
        'documento_pendiente',
        'documento_rechazado',
        'avaluo_pendiente',
        'firma_pendiente',
        'pago_pendiente',
        'meta_proxima_vencer',
        'nuevo_negocio',
        'cambio_etapa',
        'negocio_cancelado',
        'negocio_sin_actualizacion',
        'nuevo_prospecto',
        'propiedad_apartada',
        'nueva_propiedad',
        'nuevo_mensaje_chat',
        'sistema',
      ],
      default: 'sistema',
    },
    title: { type: String, required: [true, 'El título es obligatorio'], trim: true },
    message: { type: String, trim: true, default: '' },
    data: { type: mongoose.Schema.Types.Mixed, default: null },
    read: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
