'use strict';

const mongoose = require('mongoose');

// Destinatario de una campaña. Guardar el estado de cada envío permite
// reanudar una campaña tras un reinicio sin volver a enviar los correos ya
// entregados.
const campaignRecipientSchema = new mongoose.Schema(
  {
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    name: { type: String, default: '', trim: true, maxlength: 120 },
    source: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pendiente', 'enviado', 'fallido'],
      default: 'pendiente',
    },
    error: { type: String, default: '', maxlength: 300 },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

campaignRecipientSchema.index({ campaign: 1, email: 1 }, { unique: true });
campaignRecipientSchema.index({ campaign: 1, status: 1, _id: 1 });

module.exports = mongoose.model('CampaignRecipient', campaignRecipientSchema);
