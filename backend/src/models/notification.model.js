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
        'tarea_proxima',
        'cita_proxima',
        'cita_vencida',
        'cita_recordatorio_24h',
        'cita_recordatorio_1h',
        'propiedad_sin_publicar',
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
        'olvido_contraseña',
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

// Notificación push nativa (Web Push en Android/iOS/escritorio): se dispara al
// crear CUALQUIER aviso, sin importar si nació en un controlador, en el job de
// recordatorios o en el servicio de avisos. El require es perezoso para
// evitar un ciclo de imports (push.service -> models -> notification.model).
// Un fallo de push jamás debe romper la creación del aviso.
notificationSchema.post('save', function pushAfterCreate(doc) {
  try {
    // eslint-disable-next-line global-require
    const push = require('../services/push.service');
    push
      .notifyUser(doc.user, {
        title: doc.title,
        body: doc.message,
        tag: String(doc._id),
        type: doc.type,
        url: 'notifications.html',
      })
      .catch(() => {});
  } catch (error) {
    /* sin push configurado o servicio no disponible: se ignora */
  }
});

module.exports = mongoose.model('Notification', notificationSchema);
