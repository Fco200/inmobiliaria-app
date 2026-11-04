'use strict';

const mongoose = require('mongoose');

// Campaña de correo del boletín. Se procesa en segundo plano: el servidor
// responde al instante y el progreso (enviados/fallidos) se guarda aquí.
const campaignSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true, maxlength: 160 },
    intro: { type: String, trim: true, default: '', maxlength: 300 },
    message: { type: String, required: true, maxlength: 12000 },
    audience: {
      type: String,
      enum: ['suscriptores', 'usuarios', 'clientes', 'todos'],
      required: true,
    },
    role: { type: String, default: '' },
    status: {
      type: String,
      enum: ['en_cola', 'en_proceso', 'completada', 'fallida', 'interrumpida'],
      default: 'en_cola',
      index: true,
    },
    total: { type: Number, default: 0 },
    enviados: { type: Number, default: 0 },
    fallidos: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Concesión del trabajador que la procesa. Si el proceso muere, la
    // concesión expira y otro proceso retoma la campaña.
    lockedBy: { type: String, default: null },
    leaseUntil: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

campaignSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Campaign', campaignSchema);
