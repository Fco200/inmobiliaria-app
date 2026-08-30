'use strict';

const mongoose = require('mongoose');

const businessStageSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'El negocio es obligatorio'],
    },
    stageCode: {
      type: String,
      enum: [
        'nuevo',
        'prospecto',
        'contactado',
        'perfilado',
        'cita',
        'captacion',
        'integracion_expedientes',
        'negociacion',
        'contrato',
        'promesa',
        'integracion',
        'avaluo',
        'revision',
        'notarias',
        'firma',
        'pago',
        'entrega',
        'postventa',
        'concluido',
        'cancelado',
      ],
      required: [true, 'La etapa es obligatoria'],
    },
    name: { type: String, trim: true, default: '' },
    order: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    responsibleUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status: {
      type: String,
      enum: ['pendiente', 'en_proceso', 'completada', 'saltada'],
      default: 'pendiente',
    },
    comments: { type: String, trim: true, default: '' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

businessStageSchema.index({ business: 1, stageCode: 1 });
businessStageSchema.index({ business: 1, order: 1 });

module.exports = mongoose.model('BusinessStage', businessStageSchema);
