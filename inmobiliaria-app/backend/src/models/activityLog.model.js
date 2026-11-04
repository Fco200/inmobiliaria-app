'use strict';

const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
  {
    entityType: { type: String, required: [true, 'El tipo de entidad es obligatorio'], trim: true },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'El id de la entidad es obligatorio'],
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'El usuario es obligatorio'],
    },
    action: { type: String, required: [true, 'La acción es obligatoria'], trim: true },
    message: { type: String, trim: true, default: '' },
    data: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

activityLogSchema.index({ entityType: 1, entityId: 1 });
activityLogSchema.index({ user: 1, createdAt: -1 });
activityLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
