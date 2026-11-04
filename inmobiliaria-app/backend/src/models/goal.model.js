'use strict';

const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'El usuario es obligatorio'],
    },
    name: {
      type: String,
      required: [true, 'El nombre de la meta es obligatorio'],
      trim: true,
    },
    description: { type: String, trim: true, default: '' },
    image: { type: String, default: null },
    objectiveAmount: {
      type: Number,
      required: [true, 'El monto objetivo es obligatorio'],
      min: [0, 'El monto objetivo no puede ser negativo'],
    },
    startDate: { type: Date, required: [true, 'La fecha de inicio es obligatoria'] },
    endDate: { type: Date, required: [true, 'La fecha límite es obligatoria'] },
    currentResult: { type: Number, min: 0, default: 0 },
    ticketsObjective: { type: Number, min: 0, default: 0 },
    ticketsGenerated: { type: Number, min: 0, default: 0 },
    ticketsCollected: { type: Number, min: 0, default: 0 },
    status: {
      type: String,
      enum: ['activa', 'cumplida', 'vencida', 'cancelada'],
      default: 'activa',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

goalSchema.virtual('advance').get(function advance() {
  if (!this.objectiveAmount) return 0;
  return Math.min(100, (this.currentResult / this.objectiveAmount) * 100);
});

goalSchema.virtual('missingAmount').get(function missingAmount() {
  return Math.max(0, this.objectiveAmount - this.currentResult);
});

goalSchema.virtual('projection').get(function projection() {
  const start = this.startDate ? new Date(this.startDate).getTime() : null;
  const end = this.endDate ? new Date(this.endDate).getTime() : null;
  const now = Date.now();
  if (!start || !end || end <= start || now <= start) return 0;
  const elapsed = (now - start) / (end - start);
  if (elapsed <= 0) return 0;
  const projected = this.currentResult / elapsed;
  return Math.max(0, Math.round(projected));
});

goalSchema.index({ user: 1, status: 1 });
goalSchema.index({ endDate: 1 });

module.exports = mongoose.model('Goal', goalSchema);
