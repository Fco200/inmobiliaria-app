'use strict';

const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'El nombre del documento es obligatorio'],
      trim: true,
    },
    type: {
      type: String,
      enum: [
        'formato',
        'identificacion',
        'escrituras',
        'avaluo',
        'contratos',
        'comprobantes',
        'bancario',
        'legal',
        'datos_personales',
        'otros',
      ],
      default: 'formato',
    },
    date: { type: Date, default: Date.now },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'El usuario es obligatorio'],
    },
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      default: null,
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      default: null,
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      default: null,
    },
    status: {
      type: String,
      enum: ['pendiente', 'recibido', 'validado', 'rechazado'],
      default: 'pendiente',
    },
    observations: { type: String, trim: true, default: '' },
    fileName: { type: String, trim: true, default: '' },
    fileUrl: { type: String, default: null },
    
    // Campos para plantillas y llenado digital
    isTemplate: { type: Boolean, default: false },
    templateFields: [{
      name: { type: String, trim: true },
      label: { type: String, trim: true },
      type: { type: String, enum: ['text', 'number', 'date', 'select', 'textarea'], default: 'text' },
      options: [{ type: String, trim: true }],
      required: { type: Boolean, default: false },
    }],
    filledData: { type: mongoose.Schema.Types.Mixed, default: null },
    filledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    filledAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

documentSchema.index({ client: 1 });
documentSchema.index({ property: 1 });
documentSchema.index({ business: 1, status: 1 });
documentSchema.index({ uploadedBy: 1 });
documentSchema.index({ isTemplate: 1 });

module.exports = mongoose.model('Document', documentSchema);
