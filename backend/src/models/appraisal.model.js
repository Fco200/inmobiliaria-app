'use strict';

const mongoose = require('mongoose');

const checklistItemSchema = new mongoose.Schema(
  {
    text: { type: String, trim: true, required: true, maxlength: 240 },
    done: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

const bitacoraSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    userName: { type: String, trim: true, default: '' },
    action: { type: String, trim: true, default: 'nota' },
    message: { type: String, trim: true, required: true, maxlength: 500 },
  },
  { timestamps: true }
);

// Un avalúo por visita del valuador. Una propiedad puede tener varios avalúos
// (historial), por eso no hay índice único por propiedad.
const appraisalSchema = new mongoose.Schema(
  {
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: [true, 'La propiedad es obligatoria'],
      index: true,
    },
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', default: null },
    appraisalDate: { type: Date, required: [true, 'La fecha de avalúo es obligatoria'] },
    appraiser: { type: String, trim: true, required: [true, 'El valuador es obligatorio'], maxlength: 160 },
    appraiserCP: {
      type: String,
      trim: true,
      default: '',
      validate: {
        validator: (value) => !value || /^\d{5}$/.test(value),
        message: 'El código postal del valuador debe tener 5 dígitos',
      },
    },
    constructionM2: { type: Number, min: [0, 'Los m² de construcción no pueden ser negativos'], default: 0 },
    landM2: { type: Number, min: [0, 'Los m² de terreno no pueden ser negativos'], default: 0 },
    concludedValue: { type: Number, min: [0, 'El valor concluido no puede ser negativo'], default: 0 },
    notes: { type: String, trim: true, default: '', maxlength: 2000 },
    checklist: { type: [checklistItemSchema], default: [] },
    bitacora: { type: [bitacoraSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

appraisalSchema.index({ appraisalDate: -1 });

module.exports = mongoose.model('Appraisal', appraisalSchema);
