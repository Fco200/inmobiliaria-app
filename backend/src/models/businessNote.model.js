'use strict';

const mongoose = require('mongoose');

// Nota / bitácora de un negocio. Se guarda en una colección aparte (en lugar de
// un arreglo dentro de Business) para que el negocio no crezca sin límite y
// para poder listar el historial por etapa con orden y paginación.
const businessNoteSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    stage: { type: String, trim: true, default: '' },
    text: {
      type: String,
      required: [true, 'La nota es obligatoria'],
      trim: true,
      maxlength: [4000, 'La nota es demasiado larga'],
    },
    createdBy: {
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

businessNoteSchema.index({ business: 1, createdAt: -1 });

module.exports = mongoose.model('BusinessNote', businessNoteSchema);
