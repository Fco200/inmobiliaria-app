'use strict';

const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'El título de la tarea es obligatorio'],
      trim: true,
    },
    description: { type: String, trim: true, default: '' },
    date: { type: Date, required: [true, 'La fecha es obligatoria'] },
    priority: {
      type: String,
      enum: ['baja', 'media', 'alta', 'urgente'],
      default: 'media',
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'El responsable es obligatorio'],
    },
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      default: null,
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      default: null,
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      default: null,
    },
    status: {
      type: String,
      enum: ['pendiente', 'en_proceso', 'completada', 'cancelada', 'vencida'],
      default: 'pendiente',
    },
    completedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

taskSchema.index({ assignedTo: 1, status: 1 });
taskSchema.index({ date: 1 });
taskSchema.index({ business: 1, client: 1 });

module.exports = mongoose.model('Task', taskSchema);
