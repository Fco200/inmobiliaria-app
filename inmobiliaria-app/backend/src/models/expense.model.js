'use strict';

const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'El usuario es obligatorio'],
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      default: null,
    },
    activity: { type: String, trim: true, default: '' },
    concept: {
      type: String,
      required: [true, 'El concepto es obligatorio'],
      trim: true,
    },
    category: {
      type: String,
      enum: [
        'gasolina',
        'publicidad',
        'lonas',
        'tarjetas',
        'volantes',
        'imagen',
        'traslados',
        'material',
        'impresiones',
        'otros',
      ],
      default: 'otros',
    },
    amount: {
      type: Number,
      required: [true, 'El monto es obligatorio'],
      min: [0, 'El monto no puede ser negativo'],
    },
    date: { type: Date, required: [true, 'La fecha es obligatoria'] },
    receipt: { type: String, default: null },
    observations: { type: String, trim: true, default: '' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

expenseSchema.index({ user: 1, date: -1 });
expenseSchema.index({ business: 1 });
expenseSchema.index({ category: 1 });

module.exports = mongoose.model('Expense', expenseSchema);
