'use strict';

const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'El usuario es obligatorio'],
    },
    action: {
      type: String,
      enum: ['creacion', 'actualizacion', 'eliminacion', 'consulta', 'login', 'logout', 'otro'],
      required: [true, 'La acción es obligatoria'],
    },
    entity: { type: String, required: [true, 'La entidad es obligatoria'], trim: true },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'El id de la entidad es obligatorio'],
    },
    field: { type: String, trim: true, default: null },
    previousValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
    ip: { type: String, trim: true, default: '' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ entity: 1, entityId: 1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
