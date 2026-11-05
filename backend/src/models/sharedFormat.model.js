'use strict';

const mongoose = require('mongoose');

// Formato compartido: cualquier archivo (PDF, Word, Excel, imagen...) que el
// equipo sube desde el módulo Formatos para que todos lo consulten y descarguen.
// El archivo vive en el almacenamiento persistente (storage.service), no en el
// disco del servidor.
const sharedFormatSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'El nombre del formato es obligatorio'],
      trim: true,
      maxlength: [160, 'El nombre es demasiado largo'],
    },
    fileUrl: { type: String, required: true },
    fileName: { type: String, trim: true, default: '' },
    mimeType: { type: String, trim: true, default: '' },
    size: { type: Number, default: 0 },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

sharedFormatSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SharedFormat', sharedFormatSchema);
