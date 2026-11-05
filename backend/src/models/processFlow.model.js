'use strict';

const mongoose = require('mongoose');

// Configuración del flujo de negocios (una sola fila, key = 'businessFlow').
// La define el administrador desde Configuración > Flujo de negocio.
const stageSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, maxlength: 60 },
    label: { type: String, required: true, trim: true, maxlength: 60 },
    color: { type: String, default: '#64748b', maxlength: 20 },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    system: { type: Boolean, default: false },
    // Etapas a las que puede pasar un negocio desde esta. Vacío = cualquiera.
    next: [{ type: String, trim: true }],
  },
  { _id: false }
);

const processFlowSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'businessFlow' },
    stages: { type: [stageSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ProcessFlow', processFlowSchema);
